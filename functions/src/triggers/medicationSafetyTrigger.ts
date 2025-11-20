/**
 * Medication safety Firestore trigger intentionally disabled.
 *
 * Safety checks now run in the API/sync layer before writing to Firestore,
 * which prevents infinite loops and duplicate warnings caused by reprocessing
 * the same medication document.
 */
