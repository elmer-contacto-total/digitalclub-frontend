/**
 * Utilidades de teléfono.
 *
 * En base de datos el teléfono se guarda con el código de país incluido y sin
 * separadores, por ejemplo: "51978511383" = código "51" + número local "978511383".
 *
 * Los formularios manejan dos campos separados (código de país + número local),
 * por lo que necesitamos dividir el valor almacenado al cargar y volver a unirlo
 * al guardar. Unir sin dividir primero provoca duplicar el código (ej. "5151978...").
 */

/** Código de país por defecto (Perú). */
export const DEFAULT_COUNTRY_CODE = '51';

/**
 * Códigos de país soportados para detección del prefijo almacenado.
 * Se prioriza Perú (51); el resto cubre LatAm + USA/Canadá.
 */
const KNOWN_COUNTRY_CODES = [
  '51', '52', '54', '55', '56', '57', '58',
  '591', '593', '595', '598', '1'
];

/** Longitud mínima razonable de un número local (para validar el corte del prefijo). */
const MIN_LOCAL_LENGTH = 6;

/**
 * Divide un teléfono almacenado (código + número) en sus dos partes.
 * Si no se reconoce un prefijo de país, se asume que el valor es el número local
 * y se usa el código por defecto.
 */
export function splitPhone(stored: string | null | undefined): { code: string; number: string } {
  const digits = (stored || '').replace(/[^0-9]/g, '');
  if (!digits) return { code: DEFAULT_COUNTRY_CODE, number: '' };

  // Probar el código más largo primero para evitar cortes incorrectos.
  const sorted = [...KNOWN_COUNTRY_CODES].sort((a, b) => b.length - a.length);
  for (const code of sorted) {
    if (digits.startsWith(code) && digits.length - code.length >= MIN_LOCAL_LENGTH) {
      return { code, number: digits.slice(code.length) };
    }
  }

  return { code: DEFAULT_COUNTRY_CODE, number: digits };
}

/**
 * Une código de país + número local en el formato almacenado en DB ("51978511383").
 * Devuelve cadena vacía si no hay número local.
 */
export function joinPhone(code: string | null | undefined, number: string | null | undefined): string {
  const c = (code || '').replace(/[^0-9]/g, '');
  const n = (number || '').replace(/[^0-9]/g, '');
  if (!n) return '';
  return c ? `${c}${n}` : n;
}
