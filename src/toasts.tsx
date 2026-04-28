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
};

const ToastContext = createContext<{
  pushToast: (message: string, kind?: ToastKind) => void;
} | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    if (!items.length) {
      return;
    }

    const timer = window.setTimeout(() => {
      setItems((current) => current.slice(1));
    }, 4200);

    return () => window.clearTimeout(timer);
  }, [items]);

  const pushToast = (message: string, kind: ToastKind = "info") => {
    setItems((current) => [
      ...current,
      {
        id: window.crypto.randomUUID(),
        message,
        kind
      }
    ]);
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
