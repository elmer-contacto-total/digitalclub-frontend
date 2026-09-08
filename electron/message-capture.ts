/**
 * Cola de envío y vigilancia de eliminaciones de las conversaciones capturadas.
 *
 * Todo lo leído de WhatsApp pasa por aquí antes de llegar al servidor. La cola
 * vive en disco, así que sobrevive al cierre de la aplicación y al reinicio del
 * equipo: si el envío falla —por red caída, por las restricciones de la red
 * corporativa o porque el servidor está fuera de servicio— el envío se conserva
 * y se reintenta hasta obtener confirmación. Ningún mensaje se descarta por una
 * falla de envío.
 *
 * Es el mismo comportamiento que ya tiene el aplicativo móvil, que guarda los
 * mensajes localmente con una marca de entregado y solo envía los pendientes.
 *
 * El envío es idempotente: cada mensaje viaja con el identificador que le asigna
 * WhatsApp y el servidor descarta los repetidos, de modo que reintentar un envío
 * ya entregado no duplica nada.
 */
import * as fs from 'fs';
import * as path from 'path';

/** Un mensaje tal como se leyó de la conversación. */
export interface MensajeCapturado {
  whatsappMessageId: string;
  content: string;
  direction: 'INCOMING' | 'OUTGOING';
  sentAt?: string | null;
}

/** Un lote pertenece siempre a UNA conversación. */
export interface LoteCapturado {
  /**
   * Identificador de la conversación tomado de la ficha de contacto: el número
   * cuando WhatsApp lo expone y, en su defecto, el identificador que muestre en
   * su lugar. Es la llave con la que el servidor decide a qué ficha asociarla.
   */
  conversationId: string;
  conversationName?: string | null;
  clientUserId?: number | null;
  agentId: number;
  clientId: number;
  messages: MensajeCapturado[];
}

/** Aviso de que unos mensajes ya registrados desaparecieron de la conversación. */
export interface AvisoDeEliminacion {
  whatsappMessageIds: string[];
  detectedAt: string;
}

/**
 * Un envío pendiente. Se guarda junto con su ruta para que la cola no necesite
 * saber qué lleva dentro: sirve igual para los mensajes y para las eliminaciones.
 */
interface EnvioPendiente {
  ruta: string;
  cuerpo: unknown;
  /** Solo para el registro en consola. */
  descripcion: string;
  /** Momento en que se encoló. Para diagnóstico y para purgar lo muy viejo. */
  encoladoEn: string;
}

type Enviar = (url: string, cuerpo: string) => Promise<{ ok: boolean; status: number }>;

const REINTENTO_MS = 60_000;
const MAX_ENVIOS = 500;         // techo de la cola, para no crecer sin control
const MAX_DIAS = 30;            // más viejo que esto ya no tiene valor de auditoría

const RUTA_MENSAJES = '/api/v1/messages/captured';
const RUTA_ELIMINADOS = '/api/v1/messages/captured/deleted';

export class ColaDeCaptura {
  private cola: EnvioPendiente[] = [];
  private archivo: string;
  private enviando = false;
  private temporizador: NodeJS.Timeout | null = null;

  constructor(
    private carpetaDatos: string,
    private urlBase: string,
    private enviar: Enviar,
  ) {
    this.archivo = path.join(carpetaDatos, 'captured-messages-queue.json');
    this.cargar();
  }

  /** Encola una conversación leída y trata de despacharla enseguida. */
  encolar(lote: LoteCapturado): void {
    if (!lote.messages || lote.messages.length === 0) return;

    this.agregar({
      ruta: RUTA_MENSAJES,
      cuerpo: lote,
      descripcion: `${lote.messages.length} mensajes de ${lote.conversationId}`,
    });
  }

  /** Encola la constancia de los mensajes que desaparecieron. */
  encolarEliminados(ids: string[], detectadoEn?: string): void {
    if (!ids || ids.length === 0) return;

    const aviso: AvisoDeEliminacion = {
      whatsappMessageIds: ids,
      detectedAt: detectadoEn || new Date().toISOString(),
    };
    this.agregar({
      ruta: RUTA_ELIMINADOS,
      cuerpo: aviso,
      descripcion: `${ids.length} eliminaciones`,
    });
  }

  /** Reintenta lo pendiente. Se llama sola cada minuto. */
  async despachar(): Promise<void> {
    if (this.enviando || this.cola.length === 0) return;
    this.enviando = true;

    try {
      // Copia para iterar: lo que falle se devuelve a la cola.
      const pendientes = this.cola.splice(0, this.cola.length);
      const fallidos: EnvioPendiente[] = [];

      for (const envio of pendientes) {
        try {
          const r = await this.enviar(this.urlBase + envio.ruta, JSON.stringify(envio.cuerpo));
          if (r.ok) {
            console.log(`[Captura] entregado: ${envio.descripcion}`);
          } else {
            // Sea cual sea el motivo, el envío se conserva y se reintenta.
            console.warn(`[Captura] servidor respondió ${r.status}, queda en cola: ${envio.descripcion}`);
            fallidos.push(envio);
          }
        } catch (e) {
          console.warn('[Captura] fallo de red, queda en cola:', e);
          fallidos.push(envio);
        }
      }

      if (fallidos.length > 0) {
        this.cola.unshift(...fallidos);
      }
      this.podar();
      this.guardar();
    } finally {
      this.enviando = false;
    }
  }

  iniciar(): void {
    if (this.temporizador) return;
    this.temporizador = setInterval(() => void this.despachar(), REINTENTO_MS);
    void this.despachar();
  }

  detener(): void {
    if (this.temporizador) {
      clearInterval(this.temporizador);
      this.temporizador = null;
    }
  }

  /** Cuántos envíos esperan. Sirve para avisar si la cola crece sin drenar. */
  get pendientes(): number {
    return this.cola.length;
  }

  // ---------------------------------------------------------------- privados

  private agregar(envio: Omit<EnvioPendiente, 'encoladoEn'>): void {
    this.cola.push({ ...envio, encoladoEn: new Date().toISOString() });
    this.podar();
    this.guardar();
    void this.despachar();
  }

  private podar(): void {
    const corte = Date.now() - MAX_DIAS * 24 * 60 * 60 * 1000;
    this.cola = this.cola.filter(e => new Date(e.encoladoEn).getTime() >= corte);
    if (this.cola.length > MAX_ENVIOS) {
      // Se conservan los más recientes: son los que aún tienen valor de gestión.
      const descartados = this.cola.length - MAX_ENVIOS;
      this.cola = this.cola.slice(-MAX_ENVIOS);
      console.warn(`[Captura] la cola superó ${MAX_ENVIOS} envíos, se descartaron ${descartados} antiguos`);
    }
  }

  private cargar(): void {
    try {
      if (!fs.existsSync(this.archivo)) return;
      const datos = JSON.parse(fs.readFileSync(this.archivo, 'utf-8'));
      if (Array.isArray(datos)) {
        // Se ignora lo que no tenga ruta: viene de un formato anterior y ya no
        // se sabría a dónde enviarlo.
        this.cola = datos.filter((e: EnvioPendiente) => e && typeof e.ruta === 'string');
        this.podar();
        console.log(`[Captura] ${this.cola.length} envíos recuperados de la cola en disco`);
      }
    } catch (e) {
      console.error('[Captura] no se pudo leer la cola en disco:', e);
    }
  }

  private guardar(): void {
    try {
      fs.writeFileSync(this.archivo, JSON.stringify(this.cola));
    } catch (e) {
      console.error('[Captura] no se pudo guardar la cola en disco:', e);
    }
  }
}

// ============================================================================
// VIGILANCIA DE MENSAJES ELIMINADOS
// ============================================================================

/** Lo que se ve en la conversación en una pasada del escáner. */
export interface EstadoDelChat {
  /** Identificadores de todos los mensajes a la vista, en el orden en que aparecen. */
  ids: string[];
  /** Los que muestran el aviso de mensaje eliminado. */
  conMarcador: string[];
  /**
   * Direccion de cada mensaje a la vista, segun el DOM ya asentado. Solo trae
   * los que dan una senal clara: la ausencia significa "todavia no se sabe", no
   * "es entrante".
   */
  direcciones: Record<string, 'INCOMING' | 'OUTGOING'>;
}

/**
 * Distingue una eliminación de un simple desplazamiento.
 *
 * WhatsApp solo mantiene dibujados los mensajes cercanos a la vista: los demás
 * los retira y los vuelve a poner al desplazarse. Un mensaje que ya no está a la
 * vista, entonces, no es necesariamente un mensaje eliminado.
 *
 * Para separar un caso del otro se miran los vecinos que tenía el mensaje la
 * última vez que se lo vio. Si alguno sigue en pantalla y él no, desapareció de
 * verdad. Si tampoco están los vecinos, es un desplazamiento y no se concluye
 * nada; solo tras un buen rato sin verlo, y siempre que la conversación muestre
 * el aviso de eliminación, se da por eliminado.
 *
 * Es el mismo criterio con el que ya se detecta la eliminación de los archivos
 * adjuntos.
 */
export class VigilanteDeEliminados {
  private pasada = 0;
  private ultimoVisto = new Map<string, number>();
  private confirmadosEnPantalla = new Set<string>();
  private yaAvisados = new Set<string>();

  /** Empieza a seguir los mensajes que ya quedaron registrados. */
  seguir(ids: string[]): void {
    for (const id of ids) {
      if (this.yaAvisados.has(id) || this.ultimoVisto.has(id)) continue;
      this.ultimoVisto.set(id, this.pasada);
    }
  }

  /**
   * Devuelve los mensajes que se dan por eliminados en esta pasada.
   *
   * Solo cuenta el aviso que WhatsApp pone en el propio mensaje. Antes tambien
   * se deducia de que el mensaje dejara de verse, y eso marcaba conversaciones
   * enteras: WhatsApp rehace tramos de la lista al desplazarse, al cambiar de
   * chat o cuando alguien borra un mensaje vecino, y en esa ventana los demas
   * parecen haber desaparecido. El 7-sep-2026 quedaron 41 de 71 mensajes
   * marcados sin que nadie los hubiera borrado, en tandas de 14, 12 y 11 al
   * mismo milisegundo.
   *
   * Una eliminacion de verdad deja el aviso a la vista de forma permanente, asi
   * que se detecta en cuanto el asesor pasa por delante.
   */
  revisar(estado: EstadoDelChat): string[] {
    this.pasada++;

    const marcados = new Set(estado.conMarcador);
    const nuevos: string[] = [];

    for (const id of estado.ids) {
      if (!this.ultimoVisto.has(id)) continue;   // no lo seguimos

      this.confirmadosEnPantalla.add(id);
      this.ultimoVisto.set(id, this.pasada);

      if (!marcados.has(id)) continue;
      if (this.yaAvisados.has(id)) continue;

      this.yaAvisados.add(id);
      this.olvidar(id);
      nuevos.push(id);
    }

    return nuevos;
  }

  /** Al cambiar de conversación no hay nada que comparar: se parte de cero. */
  olvidarTodo(): void {
    this.pasada = 0;
    this.ultimoVisto.clear();
    this.confirmadosEnPantalla.clear();
    this.yaAvisados.clear();
  }

  private olvidar(id: string): void {
    this.ultimoVisto.delete(id);
    this.confirmadosEnPantalla.delete(id);
  }
}
