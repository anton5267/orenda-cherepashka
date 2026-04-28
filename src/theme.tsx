import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useState
} from "react";

type Theme = "light" | "dark";
type ThemePreference = Theme | "system";

const ThemeContext = createContext<{
  theme: Theme;
  toggleTheme: () => void;
} | null>(null);

function getStoredPreference(): ThemePreference {
  if (typeof window === "undefined") {
    return "system";
  }

  const stored = window.localStorage.getItem("theme");
  if (stored === "light" || stored === "dark") {
    return stored;
  }

  return "system";
}

function getSystemTheme(): Theme {
  if (typeof window === "undefined") {
    return "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function resolveTheme(preference: ThemePreference): Theme {
  return preference === "system" ? getSystemTheme() : preference;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(() =>
    getStoredPreference()
  );
  const [theme, setTheme] = useState<Theme>(() => resolveTheme(getStoredPreference()));

  useEffect(() => {
    setTheme(resolveTheme(preference));
  }, [preference]);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (preference === "system") {
      window.localStorage.removeItem("theme");
      return;
    }

    window.localStorage.setItem("theme", preference);
  }, [preference]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => {
      if (preference !== "system") {
        return;
      }

      setTheme(getSystemTheme());
    };

    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [preference]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        toggleTheme: () =>
          setPreference((current) => {
            const baseTheme = current === "system" ? theme : current;
            const nextTheme = baseTheme === "dark" ? "light" : "dark";
            setTheme(nextTheme);
            return nextTheme;
          })
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }

  return context;
}
