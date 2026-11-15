import { createContext, useContext, useState, useCallback } from "react";
import { getTranslation } from "@/lib/i18n";

const LanguageContext = createContext(null);

export const LANGS = [
  { code: "pt", label: "Português", flag: "\u{1F1E7}\u{1F1F7}" },
  { code: "en", label: "English", flag: "\u{1F1FA}\u{1F1F8}" },
  { code: "es", label: "Español", flag: "\u{1F1EA}\u{1F1F8}" },
  { code: "fr", label: "Français", flag: "\u{1F1EB}\u{1F1F7}" },
  { code: "ru", label: "Русский", flag: "\u{1F1F7}\u{1F1FA}" },
];

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => localStorage.getItem("fp_lang") || "pt");

  const setLang = (code) => {
    setLangState(code);
    localStorage.setItem("fp_lang", code);
  };

  const t = useCallback((key) => getTranslation(lang, key), [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, LANGS, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be inside LanguageProvider");
  return ctx;
}
