// storage/settingsBus.js

let listeners = [];

/**
 * Notifica a todos los suscriptores que hubo cambios en settings.
 */
export function emitSettingsUpdated() {
  if (listeners.length === 0) return;
  listeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.log("[settingsBus] listener error", e);
    }
  });
}

/**
 * Suscribe un callback a los cambios de settings.
 * Devuelve una función para desuscribir.
 */
export function onSettingsUpdated(fn) {
  if (typeof fn !== "function") {
    throw new Error("onSettingsUpdated requiere una función");
  }
  listeners.push(fn);

  // devuelve función para desuscribir
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}
