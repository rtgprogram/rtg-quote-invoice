// storage/settingsStore.js
import * as FileSystem from "expo-file-system/legacy"; // legacy estable en SDK 54
import React, { useContext, useEffect, useState, createContext } from "react";
import { emitSettingsUpdated } from "./settingsBus";
import { loadQuotes } from "./quotesStore"; // 👈 asegúrate de tener este export
import { listQuotes } from "./quotesStore";  // 👈 importa arriba

const SETTINGS_DIR = FileSystem.documentDirectory + "settings/";
const SETTINGS_FILE = SETTINGS_DIR + "settings.json";
const QUOTES_DIR   = FileSystem.documentDirectory + "quotes/";
const INVOICES_DIR = FileSystem.documentDirectory + "invoices/";

// ================== defaults ==================
export const DEFAULTS = {
  company: { name: "", address: "", email: "", phone: "" },
  taxRate: 0,
  materialsMargin: 0,
  laborMargin: 0,
  paymentMethods: ["", "", ""],
  warranty: "",
  logoUri: null,
  nextSequence: 1,
  updatedAt: Date.now(),
};

// ================== helpers ==================
async function ensureDir() {
  const dirInfo = await FileSystem.getInfoAsync(SETTINGS_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(SETTINGS_DIR, { intermediates: true });
  }
}

async function dirExists(path) {
  try {
    const info = await FileSystem.getInfoAsync(path);
    return !!info.exists && !!info.isDirectory;
  } catch {
    return false;
  }
}

async function listNumbersInDir(dir) {
  const nums = [];
  try {
    if (!(await dirExists(dir))) return nums;

    const entries = await FileSystem.readDirectoryAsync(dir);
    for (const name of entries) {
      const full = dir + name;
      const info = await FileSystem.getInfoAsync(full);

      if (info.isDirectory) {
        // un nivel de profundidad
        try {
          const sub = await FileSystem.readDirectoryAsync(full + "/");
          for (const subname of sub) {
            const m =
              subname.match(/(?:quote|invoice)[-_ ]*(\d+)/i) ||
              subname.match(/(\d{1,})/);
            if (m) nums.push(parseInt(m[1], 10));
          }
        } catch {}
      } else {
        const m =
          name.match(/(?:quote|invoice)[-_ ]*(\d+)/i) ||
          name.match(/(\d{1,})/);
        if (m) nums.push(parseInt(m[1], 10));
      }
    }
  } catch {}
  return nums.filter((n) => Number.isFinite(n));
}

// ================== IO ==================
export async function loadSettings() {
  try {
    await ensureDir();
    const info = await FileSystem.getInfoAsync(SETTINGS_FILE);
    if (!info.exists) return DEFAULTS;
    const content = await FileSystem.readAsStringAsync(SETTINGS_FILE);
    return JSON.parse(content);
  } catch (e) {
    console.log("[settings] load error", e);
    return DEFAULTS;
  }
}

export async function saveSettings(settings) {
  try {
    await ensureDir();

    // 🔒 forzamos que el correlativo sea número siempre
    const payload = {
      ...settings,
      nextSequence: Math.max(1, parseInt(settings.nextSequence, 10) || 1),
    };

    await FileSystem.writeAsStringAsync(
      SETTINGS_FILE,
      JSON.stringify(payload, null, 2)
    );
    emitSettingsUpdated(); // notifica una vez que el write terminó
    return true;
  } catch (e) {
    console.log("[settings] save error", e);
    return false;
  }
}

// ================== Context / Provider ==================
const SettingsContext = createContext({
  settings: DEFAULTS,
  setSettings: () => {},
});

let saveTimer = null; // debouncer global

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULTS);

  useEffect(() => {
    (async () => {
      const s = await loadSettings();
      setSettings(s);
    })();
  }, []);

  // Debounce: evitamos escribir por cada tecla; guardamos una vez tras 600ms
  const updateSettings = (updater) => {
    setSettings((prev) => {
      const next =
        typeof updater === "function" ? updater(prev) : { ...prev, ...updater };

      // 🔒 asegurar tipo numérico del correlativo en memoria también
      //next.nextSequence = Math.max(1, parseInt(next.nextSequence, 10) || 1);

      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        saveSettings(next);
      }, 600);

      return next;
    });
  };

  return (
    <SettingsContext.Provider value={{ settings, setSettings: updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}

// === NUEVO: helpers de secuencia ===
export function parseSeqFromQuoteNumber(qn) {
  const m = String(qn || "").match(/^\d{8}(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
}

export async function bumpSequenceIfNeeded(seqUsed) {
  try {
    if (!Number.isFinite(seqUsed)) return false;
    await ensureDir();
    const s = await loadSettings();
    const curr = parseInt(s.nextSequence ?? 1, 10) || 1;

    if (seqUsed + 1 > curr) {
      const updated = { ...s, nextSequence: seqUsed + 1, updatedAt: Date.now() };
      await saveSettings(updated);
      return true;
    }
    return false;
  } catch (e) {
    console.log("[settings] bumpSequenceIfNeeded error", e);
    return false;
  }
}

// === recalc robusto basado en AsyncStorage ===
export async function recalcSequenceFromHistory() {
  try {
    const quotes = await listQuotes(); // desde quotesStore
    if (!quotes.length) return 1;

    // Extraer solo la parte secuencial de cada quoteNumber
    const maxSeq = quotes.reduce((max, q) => {
      const num = String(q.quoteNumber || "");
      const seqPart = parseInt(num.slice(-4), 10); // últimos 4 dígitos
      return isNaN(seqPart) ? max : Math.max(max, seqPart);
    }, 0);

    return maxSeq + 1; // ✅ solo el correlativo
  } catch (e) {
    console.log("[settings] recalcSequenceFromHistory error", e);
    return 1;
  }
}


{/*}
export async function recalcSequenceFromHistory() {
  try {
    const quotes = await listQuotes();
    if (!quotes.length) return 1;

    let max = 0;
    for (const q of quotes) {
      const raw = String(q.quoteNumber || q.id || "");
      // extrae solo dígitos iniciales (ej: 202509160001)
      const match = raw.match(/(\d{8})(\d+)/); 
      if (match) {
        const seqNum = parseInt(match[2], 10);
        if (!isNaN(seqNum) && seqNum > max) {
          max = seqNum;
        }
      }
    }
    return max + 1;
  } catch (e) {
    console.log("[settings] recalcSequenceFromHistory error", e);
    return 1;
  }
}
*/}