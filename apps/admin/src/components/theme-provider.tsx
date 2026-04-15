import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { UI, type UiResolvedTheme, type UiThemeSelection } from "@/config/site";
import { applyThemeToDocument, normalizeThemeSelection, resolveThemeName } from "@/lib/theme";

type ThemeContextValue = {
  theme: UiThemeSelection;
  resolvedTheme: UiResolvedTheme;
  setTheme: (theme: UiThemeSelection) => void;
};

const mediaQuery = "(prefers-color-scheme: dark)";

function readStoredTheme(): UiThemeSelection {
  if (typeof window === "undefined") {
    return UI.theme.default;
  }
  return normalizeThemeSelection(localStorage.getItem("theme") || UI.theme.default);
}

function resolveStoredTheme(theme: UiThemeSelection): UiResolvedTheme {
  if (typeof window === "undefined") {
    return "dark";
  }
  return resolveThemeName(theme, window.matchMedia(mediaQuery).matches);
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<UiThemeSelection>(() => readStoredTheme());
  const [resolvedTheme, setResolvedTheme] = useState<UiResolvedTheme>(() =>
    resolveStoredTheme(readStoredTheme())
  );

  const setTheme = useCallback((nextTheme: UiThemeSelection) => {
    localStorage.setItem("theme", nextTheme);
    setThemeState(nextTheme);
    setResolvedTheme(applyThemeToDocument(nextTheme));
  }, []);

  useEffect(() => {
    const normalizedTheme = readStoredTheme();
    const nextResolvedTheme = applyThemeToDocument(normalizedTheme);
    if ((localStorage.getItem("theme") || UI.theme.default) !== normalizedTheme) {
      localStorage.setItem("theme", normalizedTheme);
    }
    setThemeState(normalizedTheme);
    setResolvedTheme(nextResolvedTheme);

    const query = window.matchMedia(mediaQuery);
    const handleChange = () => {
      const storedTheme = readStoredTheme();
      if (storedTheme !== "system") return;
      setResolvedTheme(applyThemeToDocument(storedTheme));
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== "theme") return;
      const storedTheme = readStoredTheme();
      setThemeState(storedTheme);
      setResolvedTheme(applyThemeToDocument(storedTheme));
    };

    query.addEventListener("change", handleChange);
    window.addEventListener("storage", handleStorage);
    return () => {
      query.removeEventListener("change", handleChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [resolvedTheme, theme, setTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemePreference() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useThemePreference must be used within ThemeProvider");
  }
  return context;
}
