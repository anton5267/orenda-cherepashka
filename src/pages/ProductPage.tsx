import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api, isStaticSite, staticSiteBasePath } from "../api";
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
  const product = useMemo(
    () => products.find((item) => item.slug === slug) ?? null,
    [products, slug]
  );

  useEffect(() => {
    void api
      .getProducts()
      .then(setProducts)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!product) {
      return;
    }

    const title = `${product.name} — Orenda Cherepashka`;
    document.title = title;
    setMeta("description", product.summary);
    setProperty("og:title", title);
    setProperty("og:description", product.summary);
    setProperty("og:type", "product");
  }, [product]);

  const homeHref = isStaticSite ? `${staticSiteBasePath}/` : "/";

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
          <EmptyState
            title="Товар не знайдено"
            description="Можливо, сервіс було прибрано з каталогу або посилання застаріло."
            action={
              <a className="primary-button compact" href={homeHref}>
                Повернутися до каталогу
              </a>
            }
          />
        </main>
      </PageShell>
    );
  }

  const lowestPlan = getLowestPlan(product);
  const leadHref = lowestPlan
    ? `${homeHref}?product=${encodeURIComponent(product.id)}&plan=${encodeURIComponent(lowestPlan.id)}#lead-form`
    : `${homeHref}#lead-form`;

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
                    <strong>{formatPrice(plan.price)}</strong>
                    {plan.compareAt ? <s>{formatPrice(plan.compareAt)}</s> : null}
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
