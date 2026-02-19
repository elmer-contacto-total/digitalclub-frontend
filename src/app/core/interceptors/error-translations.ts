/**
 * Traducciones de mensajes de error del backend (inglés → español).
 *
 * Tres niveles:
 *  1. Exact-match estático (O(1) lookup)
 *  2. Patrones regex dinámicos (para mensajes con parámetros)
 *  3. Fallback: devuelve el mensaje original
 */

// ─── Nivel 1: Traducciones estáticas ───────────────────────────────────────────

const STATIC_TRANSLATIONS: Record<string, string> = {
  // ── Validación de usuario ──
  'Email already exists': 'El email ya está registrado',
  'Phone already exists': 'El teléfono ya está registrado',
  'Email is required': 'El email es requerido',
  'Invalid email format': 'Formato de email inválido',
  'Email must not exceed 255 characters': 'El email no debe exceder 255 caracteres',
  'First name is required': 'El nombre es requerido',
  'First name must be between 1 and 100 characters': 'El nombre debe tener entre 1 y 100 caracteres',
  'Last name is required': 'El apellido es requerido',
  'Last name must be between 1 and 100 characters': 'El apellido debe tener entre 1 y 100 caracteres',
  'Phone is required': 'El teléfono es requerido',
  'Invalid phone format': 'Formato de teléfono inválido',
  'Phone must not exceed 20 characters': 'El teléfono no debe exceder 20 caracteres',
  'Role is required': 'El rol es requerido',
  'Validation failed': 'Error de validación',
  'An unexpected error occurred': 'Ocurrió un error inesperado',
  'Access denied': 'Acceso denegado',
  'Failed to send password reset email': 'Error al enviar email de restablecimiento',
  'Current password is incorrect': 'La contraseña actual es incorrecta',
  'Invalid or expired reset token': 'Token de restablecimiento inválido o expirado',
  'Reset token has expired': 'El token de restablecimiento ha expirado',
  'Assigned user must be a manager or agent': 'El usuario asignado debe ser manager o agente',

  // ── Auth ──
  'Invalid credentials': 'Credenciales inválidas',
  'Email, phone and password are required.': 'Email, teléfono y contraseña son requeridos.',
  'Invalid phone number.': 'Número de teléfono inválido.',
  'Invalid phone, email or password.': 'Teléfono, email o contraseña inválidos.',
  'No token provided': 'Token no proporcionado',
  'Invalid or expired token': 'Token inválido o expirado',
  'User not found': 'Usuario no encontrado',
  'Token validation failed': 'Error al validar el token',

  // ── FileController ──
  'File must be an image': 'El archivo debe ser una imagen',
  'File size must be less than 5MB': 'El archivo no debe exceder 5MB',

  // ── CrmService ──
  'Setting does not belong to this client': 'La configuración no pertenece a este cliente',
  "CRM setting does not belong to user's client": 'La configuración CRM no pertenece al cliente del usuario',

  // ── ImportService ──
  'Empty file or invalid CSV format': 'Archivo vacío o formato CSV inválido',
  'Import must be validated before confirmation': 'La importación debe ser validada antes de confirmar',
  'Import must be validated before processing': 'La importación debe ser validada antes de procesar',
  'No valid records to import': 'No hay registros válidos para importar',
  'No CSV data stored for this import': 'No hay datos CSV almacenados para esta importación',
  'No CSV content available (no S3 key and no csvBase64)': 'No hay contenido CSV disponible',
  'Cannot cancel completed import': 'No se puede cancelar una importación completada',

  // ── MessageTemplateService ──
  'Language not found': 'Idioma no encontrado',
  'Cannot update approved template. Create a new version instead.': 'No se puede actualizar una plantilla aprobada. Cree una nueva versión.',
  'Template has no parameters to update': 'La plantilla no tiene parámetros para actualizar',
  'Only draft or rejected templates can be submitted for approval': 'Solo plantillas en borrador o rechazadas pueden enviarse para aprobación',
  'WhatsApp access token not configured': 'Token de acceso de WhatsApp no configurado',
  'WhatsApp credentials not configured': 'Credenciales de WhatsApp no configuradas',
  'No users found for client': 'No se encontraron usuarios para el cliente',

  // ── ProspectService ──
  'Cannot delete prospect that was upgraded to user': 'No se puede eliminar un prospecto convertido en usuario',
  'Prospect already upgraded to user': 'El prospecto ya fue convertido en usuario',
  'User with this phone already exists': 'Ya existe un usuario con este teléfono',

  // ── RefreshTokenService ──
  'Invalid or revoked refresh token': 'Token de refresco inválido o revocado',
  'Refresh token has expired': 'El token de refresco ha expirado',
  'User account is inactive': 'La cuenta de usuario está inactiva',

  // ── S3/Storage ──
  'S3 Storage is not enabled': 'El almacenamiento S3 no está habilitado',
  'S3 storage is not enabled': 'El almacenamiento S3 no está habilitado',
  'Storage service is not enabled': 'El servicio de almacenamiento no está habilitado',

  // ── AppVersionAdmin ──
  'Version is required': 'La versión es requerida',
  'Download URL or S3 Key is required': 'URL de descarga o clave S3 es requerida',
  'File is empty': 'El archivo está vacío',
  'Filename is required': 'El nombre del archivo es requerido',
  'Version deleted successfully': 'Versión eliminada correctamente',

  // ── CapturedMedia ──
  'Media already exists or could not be saved': 'El medio ya existe o no pudo ser guardado',
  'whatsappMessageId is required': 'whatsappMessageId es requerido',

  // ── TemplateBulkSend ──
  'Template must be approved to send': 'La plantilla debe estar aprobada para enviar',
  'At least one recipient is required': 'Se requiere al menos un destinatario',

  // ── WhatsAppOnboarding ──
  'Failed to exchange code for access token': 'Error al intercambiar código por token de acceso',
  'Access token not found. Please exchange code first.': 'Token de acceso no encontrado. Intercambie el código primero.',
  'Failed to get business ID': 'Error al obtener el ID de negocio',
  'Failed to get WhatsApp Business data': 'Error al obtener datos de WhatsApp Business',
};

// ─── Nivel 2: Patrones dinámicos (regex) ───────────────────────────────────────

const DYNAMIC_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /^Column label '(.+)' already exists$/, replacement: "La etiqueta de columna '$1' ya existe" },
  { pattern: /^Value does not match expected type: (.+)$/, replacement: 'El valor no coincide con el tipo esperado: $1' },
  { pattern: /^Prospect with phone (.+) already exists$/, replacement: 'Ya existe un prospecto con el teléfono $1' },
  { pattern: /^User with phone (.+) already exists$/, replacement: 'Ya existe un usuario con el teléfono $1' },
  { pattern: /^Template with name '(.+)' already exists$/, replacement: "Ya existe una plantilla con el nombre '$1'" },
  { pattern: /^Failed to submit template: (.+)$/, replacement: 'Error al enviar plantilla: $1' },
  { pattern: /^Failed to sync templates: (.+)$/, replacement: 'Error al sincronizar plantillas: $1' },
  { pattern: /^Error reading file: (.+)$/, replacement: 'Error al leer el archivo: $1' },
  { pattern: /^Failed to parse import file data: (.+)$/, replacement: 'Error al procesar datos del archivo: $1' },
  { pattern: /^Version (.+) already exists for platform (.+)$/, replacement: 'La versión $1 ya existe para la plataforma $2' },
  { pattern: /^Failed to upload file: (.+)$/, replacement: 'Error al subir el archivo: $1' },
  { pattern: /^Failed to generate download URL: (.+)$/, replacement: 'Error al generar URL de descarga: $1' },
  { pattern: /^Failed to copy file: (.+)$/, replacement: 'Error al copiar el archivo: $1' },
  { pattern: /^Failed to download file: (.+)$/, replacement: 'Error al descargar el archivo: $1' },
  { pattern: /^File exceeds maximum size of (\d+)MB$/, replacement: 'El archivo excede el tamaño máximo de $1MB' },
  { pattern: /^Invalid file type\. Allowed: (.+)$/, replacement: 'Tipo de archivo inválido. Permitidos: $1' },
  { pattern: /^Recipient (\d+) not found or has no phone$/, replacement: 'Destinatario $1 no encontrado o sin teléfono' },
  { pattern: /^Failed for recipient (\d+): (.+)$/, replacement: 'Error para destinatario $1: $2' },
];

// ─── Nivel 3: Función de traducción ────────────────────────────────────────────

export function translateError(msg: string): string {
  if (!msg) return msg;

  // 1. Exact-match
  const staticMatch = STATIC_TRANSLATIONS[msg];
  if (staticMatch) return staticMatch;

  // 2. Regex patterns
  for (const { pattern, replacement } of DYNAMIC_PATTERNS) {
    if (pattern.test(msg)) {
      return msg.replace(pattern, replacement);
    }
  }

  // 3. Fallback — puede ser un mensaje ya en español o desconocido
  return msg;
}
