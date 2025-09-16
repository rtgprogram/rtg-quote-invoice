// screens/AdminPanelScreen.js
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { useSettings } from "../storage/settingsStore";
import { recalcSequenceFromHistory } from "../storage/settingsStore";
import { emitSettingsUpdated } from "../storage/settingsBus";
import { useLanguage } from "../src/i18n/LanguageContext"; // 👈 idioma
import { Asset } from "expo-asset"; // samples Logo
import React, { useState, useEffect } from "react";



const PAD_DIGITS = 4;
//////////////////////////////////////////////////////////////////////////////////
//////////////.  INICIO DEL COMPONENTE  /////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////

export default function AdminPanelScreen({ navigation }) {
  const { settings, setSettings } = useSettings();
  const [saving, setSaving] = useState(false);
  const [loadingLogo, setLoadingLogo] = useState(false);

  const { t, setLang } = useLanguage(); // 👈 usamos traducciones
  //const [localSeq, setLocalSeq] = useState(String(settings.nextSequence ?? ""));
  const [localSeq, setLocalSeq] = useState(String(settings?.nextSequence ?? "1"));

    useEffect(() => {
    setLocalSeq(String(settings?.nextSequence ?? ""));
    }, [settings?.nextSequence]);


  // correciones para  historial de corelativo
  const [seqDraft, setSeqDraft] = useState(String(settings?.nextSequence ?? 1));
    useEffect(() => {
    setSeqDraft(String(settings?.nextSequence ?? ""));
    }, [settings?.nextSequence]);

    const handleFromHistory = async () => {
        try {
            const next = await recalcSequenceFromHistory(); // ← devuelve SOLO el correlativo (3, 4, …)
            setLocalSeq(String(next)); // UI
            setSettings(prev => ({ ...prev, nextSequence: next, updatedAt: Date.now() })); // persiste
            Alert.alert(t("quoteSequence"), `${t("nextQuoteNumber")}: ${next}`);
        } catch (e) {
            console.log("[AdminPanel] recalc error", e);
            Alert.alert(t("quoteSequence"), t("recalcError"));
        }
    };


  // ===== helpers de estado =====
  const setVal = (k, v) =>
    setSettings((prev) => ({
      ...prev,
      [k]: v,
    }));

  const setCompany = (k, v) =>
    setSettings((prev) => ({
      ...prev,
      company: { ...(prev.company || {}), [k]: v },
    }));

  const setPM = (i, v) =>
    setSettings((prev) => {
      const arr = [...(prev.paymentMethods || ["", "", ""])];
      arr[i] = v;
      return { ...prev, paymentMethods: arr };
    });
  // ===== Sample Logos disponibles =====
  const SAMPLE_LOGOS = [
    require("../assets/logo1.png"),
    require("../assets/logo2.png"),
    require("../assets/logo3.png"),
    require("../assets/logo4.png"),
    require("../assets/logo5.png"),
  ];

  // ===== Logo =====
  const onPickLogo = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm?.granted) {
        Alert.alert("Permission required", "You must allow access to the gallery.");
        return;
      }

      const res = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        quality: 0.9,
        mediaTypes: ["images"],
      });
      if (res.canceled || !res.assets?.[0]?.uri) return;

      setLoadingLogo(true);

      const pickedUri = res.assets[0].uri;
      const manipulated = await ImageManipulator.manipulateAsync(pickedUri, [], {
        compress: 1,
        format: ImageManipulator.SaveFormat.PNG,
      });

      const logoTargetPath = FileSystem.documentDirectory + "company-logo.png";
      try {
        await FileSystem.copyAsync({ from: manipulated.uri, to: logoTargetPath });
        setVal("logoUri", logoTargetPath);
      } catch (err) {
        console.log("[AdminPanel] logo copy error", err);
        setVal("logoUri", manipulated.uri); // fallback
      }
    } catch (e) {
      console.log("[AdminPanel] pick logo error", e);
      Alert.alert("Logo", e?.message ?? "Logo could not be selected");
    } finally {
      setLoadingLogo(false);
    }
  };

  // ===== Secuencia =====
  const onResetSeq = () => {
    setLocalSeq("1"); // UI inmediata
    setSettings(prev => ({ ...prev, nextSequence: 1, updatedAt: Date.now() })); // persiste
    };

   const onRecalcSeq = async () => {
    try {
        const next = await recalcSequenceFromHistory();

        setSeqDraft(String(next));
        setVal("nextSequence", next);

        // persistencia inmediata
        setSettings((prev) => ({
        ...prev,
        nextSequence: next,
        updatedAt: Date.now(),
        }));

        Alert.alert(t("quoteSequence"), `${t("nextQuoteNumber")}: ${next}`);
    } catch (e) {
        console.log("[AdminPanel] recalc error", e);
        Alert.alert(t("quoteSequence"), t("recalcError"));
    }
    };

  // ===== Guardar =====
  const onSave = async () => {
    try {
      setSaving(true);

      const nextSequence = Math.max(
        1,
        parseInt(String(settings.nextSequence ?? "1"), 10) || 1
      );
      const taxRate = Number(String(settings.taxRate ?? "0").replace(/[^0-9.]/g, ""));
      const materialsMargin = Number(
        String(settings.materialsMargin ?? "0").replace(/[^0-9.]/g, "")
      );
      const laborMargin = Number(
        String(settings.laborMargin ?? "0").replace(/[^0-9.]/g, "")
      );
      const pm = Array.isArray(settings.paymentMethods)
        ? settings.paymentMethods.map((s) => String(s || "").trim()).slice(0, 3)
        : ["", "", ""];

      const payload = {
        ...settings,
        nextSequence,
        taxRate,
        materialsMargin,
        laborMargin,
        paymentMethods: pm,
        updatedAt: Date.now(),
      };

      setSettings(payload);

      emitSettingsUpdated();

      const params = { refreshSettings: Date.now() };
      const parent = navigation.getParent?.();
      (parent ?? navigation).navigate("Main", {
        screen: "CreateQuote",
        params,
      });

    } catch (e) {
      console.log("[AdminPanel] save error", e);
      Alert.alert("Error", e?.message ?? "Could not save");
    } finally {
      setSaving(false);
    }
  };
  // samples Logo
  const onSelectSampleLogo = async (src, idx) => {
  try {
    const asset = Asset.fromModule(src);
    await asset.downloadAsync(); // asegura que está disponible en disco
    const logoTargetPath = FileSystem.documentDirectory + `sample-logo-${idx}.png`;

    await FileSystem.copyAsync({
      from: asset.localUri,
      to: logoTargetPath,
    });

    setVal("logoUri", logoTargetPath);
  } catch (e) {
    console.log("[AdminPanel] sample logo error", e);
    Alert.alert("Logo", "Could not load sample logo");
  }
};


  // ===== UI =====
  if (!settings || !settings.company) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#d06201" />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.headerContainer}>
        <Image
         key={settings.logoUri || "default"}
            source={
                settings?.logoUri
                ? { uri: settings.logoUri }
                : require("../assets/logo.png")
            }
            style={[styles.logo, { marginTop: 40, marginBottom: 10 }]}
            resizeMode="contain"
        />
        <Text style={[styles.screenTitle, { marginTop: 30 }]}>{t("adminPanel")}</Text>
      </View>

     {/* ===== Language Switch (3x2 grid) ===== */}
      <View style={styles.langWrap}>
        <TouchableOpacity onPress={() => setLang("en")} style={styles.langBtn}><Text>🇺🇸 EN</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setLang("es")} style={styles.langBtn}><Text>🇪🇸 ES</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setLang("pt")} style={styles.langBtn}><Text>🇵🇹 PT</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setLang("zh")} style={styles.langBtn}><Text>🇨🇳 中文</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setLang("fr")} style={styles.langBtn}><Text>🇫🇷 FR</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setLang("de")} style={styles.langBtn}><Text>🇩🇪 DE</Text></TouchableOpacity>
      </View>



      {/* ===== Quote Number Sequence ===== */}
      <Text style={styles.sectionTitle}>{t("quoteSequence")}</Text>
      <View style={styles.row3}>
        <TextInput
          style={[styles.input, { flex: 1, height: 44, marginRight: 6 }]}
          keyboardType="number-pad"
          maxLength={PAD_DIGITS}
          placeholder="Next"
          value={localSeq}
            onChangeText={(t) => {
                // filtra solo números y actualiza el estado local
                const clean = t.replace(/[^0-9]/g, "").slice(0, PAD_DIGITS);
                setLocalSeq(clean);
            }}
            onBlur={() => {
                // guarda en settings solo cuando el valor sea válido
                const parsed = parseInt(localSeq, 10);
                if (!isNaN(parsed)) {
                setSettings((prev) => ({ ...prev, nextSequence: parsed }));
                }
            }}
        />
        <TouchableOpacity
          style={[styles.input, styles.btnLikeInput, { flex: 1, marginHorizontal: 3 }]}
          onPress={onResetSeq} // aqui quite onResetSeq
          activeOpacity={0.85}
        >
          <Text style={styles.btnSeqTxt}>{t("startIn1")}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.input, styles.btnLikeInput, { flex: 1.3, marginLeft: 6 }]}
          onPress={handleFromHistory}
          activeOpacity={0.85}
        >
          <Text style={styles.btnSeqTxt}>FromHistory</Text>
        </TouchableOpacity>
      </View>

      {/* ===== Taxes & Margins ===== */}
      <Text style={styles.sectionTitle}>{t("taxesMargins")}</Text>
      <View style={styles.row3}>
        <Text style={styles.labelCenter}>{t("taxesPct")}</Text>
        <Text style={styles.labelCenter}>{t("materialsPct")}</Text>
        <Text style={styles.labelCenter}>{t("laborPct")}</Text>
      </View>
      <View style={styles.row3}>
        <TextInput
          style={[styles.input, { flex: 1, marginRight: 6 }]}
          keyboardType="decimal-pad"
          placeholder="0"
          value={String(settings.taxRate ?? "")}
          onChangeText={(t) => setVal("taxRate", t.replace(/[^0-9.]/g, ""))}
        />
        <TextInput
          style={[styles.input, { flex: 1, marginHorizontal: 3 }]}
          keyboardType="decimal-pad"
          placeholder="0"
          value={String(settings.materialsMargin ?? "")}
          onChangeText={(t) => setVal("materialsMargin", t.replace(/[^0-9.]/g, ""))}
        />
        <TextInput
          style={[styles.input, { flex: 1, marginLeft: 6 }]}
          keyboardType="decimal-pad"
          placeholder="0"
          value={String(settings.laborMargin ?? "")}
          onChangeText={(t) => setVal("laborMargin", t.replace(/[^0-9.]/g, ""))}
        />
      </View>

      {/* ===== Company ===== */}
      <TextInput
        style={styles.input}
        value={settings.company?.name ?? ""}
        onChangeText={(t) => setCompany("name", t)}
        placeholder={t("companyName")}
      />
      <TextInput
        style={styles.input}
        value={settings.company?.address ?? ""}
        onChangeText={(t) => setCompany("address", t)}
        placeholder={t("address")}
      />
      <TextInput
        style={styles.input}
        keyboardType="email-address"
        value={settings.company?.email ?? ""}
        onChangeText={(t) => setCompany("email", t)}
        placeholder={t("email")}
      />
      <TextInput
        style={styles.input}
        keyboardType="phone-pad"
        value={settings.company?.phone ?? ""}
        onChangeText={(t) => setCompany("phone", t)}
        placeholder={t("phone")}
      />

      {/* ===== Payment Methods ===== */}
      <Text style={styles.sectionTitle}>{t("paymentMethods")}</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g., ZELLE: 555.555.44.33 / John Doe"
        value={settings.paymentMethods?.[0] ?? ""}
        onChangeText={(t) => setPM(0, t)}
      />
      <TextInput
        style={styles.input}
        placeholder="e.g., VENMO: @johndoe"
        value={settings.paymentMethods?.[1] ?? ""}
        onChangeText={(t) => setPM(1, t)}
      />
      <TextInput
        style={styles.input}
        placeholder="e.g., Cash / Check / Credit Cards"
        value={settings.paymentMethods?.[2] ?? ""}
        onChangeText={(t) => setPM(2, t)}
      />

      {/* ===== Warranty ===== */}
      <Text style={styles.sectionTitle}>{t("warranty")}</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g., 12 months / 2 years / 90 days"
        value={settings.warranty ?? ""}
        onChangeText={(t) => setVal("warranty", t)}
      />

      {/* ===== Logo ===== */}
      <Text style={styles.sectionTitle}>{t("logo")}</Text>
      <View style={{ alignItems: "center", marginBottom: 8 }}>
        {loadingLogo ? (
          <ActivityIndicator size="large" color="#d06201" style={{ marginVertical: 20 }} />
        ) : settings.logoUri ? (
          <Image source={{ uri: settings.logoUri }} style={styles.logoPreview} resizeMode="contain" />
        ) : (
          <View style={styles.logoBox}>
            <Text style={{ color: "#999" }}>{t("preview")}</Text>
          </View>
        )}
      </View>
      <TouchableOpacity style={styles.button} onPress={onPickLogo}>
        <Text style={styles.buttonText}>{t("chooseLogo")}</Text>
      </TouchableOpacity>
      <Text style={styles.hintText}>
        {settings?.logoUri ? `Logo: ${String(settings.logoUri)}` : t("usingDefaultLogo")}
      </Text>
      {/* ===== Sample Logos ===== */}
      <Text style={styles.sectionTitle}>{t("sampleLogos")}</Text>
      <View style={styles.sampleLogosWrap}>
        {SAMPLE_LOGOS.map((src, idx) => (
          <TouchableOpacity
            key={idx}
            onPress={() => setVal("logoUri", Image.resolveAssetSource(src).uri)}
            style={[
              styles.sampleLogoBox,
              settings.logoUri === Image.resolveAssetSource(src).uri && styles.sampleLogoSelected
            ]}
          >
            <Image source={src} style={styles.sampleLogo} resizeMode="contain" />
          </TouchableOpacity>
        ))}
      </View>
      {/* Save */}
      <TouchableOpacity
        style={[styles.button, { backgroundColor: "#0a7" }]}
        onPress={onSave}
        disabled={saving}
      >
        <Text style={styles.buttonText}>{saving ? t("saving") : t("save")}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: "#fff", paddingTop: 30, paddingHorizontal: 20, flexGrow: 1 },
  headerContainer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  logo: { width: 160, height: 60 },
  screenTitle: { fontSize: 22, fontWeight: "bold" },
  sectionTitle: { fontSize: 16, fontWeight: "bold", marginTop: 16, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 6, padding: 10, fontSize: 16, marginBottom: 8 },
  row3: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  button: { backgroundColor: "#d06201ff", padding: 10, borderRadius: 6, alignItems: "center", marginTop: 12 },
  buttonText: { color: "#fff", fontWeight: "bold" },
  btnLikeInput: { height: 44, alignItems: "center", justifyContent: "center", backgroundColor: "#f9f9f9" },
  btnSeqTxt: { fontWeight: "600", fontSize: 14, color: "#333" },
  logoBox: { width: 220, height: 90, borderWidth: 1, borderColor: "#ddd", borderRadius: 6, alignItems: "center", justifyContent: "center", backgroundColor: "#fafafa" },
  logoPreview: { width: 220, height: 90, borderWidth: 1, borderColor: "#ddd", borderRadius: 6, backgroundColor: "#fafafa" },
  hintText: { color: "#777", marginTop: 6, fontSize: 12 },
  langWrap: {flexDirection: "row",flexWrap: "wrap",justifyContent: "space-between",marginVertical: 10,},
  langBtn: {width: "32%", marginBottom: 6, paddingVertical: 6, alignItems: "center", borderWidth: 1, borderColor: "#ddd", borderRadius: 6,},
  sampleLogosWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sampleLogoBox: {
    width: "30%",
    height: 60,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fafafa",
  },
  sampleLogo: {
    width: "80%",
    height: "80%",
  },
  sampleLogoSelected: {
    borderColor: "#d06201ff",
    borderWidth: 2,
  },

});
