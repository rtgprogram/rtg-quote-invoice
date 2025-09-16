import { Asset } from 'expo-asset';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as MailComposer from 'expo-mail-composer';
import * as SMS from 'expo-sms';
import { onSettingsUpdated } from '../storage/settingsBus';
import { useSettings, loadSettings } from "../storage/settingsStore"; // ✅ agregado loadSettings
import * as FileSystem from "expo-file-system/legacy"; // para traerme el logo
import { useLanguage } from "../src/i18n/LanguageContext";
import React, { createContext, useContext, useState, useEffect, useCallback} from "react";
import { translations } from "../src/i18n/translations";
import { upsertQuote, getQuoteById } from "../storage/quotesStore";


const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState("en");

  const t = (key) => {
    return translations[lang] && translations[lang][key]
      ? translations[lang][key]
      : key;
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

// screens/CreateQuoteScreen.js
import {
  View, Text, TextInput, StyleSheet, ScrollView, Image, TouchableOpacity, Alert,
} from 'react-native';
import { useFocusEffect, useIsFocused, TabActions, CommonActions } from '@react-navigation/native';


const SAMPLE_LOGOS = {
  "logo.png":  require("../assets/logo.png"),
  "logo1.png": require("../assets/logo1.png"),
  "logo2.png": require("../assets/logo2.png"),
  "logo3.png": require("../assets/logo3.png"),
  "logo4.png": require("../assets/logo4.png"),
  "logo5.png": require("../assets/logo5.png"),
};

// ========================== Helpers ==========================
const currencyUSD = (n) =>
  Number(n || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' });

function jumpToQuoteLog(navigation, params = {}) {
  const state = navigation.getState?.();
  if (state?.routeNames?.includes?.('Quote List')) {
    navigation.dispatch(TabActions.jumpTo('Quote List', params));
    return;
  }
  const parent = navigation.getParent?.();
  const pState = parent?.getState?.();
  if (pState?.routeNames?.includes?.('Quote List')) {
    parent.dispatch(TabActions.jumpTo('Quote List', params));
    return;
  }
  (parent ?? navigation).dispatch(CommonActions.navigate('Quote List', params));
}

const MAX_ITEM_NAME = 28;
const MAX_LABOR_DESC = 32;
const ROW_H = 48;

const yyyymmdd = () => {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
};
const buildQuoteNumber = (dateStr, seq, padDigits) =>
  `${dateStr}${String(seq).padStart(Math.max(1, padDigits || 4), '0')}`;

// esta funcion se utiliza para paginado de Pdf
const ROWS_PER_PAGE = 13;

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ====================== PDF HTML ==========================
//================= function buildInvoiceHtmlV2 =============
//===========================================================

async function buildInvoiceHtmlV2({
  items = [],
  laborItems = [],
  totals = {},
  clientName = "",
  clientAddress = "",
  clientEmail = "",
  clientPhone = "",
  quoteNumber = "",
  docType = "quote",
  logoBase64 = "",
  company = {},
  paymentMethods = [],
  warranty = "",
  t = s => s,
} = {}) {
  const ROWS_PER_PAGE = 13;
  const docLabel = docType === "Invoice" ? t("invoice") : t("quoteInvoice");

  // ==== Métodos de pago normalizados ====
  const normalizedPM = Array.isArray(paymentMethods)
    ? paymentMethods
        .map((m) =>
          typeof m === "string"
            ? { label: m, value: "" }
            : (m && typeof m === "object" ? m : null)
        )
        .filter(Boolean)
    : paymentMethods && typeof paymentMethods === "object"
    ? Object.entries(paymentMethods).map(([label, value]) => ({ label, value }))
    : [];

  const methodsHtml =
    (normalizedPM.length ? normalizedPM : [])
      .filter((m) => m?.label || m?.value)
      .map(
        (m) => `
          <div style="margin:4px 0">
            <span style="font-weight:600">${m.label || ""}</span>
            ${m.value ? `: <span>${m.value}</span>` : ""}
          </div>
        `
      )
      .join("") || `<div style="color:#777">${t("noPaymentMethods")}</div>`;

  // ==== Construir filas con márgenes aplicados ====
  const matMargin = (Number(company?.materialsMargin ?? 0) / 100);
  const labMargin = (Number(company?.laborMargin ?? 0) / 100);

  const itemRows = (Array.isArray(items) ? items : []).map((it, i) => {
    const qty = parseFloat(it?.quantity || 0);
    const unit = parseFloat(it?.unitPrice || 0) * (1 + matMargin);
    return {
      section: "materials",
      originalIndex: i,
      desc: it?.name ?? "",
      qty,
      unit,
      line: qty * unit,
    };
  });

  const laborStartIndex = itemRows.length;
  const labRows = (Array.isArray(laborItems) ? laborItems : []).map((it, i) => {
    const qty = parseFloat(it?.hours || 0);
    const unit = parseFloat(it?.unitPrice || 0) * (1 + labMargin);
    return {
      section: "labor",
      originalIndex: laborStartIndex + i,
      desc: it?.description ?? "",
      qty,
      unit,
      line: qty * unit,
    };
  });

  const allRows = [...itemRows, ...labRows];

  // ==== Particionar en páginas ====
  function chunkArray(arr, size) {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
    return chunks;
  }
  const pages = chunkArray(allRows, ROWS_PER_PAGE);

  // ==== Encabezados comunes (por página) ====
  const headerBlock = () => `
    <table style="width:100%;border-collapse:collapse;margin-bottom:12px">
      <tr>
        <td style="vertical-align:middle">
          ${logoBase64 ? `<img src="${logoBase64}" style="width:120px;height:auto" />` : ""}
        </td>
        <td style="vertical-align:middle;text-align:right">
          <div style="font-size:20px;font-weight:700;margin:0">${docLabel} #${quoteNumber}</div>
          <div style="color:#555;font-size:12px">${t("issued")} ${new Date().toLocaleDateString()}</div>
        </td>
      </tr>
    </table>
  `;

  const partiesBlock = () => `
    <table style="width:100%;border-collapse:collapse;margin-bottom:12px">
      <tr>
        <td style="vertical-align:top;width:50%;font-size:12px;border:1px solid #eee;padding:10px">
          <div style="font-weight:700;margin-bottom:6px">${t("from")}</div>
          <div>${company?.name || ""}</div>
          <div>${company?.address || ""}</div>
          <div>${company?.email || ""}${company?.phone ? " · " + company.phone : ""}</div>
        </td>
        <td style="vertical-align:top;width:50%;font-size:12px;border:1px solid #eee;padding:10px">
          <div style="font-weight:700;margin-bottom:6px">${t("billTo")}</div>
          <div>${clientName || ""}</div>
          <div>${clientAddress || ""}</div>
          <div>${clientEmail || ""}${clientPhone ? " · " + clientPhone : ""}</div>
        </td>
      </tr>
    </table>
  `;

  // ==== Bloque final de totales (solo última página) ====
  const finalTotalsHtml = `
    <table style="width:100%;border-collapse:collapse;margin-top:16px">
      <tr>
        <td style="width:55%;vertical-align:top;padding-right:12px">
          <div style="font-weight:700;margin-bottom:6px">${t("paymentMethods")}</div>
          <div style="border:1px solid #eee;border-radius:6px;padding:10px;font-size:13px;line-height:1.35">
            ${methodsHtml}
          </div>
        </td>
        <td style="width:45%;vertical-align:top">
          <table style="width:100%;border-collapse:collapse;margin-top:0;margin-left:auto">
            <tr>
              <td style="padding:6px 8px;font-size:13px">${t("subtotal")}</td>
              <td style="padding:6px 8px;font-size:13px;text-align:right">$${Number(totals?.subtotal ?? 0).toFixed(2)}</td>
            </tr>
            <tr>
              <td style="padding:6px 8px;font-size:13px">${t("tax")} (${totals?.taxRate}%)</td>
              <td style="padding:6px 8px;font-size:13px;text-align:right">$${Number(totals?.tax ?? 0).toFixed(2)}</td>
            </tr>
            <tr>
              <td style="padding:6px 8px;font-size:14px;font-weight:700">${t("total")}</td>
              <td style="padding:6px 8px;font-size:14px;font-weight:700;text-align:right">$${Number(totals?.total ?? 0).toFixed(2)}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    ${
      warranty
        ? `<div style="margin-top:20px;border:1px solid #ddd;padding:10px;text-align:center;font-size:13px;font-weight:600">
             ${t("warrantyLabel")}: ${warranty}
           </div>`
        : ""
    }
  `;

  // ==== Render de páginas ====
  const pagesHtml = pages
    .map((chunk, pageIdx) => {
      const isLast = pageIdx === pages.length - 1;
      const chunkGlobalStart = pageIdx * ROWS_PER_PAGE;
      const startsInLabor =
        chunk.length > 0 &&
        chunk[0].section === "labor" &&
        chunk[0].originalIndex === laborStartIndex;

      // Construir filas
      let bodyRowsHtml = "";
      if (chunk[0]?.section === "materials" && chunk[0].originalIndex === 0) {
        bodyRowsHtml += `
          <tr>
            <td colspan="4" style="border:1px solid #ddd;padding:8px;background:#fafafa;font-weight:700">
              ${t("materials")} (${t("total")}: $${Number(totals?.itemsTotal ?? 0)})
            </td>
          </tr>
        `;
      }
      for (const r of chunk) {
        if (r.section === "labor" && r.originalIndex === laborStartIndex) {
          bodyRowsHtml += `
            <tr>
              <td colspan="4" style="border:1px solid #ddd;padding:8px;background:#fafafa;font-weight:700">
                ${t("labor")} (${t("total")}: $${Number(totals?.laborTotal ?? 0)})
              </td>
            </tr>
          `;
        }
        bodyRowsHtml += `
          <tr>
            <td style="border:1px solid #ddd;padding:8px;font-size:13px">${r.desc}</td>
            <td style="border:1px solid #ddd;padding:8px;font-size:13px;text-align:right">${r.qty}</td>
            <td style="border:1px solid #ddd;padding:8px;font-size:13px;text-align:right">$${r.unit.toFixed(2)}</td>
            <td style="border:1px solid #ddd;padding:8px;font-size:13px;text-align:right">$${r.line.toFixed(2)}</td>
          </tr>
        `;
      }
      if (startsInLabor) {
        bodyRowsHtml =
          `
            <tr>
              <td colspan="4" style="border:1px solid #ddd;padding:8px;background:#fafafa;font-weight:700">
                ${t("labor")} (${t("total")}: $${Number(totals?.laborTotal ?? 0)})
              </td>
            </tr>
          ` + bodyRowsHtml;
      }

      const tableHtml = `
        <table style="width:100%;border-collapse:collapse;margin-top:4px">
          <thead>
            <tr>
              <th style="border:1px solid #ddd;padding:8px;font-size:13px;background:#f3f4f6;text-align:left">${t("description")}</th>
              <th style="border:1px solid #ddd;padding:8px;font-size:13px;background:#f3f4f6;text-align:right">${t("qty")}</th>
              <th style="border:1px solid #ddd;padding:8px;font-size:13px;background:#f3f4f6;text-align:right">${t("unitPrice")}</th>
              <th style="border:1px solid #ddd;padding:8px;font-size:13px;background:#f3f4f6;text-align:right">${t("amount")}</th>
            </tr>
          </thead>
          <tbody>${bodyRowsHtml}</tbody>
        </table>
      `;

      const partialSubtotal = chunk.reduce((acc, r) => acc + Number(r.line || 0), 0);
      const midTotalsHtml = `
        <div style="text-align:right;font-weight:bold;margin-top:6px">
          ${t("subtotal")}: $${partialSubtotal.toFixed(2)}
        </div>
      `;

      return `
        <div style="padding:24px">
          ${headerBlock()}
          ${partiesBlock()}
          ${tableHtml}
          ${isLast ? finalTotalsHtml : midTotalsHtml + `<div style="page-break-after: always;"></div>`}
        </div>
      `;
    })
    .join("");

  return `
    <html>
      <head><meta charset="utf-8" /></head>
      <body style="font-family:-apple-system,Roboto,Arial,sans-serif">
        ${allRows.length ? pagesHtml : `<div style="padding:24px">${t("noItems") || "No items"}</div>`}
      </body>
    </html>
  `;
}


// =============================================================
// ===================== CreateQuoteScreen =====================
// =============================================================
export default function CreateQuoteScreen({ route, navigation }) {
  const { t, setLang } = useLanguage();   // 👈 traducciones + setter
  const { settings: liveSettings, setSettings } = useSettings();// me traigo todo desde AdminPanel
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [description, setDescription] = useState('');

  const [activeTab, setActiveTab] = useState('items');
  const [items, setItems] = useState([]);
  const [laborItems, setLaborItems] = useState([]);
  const [itemName, setItemName] = useState('');
  const [itemQuantity, setItemQuantity] = useState('');
  const [itemUnitPrice, setItemUnitPrice] = useState('');
  const [laborDescription, setLaborDescription] = useState('');
  const [laborHours, setLaborHours] = useState('');
  const [laborUnitPrice, setLaborUnitPrice] = useState('');
  const [parentScrollEnabled, setParentScrollEnabled] = useState(true);

  const [docType, setDocType] = useState('quote'); // ✅ minúsculas consistentes
  const [quoteId, setQuoteId] = useState(null);
  const [quoteNumber, setQuoteNumber] = useState(buildQuoteNumber(yyyymmdd(), 1, 4));
  const isFocused = useIsFocused();

  // 🌐 mini selector
  const [showLangPicker, setShowLangPicker] = useState(false);
  const LANGS = [
    { code: 'en', label: 'EN', flag: '🇺🇸' },
    { code: 'es', label: 'ES', flag: '🇪🇸' },
    { code: 'pt', label: 'PT', flag: '🇵🇹' },
    { code: 'zh', label: '中文', flag: '🇨🇳' },
    { code: 'fr', label: 'FR', flag: '🇫🇷' },
    { code: 'de', label: 'DE', flag: '🇩🇪' },
  ];

  // ====== Lógica previa (ajustada) ======
  const applySettings = useCallback((s) => {
    setSettings(s); // ✅ corregido (antes setAppSettings)

    const isEditing = !!route?.params?.quote || !!quoteId;
    if (!isEditing) {
      const dateStr = yyyymmdd();
      const seq = Math.max(1, parseInt(String(s?.nextSequence ?? 1), 10) || 1);
      const pad = Math.max(1, parseInt(String(s?.padDigits ?? 4), 10) || 4);
      setQuoteNumber(buildQuoteNumber(dateStr, seq, pad));
    }
  }, [quoteId, route?.params?.quote, setSettings]);

// 🔄 Recalcular quoteNumber si cambia nextSequence en settings
  useEffect(() => {
    const isEditing = !!route?.params?.quote || !!quoteId;
    if (!isEditing && liveSettings?.nextSequence) {
      const dateStr = yyyymmdd();
      const seq = Math.max(1, parseInt(String(liveSettings.nextSequence), 10) || 1);
      const pad = Math.max(1, parseInt(String(liveSettings?.padDigits ?? 4), 10) || 4);
      setQuoteNumber(buildQuoteNumber(dateStr, seq, pad));
    }
  }, [liveSettings?.nextSequence, route?.params?.quote, quoteId]);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      (async () => {
        try {
          const s = await loadSettings();
          if (live) {
            applySettings(s);

            // 🔑 Si NO estoy editando → recalcular siempre
            const isEditing = !!route?.params?.quote || !!quoteId;
            if (!isEditing) {
              const dateStr = yyyymmdd();
              const seq = Math.max(1, parseInt(String(s?.nextSequence ?? 1), 10) || 1);
              const pad = Math.max(1, parseInt(String(s?.padDigits ?? 4), 10) || 4);
              setQuoteNumber(buildQuoteNumber(dateStr, seq, pad));
            }
          }
        } catch (e) {
          console.log('[CreateQuote] loadSettings error', e);
        }
      })();
      return () => { live = false; };
    }, [route?.params?.quote, quoteId])
  );

  useEffect(() => {
    let live = true;
    const reload = async () => {
      try {
        const s = await loadSettings();
        if (live) applySettings(s);
      } catch (e) {
        console.log('[CreateQuote] reload settings error', e);
      }
    };
    if (route?.params?.refreshSettings) reload();
    return () => { live = false; };
  }, [route?.params?.refreshSettings, applySettings]);

  useEffect(() => {
    const unsub = onSettingsUpdated(async () => {
      try {
        const s = await loadSettings();
        applySettings(s);
      } catch (e) {
        console.log('[CreateQuote] bus reload error', e);
      }
    });
    return () => unsub();
  }, [applySettings]);

  useFocusEffect(
    useCallback(() => {
      const q = route?.params?.quote;
      if (!q) return;

      setQuoteId(q.id ?? null);
      setQuoteNumber(q.quoteNumber ?? q.id ?? buildQuoteNumber(yyyymmdd(), 1, liveSettings?.padDigits || 4));
      setDocType(q.docType ?? 'Quote');

      setClientName(q.clientName ?? q.client?.name ?? '');
      setClientEmail(q.clientEmail ?? q.client?.email ?? '');
      setClientPhone(q.clientPhone ?? q.client?.phone ?? '');
      setClientAddress(q.clientAddress ?? q.client?.address ?? '');
      setDescription(q.description ?? '');

      setItems(Array.isArray(q.items) ? q.items : []);
      setLaborItems(Array.isArray(q.laborItems) ? q.laborItems : []);
      setActiveTab('items');
    }, [route?.params?.quote, liveSettings?.padDigits])
  );

  const calculateTotals = useCallback(() => {
    const itemsBase = items.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
    const laborBase = laborItems.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);

    const mm = Number(liveSettings?.materialsMargin ?? 0) / 100;
    const lm = Number(liveSettings?.laborMargin ?? 0) / 100;

    const itemsTotal = itemsBase * (1 + mm);
    const laborTotal = laborBase * (1 + lm);

    const subtotal = itemsTotal + laborTotal;
    const taxPct = Number(liveSettings?.taxRate ?? 8.25) / 100;
    const tax = subtotal * taxPct;
    const total = subtotal + tax;

    return {
      itemsTotal: itemsTotal.toFixed(2),
      laborTotal: laborTotal.toFixed(2),
      subtotal: subtotal.toFixed(2),
      tax: tax.toFixed(2),
      total: total.toFixed(2),
      taxRate: Number(liveSettings?.taxRate ?? 0),
    };
  }, [items, laborItems, liveSettings]);

  const totals = calculateTotals();
  
//------- generar Pdf. ---------------------------
const createPdf = async () => {
  try {
    // ====== LOGO a Base64 ======
    let logoBase64 = "";
    try {
      const uri = liveSettings?.logoUri;
      if (uri && uri.startsWith("file://")) {
        const base64 = await FileSystem.readAsStringAsync(uri, { encoding: "base64" });
        logoBase64 = `data:image/png;base64,${base64}`;
      } else {
        let fileName = "logo.png";
        if (uri) {
          fileName = uri.split("/").pop() || uri;
          fileName = fileName.split("?")[0];
          if (!fileName.includes(".")) fileName = fileName + ".png";
        }
        const mod = SAMPLE_LOGOS[fileName] ?? SAMPLE_LOGOS["logo.png"];
        const asset = Asset.fromModule(mod);
        await asset.downloadAsync();
        const base64 = await FileSystem.readAsStringAsync(asset.localUri, { encoding: "base64" });
        logoBase64 = `data:image/png;base64,${base64}`;
      }
    } catch (e) {
      console.log("[createPdf logo error]", e);
    }

    // ====== Generar HTML ======
    const html = await buildInvoiceHtmlV2({
      items,
      laborItems,
      totals,
      clientName,
      clientAddress,
      clientEmail,
      clientPhone,
      quoteNumber,
      docType,
      logoBase64,
      company: liveSettings?.company || {},
      paymentMethods: liveSettings?.paymentMethods || [],
      warranty: liveSettings?.warranty || "",
      t,
    });

    // ====== Generar PDF temporal ======
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    console.log("[createPdf] PDF generado temporal:", uri);

    // ====== Asegurar carpeta quotes/ ======
    const QUOTES_DIR = FileSystem.documentDirectory + "quotes/";
    const dirInfo = await FileSystem.getInfoAsync(QUOTES_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(QUOTES_DIR, { intermediates: true });
    }

    // ====== Construir nombre destino ======
    const today = new Date();
    const yyyymmdd = today.toISOString().slice(0, 10).replace(/-/g, "");
    const paddedSeq = String(liveSettings?.nextSequence ?? 1).padStart(4, "0");

    const sanitize = (str = "") =>
      str.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .slice(0, 40);

    const safeClient = sanitize(clientName);
    const safeDesc = sanitize(description);

    const fileName = `${yyyymmdd}${paddedSeq}_${safeClient}_${safeDesc}.pdf`;
    const targetPath = QUOTES_DIR + fileName;

    // ====== Copiar del cache a quotes/ ======
    await FileSystem.copyAsync({ from: uri, to: targetPath });
    console.log("[createPdf] PDF final guardado en:", targetPath);

    return targetPath;
  } catch (e) {
    console.log("[createPdf] error", e);
    throw e;
  }
};

  {/*ree emplazada 09/16-6.17am
    
    const createPdf = async () => {
    try {
      // ====== LOGO a Base64 (galería + samples) ======
    let logoBase64 = "";
    try {
      const uri = liveSettings?.logoUri;
      console.log("[createPdf] liveSettings.logoUri =", uri);

      if (uri && uri.startsWith("file://")) {
        // 📂 Logo desde galería
        console.log("[createPdf] logo: galería ->", uri);
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: "base64",
        });
        logoBase64 = `data:image/png;base64,${base64}`;
      } else {
        // 🎨 Logo sample o fallback
        let fileName = "logo.png";

        if (uri) {
          fileName = uri.split("/").pop() || uri;
          fileName = fileName.split("?")[0]; // 👈 limpia query params
          if (!fileName.includes(".")) {
            fileName = fileName + ".png";
          }
        }

        console.log("[createPdf] logo: sample/fallback ->", fileName);

        const mod = SAMPLE_LOGOS[fileName] ?? SAMPLE_LOGOS["logo.png"];
        const asset = Asset.fromModule(mod);
        await asset.downloadAsync();
        const base64 = await FileSystem.readAsStringAsync(asset.localUri, {
          encoding: "base64",
        });
        logoBase64 = `data:image/png;base64,${base64}`;

      }
    } catch (e) {
      console.log("[createPdf logo error]", e);
    }

      // generar HTML
      const html = await buildInvoiceHtmlV2({
        items,
        laborItems,
        totals,
        clientName,
        clientAddress,
        clientEmail,
        clientPhone,
        quoteNumber,
        docType,
        logoBase64, // ✅ ya no pasamos logoUri
        company: liveSettings?.company || {},
        paymentMethods: liveSettings?.paymentMethods || [],
        warranty: liveSettings?.warranty || "",
        t,
      });

      // ====== Generar PDF ======
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      console.log("[createPdf] PDF generado en:", uri);

      return uri;
    } catch (e) {
      console.log("[createPdf] error", e);
      throw e;
    }
  };
  */}

  const onGeneratePDF = async () => {
    try {
      const uri = await createPdf();
      await Sharing.shareAsync(uri, { dialogTitle: 'Quote PDF' });
    } catch (e) {
      console.error('PDF error:', e);
      Alert.alert('Error generating PDF', e?.message || 'Please try again');
    }
  };

  const onSendEmail = async () => {
  try {
    const can = await MailComposer.isAvailableAsync();
    if (!can) {
      Alert.alert(t("email"), t("emailNotAvailable"));
      return;
    }

    const uri = await createPdf();

    // 🔑 Traducción correcta del tipo de documento
    const docTypeLabel = docType === "invoice" ? t("invoice") : t("quoteInvoice");

    await MailComposer.composeAsync({
      recipients: clientEmail ? [clientEmail] : [],
      subject: `${docTypeLabel} #${quoteNumber} - ${clientName || t("client")}`,
      body:
        `${t("emailGreeting")} ${clientName || ""},\n\n` +
        `${t("emailAttached")} ${docTypeLabel}.\n\n` +
        `${t("thankYou")},\n${liveSettings?.company?.name || ""}`,
      attachments: [uri],
    });
  } catch (e) {
    console.error("Email error:", e);
    Alert.alert(t("emailError"), e?.message || t("tryAgain"));
  }
};

const onSendSMS = async () => {
  try {
    const ok = await SMS.isAvailableAsync();
    if (!ok) {
      Alert.alert(t("sms"), t("smsNotAvailable"));
      return;
    }

    // 🔑 Traducción correcta del tipo de documento
    const docTypeLabel = docType === "invoice" ? t("invoice") : t("quoteInvoice");

    const descPart = description ? ` ${t("for")} ${description}` : "";
    const emailPart = clientEmail ? ` ${clientEmail}` : t("notAvailable");

    const msg =
      `${docTypeLabel} #${quoteNumber}${descPart} ` +
      `(${t("total")}: ${currencyUSD(totals?.total ?? "0.00")}) ` +
      `${t("sentToEmail")}: ${emailPart}. ${t("haveGreatDay")}`;

    console.log("SMS =>", { docType, docTypeLabel, msg });

    await SMS.sendSMSAsync(clientPhone ? [clientPhone] : [], msg);
  } catch (e) {
    console.error("SMS error:", e);
    Alert.alert(t("smsError"), e?.message || t("tryAgain"));
  }
};


 const handleSave = async () => {
  try {
    // ¿Estoy editando? → consulta el store por id o quoteNumber
    const candidateId = quoteId ?? quoteNumber;
    const existing = await getQuoteById(candidateId);
    const isEditing = !!existing;

    const payload = {
      // Si edito, conservo el id/quoteNumber originales del registro existente
      id: isEditing ? (existing.id ?? existing.quoteNumber) : quoteNumber,
      quoteNumber: isEditing ? existing.quoteNumber : quoteNumber,

      docType,
      clientName,
      clientEmail,
      clientPhone,
      clientAddress,
      description,
      items,
      laborItems,
      totals,
      date: new Date().toISOString(),
    };

    await upsertQuote(payload);

    // ⬆️ Solo incrementar correlativo si es NUEVA (no edición)
    if (!isEditing) {
      const currentSeq = parseInt(liveSettings?.nextSequence ?? 1, 10);
      const nextSeq = Number.isFinite(currentSeq) ? currentSeq + 1 : 2;

      setSettings((prev) => ({
        ...prev,
        nextSequence: nextSeq,
        updatedAt: Date.now(),
      }));
    }

    Alert.alert(t("quoteSavedTitle"), t("quoteSavedMessage"));
  } catch (e) {
    console.log("[CreateQuote] save error", e);
    Alert.alert(t("errorTitle"), t("errorSaveMessage"));
  }
};



  const parseFractionToDecimal = (value) => {
    if (value.includes('/')) {
      const [numerator, denominator] = value.split('/').map(Number);
      if (!isNaN(numerator) && !isNaN(denominator) && denominator !== 0) {
        return parseFloat((numerator / denominator).toFixed(2));
      }
    }
    return parseFloat(parseFloat(value).toFixed(2));
  };

  // ================== ITEMS ==================
  const handleAddItem = useCallback(() => {
    const name = itemName.trim();
    const quantity = parseFloat(itemQuantity);
    const price = parseFloat(itemUnitPrice);

    if (!name || isNaN(quantity) || isNaN(price)) {
      Alert.alert("Validation", "Please fill all Item fields");
      setItemName("");
      setItemQuantity("");
      setItemUnitPrice("");
      return;
    }

    const amount = quantity * price;

    setItems((prev) => [
      ...prev,
      { id: Date.now().toString(), name, quantity, unitPrice: price, amount },
    ]);

    setItemName("");
    setItemQuantity("");
    setItemUnitPrice("");
  }, [itemName, itemQuantity, itemUnitPrice]);

  // ================== LABOR ==================
  const handleAddLabor = useCallback(() => {
    const description = laborDescription.trim();
    const hours = parseFractionToDecimal(laborHours);
    const price = parseFloat(laborUnitPrice);

    if (!description || isNaN(hours) || isNaN(price)) {
      Alert.alert("Validation", "Please fill all Labor fields");
      setLaborDescription("");
      setLaborHours("");
      setLaborUnitPrice("");
      return;
    }

    const amount = hours * price;

    setLaborItems((prev) => [
      ...prev,
      { id: Date.now().toString(), description, hours, unitPrice: price, amount },
    ]);

    setLaborDescription("");
    setLaborHours("");
    setLaborUnitPrice("");
  }, [laborDescription, laborHours, laborUnitPrice]);

  const removeItem = (id) => setItems(items.filter(item => item.id !== id));
  const removeLaborItem = (id) => setLaborItems(laborItems.filter(item => item.id !== id));

// 👇 Corrige resetToNew: solo limpia y genera número, NO toca setSettings
const resetToNew = useCallback(() => {
  setQuoteId(null); 
  setDocType('Quote');
  setClientName(''); 
  setClientEmail(''); 
  setClientPhone(''); 
  setClientAddress('');
  setDescription(''); 
  setItems([]); 
  setLaborItems([]); 
  setActiveTab('items');

  const dateStr = yyyymmdd();
  const seq = Math.max(
    1,
    parseInt(String(liveSettings?.nextSequence ?? 1), 10) || 1
  );
  const pad = Math.max(
    1,
    parseInt(String(liveSettings?.padDigits ?? 4), 10) || 4
  );

  // genera el número actual (usando nextSequence)
  setQuoteNumber(buildQuoteNumber(dateStr, seq, pad));

  // ❌ eliminamos el incremento de nextSequence aquí
}, [liveSettings]);

const onNewHere = useCallback(() => {
  resetToNew();
  navigation.setParams?.({ quote: null, mode: undefined, _ts: Date.now() });
}, [resetToNew, navigation]);

  // ============================= UI =============================
  return (
    <ScrollView contentContainerStyle={styles.container} scrollEnabled={parentScrollEnabled} nestedScrollEnabled keyboardShouldPersistTaps="handled">
      <View style={styles.headerContainer}>
        {/*console.log("[CreateQuote] logoUri:", liveSettings?.logoUri); RTG test line */}
        <Image
          key={`${liveSettings?.logoUri || "default"}_${liveSettings?.updatedAt || "0"}`}
          source={
            liveSettings?.logoUri
              ? { uri: liveSettings.logoUri }
              : require("../assets/logo.png")
          }
          style={[styles.logo, { marginTop: 30, marginBottom: 30 }]}
          resizeMode="contain"
        />
        <View style={styles.headerRight}>
          <Text style={styles.screenTitle}>{quoteNumber}</Text>
        </View>
      </View>

      <View style={styles.clientContainer}>
        <View style={[styles.typeRow, { justifyContent: 'flex-start', alignItems: 'center' }]}>
         {/* QUOTE */}
          <TouchableOpacity
            style={[styles.typeOption, { marginRight: 6 }]}
            onPress={() => setDocType("quote")}
          >
            <View style={[styles.checkbox, docType === "quote" && styles.checkboxChecked]}>
              {docType === "quote" && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.typeLabel}>{t("quoteInvoice")}</Text>
          </TouchableOpacity>

          {/* INVOICE */}
          <TouchableOpacity
            style={[styles.typeOption, { marginRight: 12 }]}
            onPress={() => setDocType("invoice")}
          >
            <View style={[styles.checkbox, docType === "invoice" && styles.checkboxChecked]}>
              {docType === "invoice" && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.typeLabel}>{t("invoice")}</Text>
          </TouchableOpacity>
        <View style={styles.actionsRow}>
                {/* ＋NEW */}
                <TouchableOpacity onPress={onNewHere} style={[styles.newBtn, { marginLeft: 20 }]} activeOpacity={0.85}>
                  <Text style={styles.newBtnText}>{t("newPlus")}</Text>
                </TouchableOpacity>
              
                {/* 🌐 QUICK LANGUAGE */}
                <TouchableOpacity
                  onPress={() => setShowLangPicker((s) => !s)}
                  style={styles.langQuickBtn}
                  activeOpacity={0.85}
                >
                  <Text style={styles.langQuickTxt}>🌐</Text>
                </TouchableOpacity>
              </View>
        </View>
        {/* mini menú de idiomas */}
        {showLangPicker && (
          <View style={styles.langPicker}>
            {LANGS.map((l) => (
              <TouchableOpacity
                key={l.code}
                style={styles.langChip}
                onPress={() => { setLang(l.code); setShowLangPicker(false); }}
                activeOpacity={0.85}
              >
                <Text style={styles.langChipText}>{l.flag} {l.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <TextInput style={styles.input} placeholder={t("clientName")} value={clientName} onChangeText={setClientName} />
        <View style={styles.row}>
          <TextInput style={[styles.input, { flex: 1, marginRight: 5 }]} placeholder={t("email")} keyboardType="email-address" value={clientEmail} onChangeText={setClientEmail} />
          <TextInput
            style={[{ flex: 1, marginLeft: 5 }, styles.input, styles.phoneInput]}
            placeholder={t("phone")}
            keyboardType="phone-pad"
            value={clientPhone}
            onChangeText={(tval) => {
              // permitir solo dígitos y "+"
              const cleaned = tval.replace(/[^0-9+]/g, "");
              setClientPhone(cleaned);
            }}
            onBlur={() => {
              const raw = String(clientPhone || "").replace(/[^0-9+]/g, "");
              let formatted = raw;

              // si empieza sin "+" y tiene 10 dígitos, asumimos formato US
              if (/^\d{10}$/.test(raw)) {
                formatted = `+1(${raw.slice(0, 3)})${raw.slice(3, 6)}-${raw.slice(6)}`;
              }

              // si empieza con "+" (internacional) → lo dejamos como está
              setClientPhone(formatted);
            }}
            maxLength={20} // 👈 puedes subir más si lo necesitas (25–30)
            autoCapitalize="none"
          />

        </View>
        <TextInput style={styles.input} placeholder={t("address")} value={clientAddress} onChangeText={setClientAddress} />
      </View>

      <Text style={styles.sectionTitle}>{t("projectDescription")}</Text>
      <TextInput style={styles.input} placeholder={t("projectDescription")} value={description} onChangeText={setDescription} />

      <View style={styles.totalRow}>
        <Text>{t("tax")} ({Number(liveSettings?.taxRate ?? 0).toFixed(2)}%): {currencyUSD(totals.tax)}</Text>
        <Text style={{ fontWeight: 'bold' }}>{t("total")}: {currencyUSD(totals.total)}</Text>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity style={[styles.tabButton, activeTab === 'items' && styles.tabActive]} onPress={() => setActiveTab('items')}>
          <Text style={styles.tabText}>{t("materials")} ({currencyUSD(totals.itemsTotal)})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabButton, activeTab === 'labor' && styles.tabActive]} onPress={() => setActiveTab('labor')}>
          <Text style={styles.tabText}>{t("labor")} ({currencyUSD(totals.laborTotal)})</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'items' && (
        <View>
          <View style={styles.itemRow}>
            <TextInput
              style={[styles.input, styles.itemNameInput]}
              placeholder={t("description")}
              value={itemName}
              onChangeText={(tval) => setItemName(tval.slice(0, MAX_ITEM_NAME))}
              maxLength={MAX_ITEM_NAME}
            />
            <TextInput
              style={[styles.input, styles.itemQtyInput]}
              placeholder={t("qty")}
              value={itemQuantity}
              onChangeText={setItemQuantity}
              keyboardType="numeric"
            />
            <TextInput
              style={[styles.input, styles.itemPriceInput]}
              placeholder={t("unitPrice")}
              value={itemUnitPrice}
              onChangeText={setItemUnitPrice}
              keyboardType="numeric"
            />
          </View>
          <TouchableOpacity style={styles.button} onPress={handleAddItem}>
            <Text style={styles.buttonText}>{t("addItem")}</Text>
          </TouchableOpacity>
          <View style={[styles.scrollListWrapper, { overflow: 'hidden' }]}>
            <ScrollView
              style={{ height: 3 * ROW_H }}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
              onTouchStart={() => setParentScrollEnabled(false)}
              onTouchEnd={() => setParentScrollEnabled(true)}
              onScrollEndDrag={() => setParentScrollEnabled(true)}
              onMomentumScrollEnd={() => setParentScrollEnabled(true)}
            >
              {items.map((it) => {
                const margin = (liveSettings?.materialsMargin ?? 0) / 100;
                const amountWithMargin = parseFloat(it.amount || 0) * (1 + margin);

                return (
                    <View key={it.id} style={styles.listRow}>
                    <Text
                        style={styles.truncatedText}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                    >
                        {`${it.name} - ${currencyUSD(amountWithMargin)}`}
                    </Text>
                    <TouchableOpacity onPress={() => removeItem(it.id)}>
                        <Text style={styles.deleteIcon}>🗑️</Text>
                    </TouchableOpacity>
                    </View>
                );
                })}
            </ScrollView>
          </View>
        </View>
      )}

      {activeTab === 'labor' && (
        <View>
          <View style={styles.laborRow}>
            <TextInput
              style={[styles.input, styles.laborDescInput]}
              placeholder={t("description")}
              value={laborDescription}
              onChangeText={(tval) => setLaborDescription(tval.slice(0, MAX_LABOR_DESC))}
              maxLength={MAX_LABOR_DESC}
            />
            <TextInput
              style={[styles.input, styles.laborHoursInput]}
              placeholder={t("hours")}
              value={laborHours}
              onChangeText={setLaborHours}
              keyboardType="numeric"
            />
            <TextInput
              style={[styles.input, styles.laborPriceInput]}
              placeholder={t("unitPrice")}
              value={laborUnitPrice}
              onChangeText={setLaborUnitPrice}
              keyboardType="numeric"
            />
          </View>
          <TouchableOpacity style={styles.button} onPress={handleAddLabor}>
            <Text style={styles.buttonText}>{t("addLabor")}</Text>
          </TouchableOpacity>
          <View style={[styles.scrollListWrapper, { overflow: 'hidden' }]}>
            <ScrollView
              style={{ height: 3 * ROW_H }}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
              onTouchStart={() => setParentScrollEnabled(false)}
              onTouchEnd={() => setParentScrollEnabled(true)}
              onScrollEndDrag={() => setParentScrollEnabled(true)}
              onMomentumScrollEnd={() => setParentScrollEnabled(true)}
            >
             {laborItems.map((item) => {
                const margin = (liveSettings?.laborMargin ?? 0) / 100;
                const amountWithMargin = parseFloat(item.amount || 0) * (1 + margin);

                return (
                    <View key={item.id} style={styles.listRow}>
                    <Text
                        style={styles.truncatedText}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                    >
                        {`${item.description} - ${currencyUSD(amountWithMargin)}`}
                    </Text>
                    <TouchableOpacity onPress={() => removeLaborItem(item.id)}>
                        <Text style={styles.deleteIcon}>🗑️</Text>
                    </TouchableOpacity>
                    </View>
                );
                })}

            </ScrollView>
          </View>
        </View>
      )}

      <View style={styles.buttonRow}>
        {[
          { label: t("generatePdf"), onPress: onGeneratePDF },
          { label: t("sendEmail"), onPress: onSendEmail },
          { label: t("sendSms"), onPress: onSendSMS },
          { label: t("saveQuote"), onPress: handleSave },
        ].map(({ label, onPress }) => (
          <TouchableOpacity key={label} style={styles.buttonSmall} onPress={onPress} activeOpacity={0.85}>
            <Text style={styles.buttonText}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

// ======================= Styles =======================
const styles = StyleSheet.create({
  laborRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  laborDescInput: { flex: 5, marginRight: 6 },
  laborHoursInput: { flex: 1, marginRight: 6 },
  laborPriceInput: { flex: 4 },
  truncatedText: { flex: 1, fontSize: 16, overflow: 'hidden', marginRight: 5 },
  scrollListWrapper: { maxHeight: 240, borderColor: '#ddd', borderWidth: 1, borderRadius: 6, marginBottom: 10, padding: 6 },
  container: { backgroundColor: '#fff', paddingTop: 40, paddingHorizontal: 20, flexGrow: 1 },
  headerContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: -20 },
  headerRight: { alignItems: 'flex-end' },
  //newBtn: { marginTop: 6, backgroundColor: '#eee', paddingVertical: 11, paddingHorizontal: 10, borderRadius: 6 },
  //newBtnText: { fontWeight: '700' },
  logo: { width: 160, height: 60 },
  screenTitle: { fontSize: 20, fontWeight: 'bold' },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginTop: 14, marginBottom: 5 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 10, fontSize: 16, marginBottom: 12 },
  button: { backgroundColor: '#d06201ff', padding: 10, borderRadius: 6, alignItems: 'center', marginBottom: 12 },
  buttonSmall: { backgroundColor: '#d06201ff', padding: 10, borderRadius: 6, alignItems: 'center', marginBottom: 12, flex: 1, marginHorizontal: 4 },
  buttonText: { color: '#fff', fontWeight: 'bold' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  tabContainer: { flexDirection: 'row', marginVertical: 10 },
  tabButton: { flex: 1, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#ccc' },
  tabActive: { backgroundColor: '#eee' },
  tabText: { fontWeight: 'bold' },
  listRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  deleteIcon: { fontSize: 18, color: 'red', paddingLeft: 10 },
  buttonRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20, flexWrap: 'wrap' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 10 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  itemNameInput: { flex: 5, marginRight: 6 },
  itemQtyInput: { flex: 1, marginRight: 6 },
  itemPriceInput: { flex: 2 },
  typeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  typeToggle: { flexDirection: 'row', alignItems: 'center' },
  typeOption: { flexDirection: 'row', alignItems: 'center', marginLeft: 10 },
  checkbox: { width: 18, height: 18, borderWidth: 1, borderColor: '#ccc', borderRadius: 4, alignItems: 'center', justifyContent: 'center', marginRight: 6, backgroundColor: '#fff' },
  checkboxChecked: { backgroundColor: '#d06201ff', borderColor: '#d06201ff' },
  checkmark: { color: '#fff', fontSize: 12, fontWeight: '700', lineHeight: 12 },
  typeLabel: { fontSize: 14, fontWeight: 'bold' },
  clientContainer: { marginBottom: 6 },
  phoneInput: { fontSize: 14 },
  //------- +New Btn + Language
  actionsRow: {flexDirection: "row", alignItems: "center", marginLeft: -18,},
  // separación hacia el 🌐
  newBtn: {paddingHorizontal: 10,  paddingVertical: 6,  backgroundColor: "#f0f0f0",  borderRadius: 6,  marginRight: 4,},
  newBtnText: {fontWeight: "bold", fontSize: 16,},
  //------- 🌐 quick language styles
  langQuickBtn: {marginLeft: 8,backgroundColor: '#eee',paddingVertical: 8,paddingHorizontal: 16,justifyContent: "center",alignItems: "center",borderRadius: 6,},
  langQuickTxt: { fontWeight: '700', fontSize: 14 },

  langPicker: {  flexDirection: 'row',flexWrap: 'wrap',marginBottom: 8,marginTop: 4,gap: 6,},
  langChip: {borderWidth: 1,borderColor: '#ddd',borderRadius: 16,paddingVertical: 4,paddingHorizontal: 10,marginRight: 6,marginTop: 6,backgroundColor: '#fafafa',},
  langChipText: { fontSize: 12, fontWeight: '600' },
});
