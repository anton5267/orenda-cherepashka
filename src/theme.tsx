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

  try {
    const stored = window.localStorage.getItem("theme");
    if (stored === "light" || stored === "dark") {
      return stored;
    }
  } catch {
    // Storage can be disabled; in that case, follow the system theme for this session.
  }

  return "system";
}

function getSystemTheme(): Theme {
  if (typeof window === "undefined") {
    return "light";
  }

  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  } catch {
    return "light";
  }
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
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  useEffect(() => {
    try {
      if (preference === "system") {
        window.localStorage.removeItem("theme");
      } else {
        window.localStorage.setItem("theme", preference);
      }
    } catch {
      // The selected theme still works for this session without persistent storage.
    }
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

  useEffect(() => {
    const listener = (event: StorageEvent) => {
      if (event.key !== "theme" && event.key !== null) {
        return;
      }

      const nextPreference =
        event.newValue === "light" || event.newValue === "dark"
          ? event.newValue
          : "system";
      setPreference(nextPreference);
      setTheme(resolveTheme(nextPreference));
    };

    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        toggleTheme: () => {
          const baseTheme = preference === "system" ? getSystemTheme() : preference;
          const nextTheme = baseTheme === "dark" ? "light" : "dark";
          setTheme(nextTheme);
          setPreference(nextTheme);
        }
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
