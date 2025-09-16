// storage/appSettingsStore.js
import * as FileSystem from "expo-file-system";

export const logoTargetPath = FileSystem.documentDirectory + "company-logo.png";

// Configuración por defecto (solo extras, no duplicamos lo de settingsStore.js)
export const DEFAULT_APP_SETTINGS = {
  logoUri: null,
  nextQuoteNumber: 1,
};

// Guardar logo en ruta fija
export async function saveLogo(uri) {
  try {
    await FileSystem.copyAsync({
      from: uri,
      to: logoTargetPath,
    });
    return logoTargetPath;
  } catch (e) {
    console.log("[appSettings] saveLogo error", e);
    return null;
  }
}

// Cargar logo desde disco
export async function loadLogo() {
  try {
    const info = await FileSystem.getInfoAsync(logoTargetPath);
    if (info.exists) return logoTargetPath;
    return null;
  } catch (e) {
    console.log("[appSettings] loadLogo error", e);
    return null;
  }
}

// Borrar logo
export async function deleteLogo() {
  try {
    const info = await FileSystem.getInfoAsync(logoTargetPath);
    if (info.exists) {
      await FileSystem.deleteAsync(logoTargetPath, { idempotent: true });
    }
    return true;
  } catch (e) {
    console.log("[appSettings] deleteLogo error", e);
    return false;
  }
}
