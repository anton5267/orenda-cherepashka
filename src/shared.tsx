import {
  forwardRef,
  useId,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  type ButtonHTMLAttributes,
  type AnchorHTMLAttributes,
  type ElementType,
  type MouseEvent,
  useEffect,
  useRef,
  useState
} from "react";
import type { PricingOption, Product } from "../shared/models";
import { useTheme } from "./theme";

type ActionVariant = "primary" | "secondary" | "danger";
type ActionSize = "default" | "compact";
type ControlState = "success" | "warning" | "error" | "loading";

type ActionStyleProps = {
  variant?: ActionVariant;
  size?: ActionSize;
  loading?: boolean;
  loadingLabel?: ReactNode;
  state?: ControlState;
};

function getActionClassName(
  variant: ActionVariant,
  size: ActionSize,
  loading: boolean,
  className = ""
) {
  const variantClass = {
    primary: "primary-button",
    secondary: "ghost-button",
    danger: "danger-button"
  }[variant];

  return [variantClass, size === "compact" ? "compact" : "", loading ? "is-loading" : "", className]
    .filter(Boolean)
    .join(" ");
}

export function ActionButton({
  variant = "primary",
  size = "default",
  loading = false,
  loadingLabel,
  state,
  className = "",
  disabled,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & ActionStyleProps) {
  return (
    <button
      {...props}
      className={getActionClassName(variant, size, loading, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-state={state}
    >
      {loading ? (
        <>
          <span className="button-spinner" aria-hidden="true"></span>
          <span>{loadingLabel ?? children}</span>
        </>
      ) : children}
    </button>
  );
}

export function ActionLink({
  variant = "primary",
  size = "default",
  loading = false,
  loadingLabel,
  state,
  className = "",
  disabled = false,
  children,
  onClick,
  tabIndex,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & ActionStyleProps & { disabled?: boolean }) {
  const unavailable = disabled || loading;
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (unavailable) {
      event.preventDefault();
      return;
    }

    onClick?.(event);
  };

  return (
    <a
      {...props}
      className={getActionClassName(variant, size, loading, className)}
      aria-disabled={unavailable || undefined}
      aria-busy={loading || undefined}
      data-state={state}
      tabIndex={unavailable ? -1 : tabIndex}
      onClick={handleClick}
    >
      {loading ? (
        <>
          <span className="button-spinner" aria-hidden="true"></span>
          <span>{loadingLabel ?? children}</span>
        </>
      ) : children}
    </a>
  );
}

type FieldShellProps = {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  hintTone?: "muted" | "success" | "warning";
  error?: ReactNode;
  success?: ReactNode;
  optional?: boolean;
  loading?: boolean;
  className?: string;
  children: ReactNode;
};

function FieldShell({
  id,
  label,
  hint,
  hintTone = "muted",
  error,
  success,
  optional = false,
  loading = false,
  className = "",
  children
}: FieldShellProps) {
  const message = error ?? success ?? hint;
  const messageId = `${id}-message`;
  const state = error ? "error" : success ? "success" : loading ? "loading" : "default";

  return (
    <div className={`field-group ${className}`.trim()} data-state={state}>
      <label className="field-label" htmlFor={id}>
        <span>{label}</span>
        {!optional ? null : <span className="field-optional">необов'язково</span>}
      </label>
      {children}
      {!message ? null : (
        <span
          className={
            error
              ? "field-message field-error"
              : success
                ? "field-message field-success"
                : `field-message field-hint field-hint-${hintTone}`
          }
          id={messageId}
          role={error ? "alert" : success ? "status" : undefined}
        >
          {message}
        </span>
      )}
    </div>
  );
}

type FieldProps = {
  id?: string;
  label: ReactNode;
  hint?: ReactNode;
  hintTone?: "muted" | "success" | "warning";
  error?: ReactNode;
  success?: ReactNode;
  optional?: boolean;
  loading?: boolean;
  className?: string;
  controlClassName?: string;
};

function useFieldIdentity(id?: string) {
  const generatedId = useId();
  return id ?? `field-${generatedId}`;
}

function getDescribedBy(messageId: string, message: ReactNode, describedBy?: string) {
  return [message ? messageId : "", describedBy].filter(Boolean).join(" ") || undefined;
}

export function TextField({
  id,
  label,
  hint,
  hintTone,
  error,
  success,
  optional,
  loading = false,
  className = "",
  controlClassName = "",
  "aria-describedby": describedBy,
  "aria-invalid": ariaInvalid,
  ...inputProps
}: FieldProps & Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "className" | "children">) {
  const fieldId = useFieldIdentity(id);
  const message = error ?? success ?? hint;
  const messageId = `${fieldId}-message`;

  return (
    <FieldShell
      id={fieldId}
      label={label}
      hint={hint}
      hintTone={hintTone}
      error={error}
      success={success}
      optional={optional}
      loading={loading}
      className={className}
    >
      <input
        {...inputProps}
        id={fieldId}
        className={`field-control ${error ? "is-invalid" : ""} ${controlClassName}`.trim()}
        disabled={inputProps.disabled || loading}
        aria-busy={loading || undefined}
        aria-invalid={error ? true : ariaInvalid}
        aria-describedby={getDescribedBy(messageId, message, describedBy)}
      />
    </FieldShell>
  );
}

export function SelectField({
  id,
  label,
  hint,
  hintTone,
  error,
  success,
  optional,
  loading = false,
  className = "",
  controlClassName = "",
  children,
  "aria-describedby": describedBy,
  "aria-invalid": ariaInvalid,
  ...selectProps
}: FieldProps & Omit<SelectHTMLAttributes<HTMLSelectElement>, "id" | "className" | "children"> & {
  children: ReactNode;
}) {
  const fieldId = useFieldIdentity(id);
  const message = error ?? success ?? hint;
  const messageId = `${fieldId}-message`;

  return (
    <FieldShell
      id={fieldId}
      label={label}
      hint={hint}
      hintTone={hintTone}
      error={error}
      success={success}
      optional={optional}
      loading={loading}
      className={className}
    >
      <select
        {...selectProps}
        id={fieldId}
        className={`field-control ${error ? "is-invalid" : ""} ${controlClassName}`.trim()}
        disabled={selectProps.disabled || loading}
        aria-busy={loading || undefined}
        aria-invalid={error ? true : ariaInvalid}
        aria-describedby={getDescribedBy(messageId, message, describedBy)}
      >
        {children}
      </select>
    </FieldShell>
  );
}

export function TextAreaField({
  id,
  label,
  hint,
  hintTone,
  error,
  success,
  optional,
  loading = false,
  className = "",
  controlClassName = "",
  "aria-describedby": describedBy,
  "aria-invalid": ariaInvalid,
  ...textareaProps
}: FieldProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id" | "className">) {
  const fieldId = useFieldIdentity(id);
  const message = error ?? success ?? hint;
  const messageId = `${fieldId}-message`;

  return (
    <FieldShell
      id={fieldId}
      label={label}
      hint={hint}
      hintTone={hintTone}
      error={error}
      success={success}
      optional={optional}
      loading={loading}
      className={className}
    >
      <textarea
        {...textareaProps}
        id={fieldId}
        className={`field-control ${error ? "is-invalid" : ""} ${controlClassName}`.trim()}
        disabled={textareaProps.disabled || loading}
        aria-busy={loading || undefined}
        aria-invalid={error ? true : ariaInvalid}
        aria-describedby={getDescribedBy(messageId, message, describedBy)}
      />
    </FieldShell>
  );
}

type SurfaceCardProps = HTMLAttributes<HTMLElement> & {
  as?: "article" | "div" | "section";
  interactive?: boolean;
  state?: ControlState;
};

export function SurfaceCard({
  as = "div",
  interactive = false,
  state,
  className = "",
  ...props
}: SurfaceCardProps) {
  const Element = as as ElementType;

  return (
    <Element
      {...props}
      className={`ds-card ${interactive ? "ds-card-interactive" : ""} ${className}`.trim()}
      data-state={state}
    />
  );
}

type DialogSurfaceProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "role" | "aria-modal" | "aria-labelledby" | "aria-describedby"
> & {
  labelledBy: string;
  describedBy?: string;
};

export const DialogSurface = forwardRef<HTMLDivElement, DialogSurfaceProps>(
  function DialogSurface({ labelledBy, describedBy, className = "", ...props }, ref) {
    return (
      <div
        {...props}
        ref={ref}
        className={`ds-dialog-surface ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
      />
    );
  }
);

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
          decoding="async"
          fetchPriority="low"
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
    <SurfaceCard className="empty-panel">
      <strong>{title}</strong>
      <p>{description}</p>
      {!action ? null : <div className="empty-panel-actions">{action}</div>}
    </SurfaceCard>
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
  const surfaceState = tone === "danger" ? "error" : tone === "muted" ? undefined : tone;

  return (
    <SurfaceCard
      className={`notice-panel notice-${tone} ${className}`.trim()}
      state={surfaceState}
      role={tone === "danger" ? "alert" : "status"}
      aria-live="polite"
    >
      <strong>{title}</strong>
      <p>{description}</p>
      {!action ? null : <div className="notice-panel-actions">{action}</div>}
    </SurfaceCard>
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
