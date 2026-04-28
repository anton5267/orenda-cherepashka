import {
  createBrowserRouter,
  createRoutesFromElements,
  Navigate,
  Route,
  RouterProvider
} from "react-router-dom";
import { ThemeProvider } from "./theme";
import { ToastProvider } from "./toasts";
import { HomePage } from "./pages/HomePage";
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

const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route path="/" element={<HomePage />} />
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route element={<AdminGuard />}>
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
  )
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
