import {
  createBrowserRouter,
  createRoutesFromElements,
  Navigate,
  Outlet,
  Route,
  RouterProvider,
  useLocation
} from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import { ThemeProvider } from "./theme";
import { ToastProvider } from "./toasts";
import { HomePage } from "./pages/HomePage";
import { api, isSupabaseConfigured, staticSiteBasePath } from "./api";
import { readUtmAttribution } from "./attribution";

const isStaticSite = import.meta.env.VITE_STATIC_SITE === "true";

const ProductPage = lazy(() =>
  import("./pages/ProductPage").then(({ ProductPage }) => ({ default: ProductPage }))
);
const NewsPage = lazy(() =>
  import("./pages/NewsPage").then(({ NewsPage }) => ({ default: NewsPage }))
);
const LegalPage = lazy(() =>
  import("./pages/LegalPage").then(({ LegalPage }) => ({ default: LegalPage }))
);
const AdminLoginPage = lazy(() =>
  import("./pages/AdminLoginPage").then(({ AdminLoginPage }) => ({ default: AdminLoginPage }))
);
const AdminPasswordRecoveryPage = lazy(() =>
  import("./pages/AdminPasswordRecoveryPage").then(({ AdminPasswordRecoveryPage }) => ({
    default: AdminPasswordRecoveryPage
  }))
);
const { AdminGuard, AdminLayout } = {
  AdminGuard: lazy(() =>
    import("./pages/admin/AdminLayout").then(({ AdminGuard }) => ({ default: AdminGuard }))
  ),
  AdminLayout: lazy(() =>
    import("./pages/admin/AdminLayout").then(({ AdminLayout }) => ({ default: AdminLayout }))
  )
};
const AdminDashboardPage = lazy(() =>
  import("./pages/admin/AdminPages").then(({ AdminDashboardPage }) => ({ default: AdminDashboardPage }))
);
const AdminProductsPage = lazy(() =>
  import("./pages/admin/AdminPages").then(({ AdminProductsPage }) => ({ default: AdminProductsPage }))
);
const AdminCategoriesPage = lazy(() =>
  import("./pages/admin/AdminPages").then(({ AdminCategoriesPage }) => ({ default: AdminCategoriesPage }))
);
const AdminFaqsPage = lazy(() =>
  import("./pages/admin/AdminPages").then(({ AdminFaqsPage }) => ({ default: AdminFaqsPage }))
);
const AdminNewsPage = lazy(() =>
  import("./pages/admin/AdminPages").then(({ AdminNewsPage }) => ({ default: AdminNewsPage }))
);
const AdminReviewsPage = lazy(() =>
  import("./pages/admin/AdminPages").then(({ AdminReviewsPage }) => ({ default: AdminReviewsPage }))
);
const AdminLeadsPage = lazy(() =>
  import("./pages/admin/AdminPages").then(({ AdminLeadsPage }) => ({ default: AdminLeadsPage }))
);
const AdminSettingsPage = lazy(() =>
  import("./pages/admin/AdminPages").then(({ AdminSettingsPage }) => ({ default: AdminSettingsPage }))
);

function RouteLoading() {
  return (
    <main className="route-loading" role="status" aria-live="polite" aria-busy="true">
      Завантаження сторінки…
    </main>
  );
}

function PublicAnalyticsLayout() {
  const location = useLocation();

  useEffect(() => {
    const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) return;
    const basePath = isStaticSite ? staticSiteBasePath : "";
    const routePath = location.pathname === "/"
      ? "/"
      : `${location.pathname.replace(/\/+$/, "")}/`;
    canonical.href = new URL(`${basePath}${routePath}`, window.location.origin).toString();
    const ogUrl = document.head.querySelector<HTMLMetaElement>('meta[property="og:url"]');
    if (ogUrl) ogUrl.content = canonical.href;
    const ogType = document.head.querySelector<HTMLMetaElement>('meta[property="og:type"]');
    if (ogType) ogType.content = "website";
    if (location.pathname === "/") {
      document.title = "Orenda Cherepashka — оренда підписок";
      const description = document.head.querySelector<HTMLMetaElement>('meta[name="description"]');
      if (description) description.content = "Каталог цифрових підписок із вибором тарифу, новинами та замовленням через Telegram.";
      const ogTitle = document.head.querySelector<HTMLMetaElement>('meta[property="og:title"]');
      if (ogTitle) ogTitle.content = document.title;
      const ogDescription = document.head.querySelector<HTMLMetaElement>('meta[property="og:description"]');
      if (ogDescription) ogDescription.content = description?.content ?? "";
    }
  }, [location.pathname]);

  useEffect(() => {
    void api.trackEvent({
      eventName: "page_view",
      path: location.pathname,
      ...readUtmAttribution()
    });
  }, [location.pathname]);

  useEffect(() => {
    const handleTelegramClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest<HTMLAnchorElement>("a[href]");
      if (!link || !/^https:\/\/(?:www\.)?t\.me\//i.test(link.href)) return;

      void api.trackEvent({
        eventName: "telegram_click",
        path: location.pathname,
        ...readUtmAttribution()
      });
    };

    document.addEventListener("click", handleTelegramClick, true);
    return () => document.removeEventListener("click", handleTelegramClick, true);
  }, [location.pathname]);

  return <Outlet />;
}

// Dashboard invitations use Site URL. Route them before the storefront can
// initialize Auth and consume the callback fragment.
const callbackType = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("type")
  ?? new URLSearchParams(window.location.search).get("type");
const siteBasePath = isStaticSite ? staticSiteBasePath : "";
if (
  isSupabaseConfigured &&
  [siteBasePath || "/", `${siteBasePath}/`].includes(window.location.pathname) &&
  (callbackType === "invite" || callbackType === "recovery")
) {
  window.history.replaceState(window.history.state, "",
    `${siteBasePath}/admin/reset-password${window.location.search}${window.location.hash}`);
}

const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route element={<PublicAnalyticsLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/p/:slug" element={<ProductPage />} />
        <Route path="/news/:id" element={<NewsPage />} />
        <Route path="/legal/:slug" element={<LegalPage />} />
      </Route>
      <Route
        path="/admin/login"
        element={isStaticSite && !isSupabaseConfigured ? <Navigate to="/" replace /> : <AdminLoginPage />}
      />
      <Route
        path="/admin/reset-password"
        element={isStaticSite && !isSupabaseConfigured ? <Navigate to="/" replace /> : <AdminPasswordRecoveryPage />}
      />
      <Route element={isStaticSite && !isSupabaseConfigured ? <Navigate to="/" replace /> : <AdminGuard />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboardPage />} />
          <Route path="products" element={<AdminProductsPage />} />
          <Route path="categories" element={<AdminCategoriesPage />} />
          <Route path="faqs" element={<AdminFaqsPage />} />
          <Route path="news" element={<AdminNewsPage />} />
          <Route path="reviews" element={<AdminReviewsPage />} />
          <Route path="leads" element={<AdminLeadsPage />} />
          <Route path="settings" element={<AdminSettingsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </>
  ),
  { basename: isStaticSite ? staticSiteBasePath || "/" : undefined }
);

function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <Suspense fallback={<RouteLoading />}>
          <RouterProvider router={router} />
        </Suspense>
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
