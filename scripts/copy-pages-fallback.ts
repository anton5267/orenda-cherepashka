import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { seedProducts } from "../shared/seedData.js";

const distDir = resolve("dist");
const indexPath = resolve(distDir, "index.html");
const pagesBaseUrl = (process.env.PUBLIC_SITE_URL ?? "https://anton5267.github.io/orenda-cherepashka")
  .trim()
  .replace(/\/+$/, "");
const legalPages = [
  { slug: "privacy", title: "Політика конфіденційності" },
  { slug: "terms", title: "Умови оренди" },
  { slug: "refund", title: "Умови заміни та повернення" },
  { slug: "contacts", title: "Контакти продавця" }
];

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function withPageMetadata(
  html: string,
  { title, description, url, schema }: {
    title: string;
    description: string;
    url: string;
    schema?: unknown;
  }
) {
  let page = html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace(/<meta\s+name="description"[^>]*\/>/, `<meta name="description" content="${escapeHtml(description)}" />`)
    .replace(/<link\s+rel="canonical"[^>]*\/>/, `<link rel="canonical" href="${escapeHtml(url)}" />`)
    .replace(/<meta\s+property="og:type"[^>]*\/>/, `<meta property="og:type" content="${Array.isArray(schema) ? "product" : "website"}" />`)
    .replace(/<meta\s+property="og:title"[^>]*\/>/, `<meta property="og:title" content="${escapeHtml(title)}" />`)
    .replace(/<meta\s+property="og:description"[^>]*\/>/, `<meta property="og:description" content="${escapeHtml(description)}" />`)
    .replace(/<meta\s+property="og:url"[^>]*\/>/, `<meta property="og:url" content="${escapeHtml(url)}" />`)
    .replace(/<meta\s+name="robots"[^>]*\/>/, '<meta name="robots" content="index,follow" />')
    .replace(/("@type":\s*"Organization",[\s\S]*?"url":\s*)"[^"]+"/, `$1"${pagesBaseUrl}/"`);

  if (schema) {
    const schemas = Array.isArray(schema) ? schema : [schema];
    const scripts = schemas
      .map((item) => `    <script type="application/ld+json">${safeJson(item)}</script>`)
      .join("\n");
    page = page.replace("</head>", `${scripts}\n  </head>`);
  }

  return page;
}

const sourceHtml = await readFile(indexPath, "utf8");
const rootUrl = `${pagesBaseUrl}/`;
const homeHtml = withPageMetadata(sourceHtml, {
  title: "Orenda Cherepashka — оренда підписок і цифрових сервісів",
  description: "Каталог цифрових підписок із вибором тарифу, актуальними новинами та замовленням через Telegram.",
  url: rootUrl
});

await writeFile(indexPath, homeHtml);
await copyFile(indexPath, resolve(distDir, "404.html"));

const productUrls: string[] = [];
for (const product of seedProducts.filter((item) => item.isActive)) {
  const url = `${pagesBaseUrl}/p/${product.slug}/`;
  const title = `${product.name} — Orenda Cherepashka`;
  const description = product.summary || `Варіанти та ціни ${product.name} в каталозі Orenda Cherepashka.`;
  const activePlans = product.pricingOptions
    .filter((plan) => plan.isActive)
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const productSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description,
    ...(product.logo ? { image: product.logo } : {}),
    offers: activePlans.map((plan) => ({
      "@type": "Offer",
      name: plan.label,
      priceCurrency: plan.currency,
      price: plan.price,
      url
    }))
  };
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Головна", item: rootUrl },
      { "@type": "ListItem", position: 2, name: "Каталог", item: `${rootUrl}#catalog` },
      { "@type": "ListItem", position: 3, name: product.name, item: url }
    ]
  };
  const productHtml = withPageMetadata(sourceHtml, {
    title,
    description,
    url,
    schema: [productSchema, breadcrumbSchema]
  });
  const productPath = resolve(distDir, "p", product.slug, "index.html");
  await mkdir(dirname(productPath), { recursive: true });
  await writeFile(productPath, productHtml);
  productUrls.push(url);
}

const legalUrls = legalPages.map(({ slug }) => `${pagesBaseUrl}/legal/${slug}/`);
for (const pageInfo of legalPages) {
  const url = `${pagesBaseUrl}/legal/${pageInfo.slug}/`;
  const html = withPageMetadata(sourceHtml, {
    title: `${pageInfo.title} — Orenda Cherepashka`,
    description: `${pageInfo.title}. Інформація для клієнтів Orenda Cherepashka.`,
    url
  });
  const pagePath = resolve(distDir, "legal", pageInfo.slug, "index.html");
  await mkdir(dirname(pagePath), { recursive: true });
  await writeFile(pagePath, html);
}

const sitemapUrls = [rootUrl, ...legalUrls, ...productUrls];
const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...sitemapUrls.map((url) => `  <url><loc>${url}</loc></url>`),
  "</urlset>"
].join("\n");
await writeFile(resolve(distDir, "sitemap.xml"), `${sitemap}\n`);
await writeFile(
  resolve(distDir, "robots.txt"),
  `User-agent: *\nAllow: /\nDisallow: /admin\nSitemap: ${pagesBaseUrl}/sitemap.xml\n`
);

console.log(`Generated ${productUrls.length} product pages, ${legalUrls.length} legal pages, robots.txt, and sitemap.xml.`);
