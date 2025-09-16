// src/i18n/fixTranslations.js
const fs = require("fs");
const path = require("path");
const { translations } = require("./translations");

const BASE_LANG = "en"; // idioma base
const base = translations[BASE_LANG];
const allLangs = Object.keys(translations);

let fixed = false;

for (const lang of allLangs) {
  if (lang === BASE_LANG) continue;

  for (const key of Object.keys(base)) {
    if (!(key in translations[lang])) {
      translations[lang][key] = base[key];
      console.log(`🔧 Added missing key "${key}" in [${lang}]`);
      fixed = true;
    }
  }
}

// Guardar archivo actualizado
if (fixed) {
  const outPath = path.join(__dirname, "translations.js");
  const content =
    "export const translations = " +
    JSON.stringify(translations, null, 2) +
    ";\n";

  fs.writeFileSync(outPath, content, "utf8");
  console.log(`✅ Archivo actualizado: ${outPath}`);
} else {
  console.log("🎉 Todas las traducciones ya estaban completas.");
}

//ragregar la spalabras q me falten a transl;ations
// se corre dsd la raiz del proyecto enm terminal:
//node src/i18n/fixTranslations.js
