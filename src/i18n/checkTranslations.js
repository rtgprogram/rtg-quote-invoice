// scripts/checkTranslations.js
import { translations } from "../src/i18n/translations.js";

function checkTranslations(translations) {
  const languages = Object.keys(translations);
  const allKeys = new Set();

  // 1. recolectar todas las claves de todos los idiomas
  for (const lang of languages) {
    Object.keys(translations[lang]).forEach((k) => allKeys.add(k));
  }

  const missing = {};

  // 2. verificar idioma por idioma
  for (const lang of languages) {
    const keys = Object.keys(translations[lang]);
    const missingKeys = [...allKeys].filter((k) => !keys.includes(k));
    if (missingKeys.length > 0) {
      missing[lang] = missingKeys;
    }
  }

  // 3. resultado
  if (Object.keys(missing).length === 0) {
    console.log("✅ Todas las traducciones están completas en todos los idiomas.");
  } else {
    console.log("⚠️ Faltan traducciones:");
    for (const [lang, keys] of Object.entries(missing)) {
      console.log(`- ${lang}: faltan ${keys.length} claves → ${keys.join(", ")}`);
    }
  }
}

checkTranslations(translations);
//para revisar si me falta alguna traduccion en los idiomas:
//desde terminal:
// npm run check:i18n
//
//node src/i18n/checkTranslations.js
