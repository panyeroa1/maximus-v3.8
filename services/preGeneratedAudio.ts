/**
 * NOTE: These are placeholder base64 audio strings representing silent audio.
 * In a real-world scenario, you would generate these once using the Gemini TTS API
 * for each corresponding text phrase and store the resulting base64 strings here.
 * This avoids hitting rate limits for common, static system voice responses.
 */
export const preGeneratedAudio = {
  // "Eburon systems online. Ready for command."
  activated: 'UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=',
  // "Eburon shutting down."
  deactivated: 'UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=',
  // "A critical system error has occurred."
  error: 'UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=',
  // "Target acquired."
  targetAcquired: 'UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=',
  // "Target not found."
  targetNotFound: 'UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=',
};