import {
  createBrowserRouter,
  createRoutesFromElements,
  Navigate,
  Outlet,
  Route,
  RouterProvider,
  useLocation
} from "react-router-dom";
import { useEffect } from "react";
import { ThemeProvider } from "./theme";
import { ToastProvider } from "./toasts";
import { HomePage } from "./pages/HomePage";
import { ProductPage } from "./pages/ProductPage";
import { LegalPage } from "./pages/LegalPage";
import { AdminLoginPage } from "./pages/AdminLoginPage";
import { AdminGuard, AdminLayout } from "./pages/admin/AdminLayout";
import {
  AdminCategoriesPage,
  AdminDashboardPage,
  AdminFaqsPage,
  AdminLeadsPage,
  AdminNewsPage,
  AdminProductsPage,
  AdminReviewsPage,
  AdminSettingsPage
} from "./pages/admin/AdminPages";
import { api, staticSiteBasePath } from "./api";
import { readUtmAttribution } from "./attribution";

const isStaticSite = import.meta.env.VITE_STATIC_SITE === "true";

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
        element={isStaticSite ? <Navigate to="/" replace /> : <AdminLoginPage />}
      />
      <Route element={isStaticSite ? <Navigate to="/" replace /> : <AdminGuard />}>
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
  { basename: isStaticSite ? staticSiteBasePath : undefined }
);

function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
