import {
  type HTMLAttributes,
  type ReactNode,
  useEffect,
  useRef,
  useState
} from "react";
import type { PricingOption, Product } from "../shared/models";
import { useTheme } from "./theme";

export function formatPrice(
  value: number | Pick<PricingOption, "price" | "currency">,
  currency: PricingOption["currency"] = "UAH"
) {
  const amount = typeof value === "number" ? value : value.price;
  const selectedCurrency = typeof value === "number" ? currency : value.currency;

  if (selectedCurrency === "USD") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  }

  return `${new Intl.NumberFormat("uk-UA").format(amount)} грн`;
}

export function getLowestPlan(product: Product) {
  const [firstOption] = product.pricingOptions;

  if (!firstOption) {
    return null;
  }

  return product.pricingOptions.reduce((best, current) => {
    return current.price < best.price ? current : best;
  }, firstOption);
}

function getProductFallbackGlyph(value: string) {
  const trimmed = value.trim();
  const emoji = trimmed.match(/^\p{Extended_Pictographic}/u)?.[0];
  return emoji ?? Array.from(trimmed)[0] ?? "•";
}

export function BrandLink({
  href,
  siteName,
  subtitle
}: {
  href: string;
  siteName: string;
  subtitle: string;
}) {
  return (
    <a className="brand" href={href} aria-label={siteName}>
      <span className="brand-mark">🐢</span>
      <span className="brand-copy">
        <strong>{siteName}</strong>
        <small>{subtitle}</small>
      </span>
    </a>
  );
}

export function ProductLogo({
  src,
  alt,
  fallback
}: {
  src: string;
  alt: string;
  fallback: string;
}) {
  const [failed, setFailed] = useState(!src);

  return (
    <div
      className="product-logo"
      role={failed ? "img" : undefined}
      aria-label={failed ? alt : undefined}
    >
      {!failed ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : null}
      <span
        className="product-fallback product-fallback-glyph"
        style={{ display: failed ? "grid" : "none" }}
        aria-hidden="true"
      >
        {getProductFallbackGlyph(fallback)}
      </span>
    </div>
  );
}

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={toggleTheme}
      aria-label="Змінити тему"
    >
      <span>{theme === "dark" ? "☀️" : "🌙"}</span>
      <span>{theme === "dark" ? "Світла" : "Темна"}</span>
    </button>
  );
}

export function Reveal({
  children,
  className = "",
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }

     const rect = node.getBoundingClientRect();
     const revealThreshold = window.innerHeight * 1.08;
     if (rect.top <= revealThreshold && rect.bottom >= 0) {
       setVisible(true);
       return;
     }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        });
      },
      { threshold: 0.18 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal ${visible ? "is-visible" : ""} ${className}`.trim()}
      {...rest}
    >
      {children}
    </div>
  );
}

export function PageShell({
  children,
  className = ""
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`page-shell ${className}`.trim()}>{children}</div>;
}

export function EmptyState({
  title,
  description,
  action
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-panel">
      <strong>{title}</strong>
      <p>{description}</p>
      {!action ? null : <div className="empty-panel-actions">{action}</div>}
    </div>
  );
}

export function NoticePanel({
  title,
  description,
  tone = "muted",
  action,
  className = ""
}: {
  title: string;
  description: string;
  tone?: "success" | "warning" | "danger" | "muted";
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`notice-panel notice-${tone} ${className}`.trim()}
      role={tone === "danger" ? "alert" : "status"}
      aria-live="polite"
    >
      <strong>{title}</strong>
      <p>{description}</p>
      {!action ? null : <div className="notice-panel-actions">{action}</div>}
    </div>
  );
}

export function LoadingGrid() {
  return (
    <div className="loading-grid">
      {Array.from({ length: 8 }).map((_, index) => (
        <div className="loading-card" key={`loading-${index}`}>
          <div className="loading-block loading-block-square"></div>
          <div className="loading-block"></div>
          <div className="loading-block loading-block-wide"></div>
          <div className="loading-block loading-block-short"></div>
        </div>
      ))}
    </div>
  );
}
