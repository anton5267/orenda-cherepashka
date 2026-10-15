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
const LegalPage = lazy(() =>
  import("./pages/LegalPage").then(({ LegalPage }) => ({ default: LegalPage }))
);
const AdminLoginPage = lazy(() =>
  import("./pages/AdminLoginPage").then(({ AdminLoginPage }) => ({ default: AdminLoginPage }))
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

const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route element={<PublicAnalyticsLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/p/:slug" element={<ProductPage />} />
        <Route path="/legal/:slug" element={<LegalPage />} />
      </Route>
      <Route
        path="/admin/login"
        element={isStaticSite && !isSupabaseConfigured ? <Navigate to="/" replace /> : <AdminLoginPage />}
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
