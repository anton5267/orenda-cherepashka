import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState
} from "react";

type ToastKind = "success" | "error" | "info";

type ToastItem = {
  id: string;
  message: string;
  kind: ToastKind;
  expiresAt: number;
};

const TOAST_DURATION_MS = 4200;
const MAX_VISIBLE_TOASTS = 3;

const ToastContext = createContext<{
  pushToast: (message: string, kind?: ToastKind) => void;
} | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    if (!items.length) {
      return;
    }

    const nextExpiry = Math.min(...items.map((item) => item.expiresAt));
    const timer = window.setTimeout(() => {
      const now = Date.now();
      setItems((current) => current.filter((item) => item.expiresAt > now));
    }, Math.max(0, nextExpiry - Date.now()));

    return () => window.clearTimeout(timer);
  }, [items]);

  const pushToast = (message: string, kind: ToastKind = "info") => {
    const now = Date.now();
    const nextItem = {
      id: window.crypto.randomUUID(),
      message,
      kind,
      expiresAt: now + TOAST_DURATION_MS
    };

    setItems((current) => [
      ...current.filter((item) => item.message !== message || item.kind !== kind),
      nextItem
    ].slice(-MAX_VISIBLE_TOASTS));
  };

  return (
    <ToastContext.Provider value={{ pushToast }}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-label="Сповіщення">
        {items.map((item) => (
          <div className={`toast toast-${item.kind}`} key={item.id}>
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }

  return context;
}
