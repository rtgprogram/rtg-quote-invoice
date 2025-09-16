// storage/SettingsContext.js
import React, { createContext, useContext, useState } from "react";

// Creamos el contexto
const SettingsContext = createContext();

// Proveedor de Settings
export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState({});
  return (
    <SettingsContext.Provider value={{ settings, setSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

// Hook para consumir settings fácilmente
export function useSettings() {
  return useContext(SettingsContext);
}
