import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, api, isStaticSite, staticSiteBasePath } from "../api";
import { getTrustedTelegramSourceUrl } from "../newsFeed";
import { preserveUtmAttribution } from "../attribution";
import type { NewsItem } from "../types";
import { BrandLink, EmptyState, LoadingGrid, PageShell, ThemeToggle } from "../shared";

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

function formatPublishedDate(item: NewsItem) {
  if (!item.publishedAt) return item.dateLabel;
  const date = new Date(item.publishedAt);
  return Number.isNaN(date.getTime())
    ? item.dateLabel
    : new Intl.DateTimeFormat("uk-UA", { dateStyle: "long", timeZone: "Europe/Kyiv" }).format(date);
}

export function NewsPage() {
  const { id = "" } = useParams();
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [retryAttempt, setRetryAttempt] = useState(0);
  const item = useMemo(() => news.find((entry) => entry.id === id) ?? null, [id, news]);

  useEffect(() => {
    let isCurrent = true;
    setLoading(true);
    setLoadError("");
    void api.getNews()
      .then((loadedNews) => {
        if (isCurrent) setNews(loadedNews);
      })
      .catch((error: unknown) => {
        if (!isCurrent) return;
        setNews([]);
        setLoadError(error instanceof ApiError
          ? error.message
          : "Не вдалося завантажити новину. Перевір з'єднання і спробуй ще раз.");
      })
      .finally(() => {
        if (isCurrent) setLoading(false);
      });
    return () => { isCurrent = false; };
  }, [retryAttempt]);

  useEffect(() => {
    if (!item) return;
    const title = `${item.title} — Orenda Cherepashka`;
    const description = item.content.replace(/\s+/g, " ").trim().slice(0, 180) || item.dateLabel;
    const pagePath = `${isStaticSite ? staticSiteBasePath : ""}/news/${encodeURIComponent(item.id)}/`;
    const canonicalUrl = new URL(pagePath, window.location.origin).toString();
    document.title = title;
    setMeta("description", description);
    setProperty("og:title", title);
    setProperty("og:description", description);
    setProperty("og:type", "article");
    setProperty("og:url", canonicalUrl);

  }, [item]);

  const homeHref = preserveUtmAttribution(isStaticSite ? `${staticSiteBasePath}/` : "/");

  if (loading) {
    return <PageShell><main className="shell news-page-loading"><LoadingGrid /></main></PageShell>;
  }

  if (!item) {
    return (
      <PageShell>
        <main className="shell news-page-empty">
          <EmptyState
            title={loadError ? "Не вдалося завантажити новини" : "Новину не знайдено"}
            description={loadError || "Можливо, публікацію архівовано або посилання застаріло."}
            action={loadError
              ? <button className="primary-button compact" type="button" onClick={() => setRetryAttempt((attempt) => attempt + 1)}>Повторити завантаження</button>
              : <a className="primary-button compact" href={`${homeHref}#news`}>До новин</a>}
          />
        </main>
      </PageShell>
    );
  }

  const sourceUrl = item.sourceType === "telegram" ? getTrustedTelegramSourceUrl(item.sourceUrl) : null;

  return (
    <PageShell>
      <header className="site-header is-scrolled">
        <div className="shell">
          <div className="header-row">
            <BrandLink href={homeHref} siteName="Orenda Cherepashka" subtitle="Новини сервісів" />
            <div className="header-actions">
              <ThemeToggle />
              <a className="ghost-button compact" href={`${homeHref}#news`}>До новин</a>
            </div>
          </div>
        </div>
      </header>
      <main className="news-page-main">
        <div className="shell narrow">
          <nav className="breadcrumbs" aria-label="Хлібні крихти">
            <a href={homeHref}>Головна</a>
            <span aria-hidden="true">›</span>
            <a href={`${homeHref}#news`}>Новини</a>
            <span aria-hidden="true">›</span>
            <span>{item.title}</span>
          </nav>
          <article className="legal-page-card news-article-card" data-testid="news-article">
            <span className="section-kicker">{item.sourceType === "telegram" ? "Публікація Telegram-каналу" : "Оновлення сервісу"}</span>
            <h1>{item.title}</h1>
            <time className="news-article-date" dateTime={item.publishedAt}>{formatPublishedDate(item)}</time>
            <div className="news-article-content">{item.content}</div>
            <div className="product-detail-actions news-article-actions">
              <a className="primary-button" href={`${homeHref}#catalog`}>Переглянути каталог</a>
              {sourceUrl ? <a className="ghost-button" href={sourceUrl} target="_blank" rel="noopener noreferrer">Оригінал у Telegram ↗</a> : null}
            </div>
          </article>
        </div>
      </main>
    </PageShell>
  );
}
