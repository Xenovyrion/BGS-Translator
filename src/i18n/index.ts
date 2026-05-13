import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import fr from "./locales/fr.json";
import en from "./locales/en.json";

const SUPPORTED = ["fr", "en"];
const STORAGE_KEY = "bgstranslator_settings_v1";

function getInitialLanguage(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const lang: string = JSON.parse(stored).language ?? "";
      if (lang && SUPPORTED.includes(lang)) return lang;
    }
  } catch { /* ignore */ }
  const nav = (navigator.language ?? "en").split("-")[0].toLowerCase();
  return SUPPORTED.includes(nav) ? nav : "en";
}

i18n.use(initReactI18next).init({
  lng: getInitialLanguage(),
  resources: {
    fr: { translation: fr },
    en: { translation: en },
  },
  fallbackLng: "en",
  supportedLngs: SUPPORTED,
  interpolation: { escapeValue: false },
});

export default i18n;
