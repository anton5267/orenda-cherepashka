import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { ApiError, api, isStaticSite, staticSiteBasePath } from "../api";
import { preserveUtmAttribution, readUtmAttribution } from "../attribution";
import type { Product } from "../types";
import {
  BrandLink,
  EmptyState,
  LoadingGrid,
  PageShell,
  ProductLogo,
  ThemeToggle,
  formatPrice,
  getLowestPlan
} from "../shared";

function setMeta(name: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.name = name;
    document.head.appendChild(element);
  }
  element.content = content;
}

function setProperty(property: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute("property", property);
    document.head.appendChild(element);
  }
  element.content = content;
}

export function ProductPage() {
  const { slug = "" } = useParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [retryAttempt, setRetryAttempt] = useState(0);
  const product = useMemo(
    () => products.find((item) => item.slug === slug) ?? null,
    [products, slug]
  );

  useEffect(() => {
    let isCurrent = true;
    setLoading(true);
    setLoadError("");
    void api
      .getProducts()
      .then((loadedProducts) => {
        if (isCurrent) setProducts(loadedProducts);
      })
      .catch((caughtError: unknown) => {
        if (!isCurrent) return;
        setProducts([]);
        setLoadError(
          caughtError instanceof ApiError
            ? caughtError.message
            : "Не вдалося завантажити товар. Перевір з'єднання і спробуй ще раз."
        );
      })
      .finally(() => {
        if (isCurrent) setLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [retryAttempt]);

  useEffect(() => {
    if (!product) {
      return;
    }

    void api.trackEvent({
      eventName: "product_view",
      path: `/p/${product.slug}`,
      productSlug: product.slug,
      ...readUtmAttribution()
    });

    const title = `${product.name} — Orenda Cherepashka`;
    document.title = title;
    setMeta("description", product.summary);
    setProperty("og:title", title);
    setProperty("og:description", product.summary);
    setProperty("og:type", "product");
  }, [product]);

  const homeHref = preserveUtmAttribution(isStaticSite ? `${staticSiteBasePath}/` : "/");

  if (loading) {
    return (
      <PageShell>
        <div className="shell product-page-loading">
          <LoadingGrid />
        </div>
      </PageShell>
    );
  }

  if (!product) {
    return (
      <PageShell>
        <main className="shell product-page-empty">
          {loadError ? (
            <div role="alert">
              <EmptyState
                title="Не вдалося завантажити товар"
                description={loadError}
                action={
                  <button
                    className="primary-button compact"
                    type="button"
                    onClick={() => setRetryAttempt((attempt) => attempt + 1)}
                  >
                    Повторити завантаження
                  </button>
                }
              />
            </div>
          ) : (
            <EmptyState
              title="Товар не знайдено"
              description="Можливо, сервіс було прибрано з каталогу або посилання застаріло."
              action={
                <a className="primary-button compact" href={homeHref}>
                  Повернутися до каталогу
                </a>
              }
            />
          )}
        </main>
      </PageShell>
    );
  }

  const lowestPlan = getLowestPlan(product);
  const leadHref = preserveUtmAttribution(lowestPlan
    ? `${homeHref}?product=${encodeURIComponent(product.id)}&plan=${encodeURIComponent(lowestPlan.id)}#lead-form`
    : `${homeHref}#lead-form`);

  return (
    <PageShell>
      <header className="site-header is-scrolled">
        <div className="shell">
          <div className="header-row">
            <BrandLink href={homeHref} siteName="Orenda Cherepashka" subtitle="Оренда підписок" />
            <div className="header-actions">
              <ThemeToggle />
              <a className="ghost-button compact" href={homeHref}>
                До каталогу
              </a>
            </div>
          </div>
        </div>
      </header>

      <main className="product-page-main">
        <div className="shell">
          <nav className="breadcrumbs" aria-label="Хлібні крихти">
            <a href={homeHref}>Головна</a>
            <span aria-hidden="true">›</span>
            <span>{product.name}</span>
          </nav>

          <article className="product-detail-page">
            <div className="product-detail-visual">
              <ProductLogo src={product.logo} alt={product.name} fallback={product.name} />
              {product.isHot ? <span className="badge hot">Хіт продажів</span> : null}
            </div>
            <div className="product-detail-copy">
              <span className="section-kicker">Каталог підписок</span>
              <h1>{product.name}</h1>
              <p className="product-detail-summary">{product.summary}</p>
              <ul className="detail-list">
                {product.details.map((detail) => <li key={detail}>{detail}</li>)}
              </ul>
              <div className="product-detail-plans">
                {product.pricingOptions.filter((plan) => plan.isActive).map((plan) => (
                  <div className="product-detail-plan" key={plan.id}>
                    <span>{plan.label}</span>
                    <strong>{formatPrice(plan)}</strong>
                    {plan.compareAt ? <s>{formatPrice(plan.compareAt, plan.currency)}</s> : null}
                  </div>
                ))}
              </div>
              <div className="product-detail-actions">
                <a className="primary-button" href={leadHref}>Замовити через заявку</a>
                <a className="ghost-button" href={`${homeHref}#news`}>Переглянути новини</a>
              </div>
            </div>
          </article>
        </div>
      </main>
    </PageShell>
  );
}
