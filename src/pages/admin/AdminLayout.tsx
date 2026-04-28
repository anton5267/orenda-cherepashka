import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from "react";
import {
  Link,
  Navigate,
  NavLink,
  Outlet,
  useLocation,
  useNavigate
} from "react-router-dom";
import { useBlocker } from "react-router";
import { api, ApiError } from "../../api";
import { EmptyState, NoticePanel, PageShell, ThemeToggle } from "../../shared";
import { useToast } from "../../toasts";

const defaultUnsavedChangesMessage = "Є незбережені зміни. Продовжити без збереження?";

type AdminUnsavedChangesContextValue = {
  setUnsavedMessage: (message: string | null) => void;
};

const AdminUnsavedChangesContext =
  createContext<AdminUnsavedChangesContextValue | null>(null);

const navigation = [
  {
    href: "/admin/dashboard",
    label: "Огляд",
    description: "Статистика, фокус-зони і швидкі переходи."
  },
  {
    href: "/admin/products",
    label: "Товари",
    description: "Каталог, тарифи, активність і хіти."
  },
  {
    href: "/admin/categories",
    label: "Категорії",
    description: "Структура каталогу і slug-и розділів."
  },
  {
    href: "/admin/faqs",
    label: "FAQ",
    description: "Поширені питання і видимість відповідей."
  },
  {
    href: "/admin/news",
    label: "Новини",
    description: "Публікації, дати і контент для вітрини."
  },
  {
    href: "/admin/reviews",
    label: "Відгуки",
    description: "Модерація соціального доказу і рейтингів."
  },
  {
    href: "/admin/leads",
    label: "Заявки",
    description: "Нові звернення, контакти і статуси."
  },
  {
    href: "/admin/settings",
    label: "Налаштування",
    description: "Hero, lead, footer і базові параметри сайту."
  }
];

export function AdminGuard() {
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [loadError, setLoadError] = useState("");
  const checkRequestRef = useRef(0);

  const checkSession = async () => {
    const requestId = checkRequestRef.current + 1;
    checkRequestRef.current = requestId;

    try {
      const session = await api.getAdminSession();
      if (requestId === checkRequestRef.current) {
        setAllowed(session.authenticated);
        setLoadError("");
      }
    } catch (caughtError) {
      if (
        caughtError instanceof ApiError &&
        (caughtError.status === 401 || caughtError.status === 403)
      ) {
        if (requestId === checkRequestRef.current) {
          setAllowed(false);
          setLoadError("");
        }
      } else {
        if (requestId === checkRequestRef.current) {
          setLoadError(
            caughtError instanceof ApiError
              ? caughtError.message
              : "Не вдалося перевірити сесію адміністратора."
          );
        }
      }
    } finally {
      if (requestId === checkRequestRef.current) {
        setChecking(false);
      }
    }
  };

  useEffect(() => {
    setChecking(true);
    void checkSession();
    return () => {
      checkRequestRef.current += 1;
    };
  }, [location.pathname]);

  if (checking) {
    return (
      <PageShell className="dashboard-page">
        <div className="admin-loader">Завантаження адмінки...</div>
      </PageShell>
    );
  }

  if (loadError) {
    return (
      <PageShell className="dashboard-page">
        <EmptyState
          title="Не вдалося перевірити адмін-сесію"
          description={loadError}
          action={
            <button
              className="primary-button compact"
              type="button"
              onClick={() => {
                setChecking(true);
                void checkSession();
              }}
            >
              Повторити запит
            </button>
          }
        />
      </PageShell>
    );
  }

  if (!allowed) {
    return <Navigate to="/admin/login" replace />;
  }

  return <Outlet />;
}

export function useAdminUnsavedChanges(
  dirty: boolean,
  message = defaultUnsavedChangesMessage
) {
  const context = useContext(AdminUnsavedChangesContext);

  useEffect(() => {
    if (!context) {
      return;
    }

    context.setUnsavedMessage(dirty ? message : null);
    return () => context.setUnsavedMessage(null);
  }, [context, dirty, message]);

  useEffect(() => {
    if (!dirty) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  return (customMessage = message) => {
    if (!dirty) {
      return true;
    }

    return window.confirm(customMessage);
  };
}

export function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [unsavedMessage, setUnsavedMessage] = useState<string | null>(null);
  const [allowUnsafeNavigation, setAllowUnsafeNavigation] = useState(false);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      Boolean(unsavedMessage) &&
      !allowUnsafeNavigation &&
      currentLocation.pathname !== nextLocation.pathname
  );

  const currentSection =
    navigation.find((item) => location.pathname.startsWith(item.href)) ?? navigation[0];
  const hasUnsavedChanges = Boolean(unsavedMessage);

  useEffect(() => {
    setMenuOpen(false);
    setAllowUnsafeNavigation(false);
    setLogoutError("");
  }, [location.pathname]);

  useEffect(() => {
    if (blocker.state !== "blocked") {
      return;
    }

    const shouldLeave = window.confirm(
      unsavedMessage ?? defaultUnsavedChangesMessage
    );

    if (shouldLeave) {
      setMenuOpen(false);
      setAllowUnsafeNavigation(true);
      blocker.proceed();
      return;
    }

    blocker.reset();
  }, [blocker, unsavedMessage]);

  useEffect(() => {
    document.body.classList.toggle("menu-open", menuOpen);

    if (!menuOpen) {
      return () => {
        document.body.classList.remove("menu-open");
      };
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    const handleResize = () => {
      if (window.innerWidth > 980) {
        setMenuOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", handleResize);

    return () => {
      document.body.classList.remove("menu-open");
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", handleResize);
    };
  }, [menuOpen]);

  const confirmUnsafeNavigation = () => {
    if (!unsavedMessage) {
      return true;
    }

    return window.confirm(unsavedMessage);
  };

  const executeLogout = async () => {
    setLoggingOut(true);
    setLogoutError("");

    try {
      await api.logout();
      setMenuOpen(false);
      pushToast("Сесію завершено.", "success");
      navigate("/admin/login", { replace: true });
    } catch (caughtError) {
      const message =
        caughtError instanceof ApiError
          ? caughtError.message
          : "Не вдалося завершити сесію.";
      setAllowUnsafeNavigation(false);
      setLogoutError(message);
      pushToast(message, "error");
    } finally {
      setLoggingOut(false);
    }
  };

  const handleLogout = async () => {
    if (!confirmUnsafeNavigation()) {
      return;
    }

    setAllowUnsafeNavigation(true);
    await executeLogout();
  };

  const handleSiteNavigation = () => {
    if (!confirmUnsafeNavigation()) {
      return false;
    }

    setMenuOpen(false);
    setAllowUnsafeNavigation(true);
    return true;
  };

  const contextValue: AdminUnsavedChangesContextValue = {
    setUnsavedMessage
  };

  const renderUnsavedCard = (className = "") => {
    if (!hasUnsavedChanges) {
      return null;
    }

    return (
      <div
        className={`admin-unsaved-card ${className}`.trim()}
        role="status"
        aria-live="polite"
      >
        <strong>Незбережені зміни</strong>
        <span>Повернись до форми та збережи або скинь правки перед виходом.</span>
      </div>
    );
  };

  const renderBrandLink = (subtitle: ReactNode) => (
    <Link
      className="brand"
      to="/"
      aria-label="Orenda Cherepashka"
      onClick={(event) => {
        if (!handleSiteNavigation()) {
          event.preventDefault();
        }
      }}
    >
      <span className="brand-mark">🐢</span>
      <span className="brand-copy">
        <strong>Orenda Cherepashka</strong>
        <small>{subtitle}</small>
      </span>
    </Link>
  );

  return (
    <AdminUnsavedChangesContext.Provider value={contextValue}>
      <PageShell className="dashboard-page">
        <main className="admin-shell">
          <aside className="admin-sidebar">
            {renderBrandLink("Admin")}

            <nav className="admin-nav">
              {navigation.map((item) => (
                <NavLink
                  className={({ isActive }) =>
                    `admin-nav-link ${isActive ? "is-active" : ""}`.trim()
                  }
                  key={item.href}
                  to={item.href}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>

            <div className="admin-sidebar-footer">
              {!logoutError ? null : (
                <NoticePanel
                  title="Не вдалося завершити сесію"
                  description={logoutError}
                  tone="danger"
                  action={
                    <button
                      className="ghost-button compact"
                      type="button"
                      disabled={loggingOut}
                      onClick={() => {
                        setAllowUnsafeNavigation(true);
                        void executeLogout();
                      }}
                    >
                      Повторити вихід
                    </button>
                  }
                />
              )}
              {renderUnsavedCard("admin-sidebar-status")}
              <ThemeToggle />
              <button
                className="ghost-button compact"
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
              >
                {loggingOut ? "Вихід..." : "Вийти"}
              </button>
            </div>
          </aside>

          <section className="admin-content">
            <div className="admin-mobile-bar">
              <div className="admin-mobile-copy">
                <span>Адмінка</span>
                <strong>{currentSection.label}</strong>
                <small>{currentSection.description}</small>
                {!hasUnsavedChanges ? null : (
                  <span className="admin-unsaved-pill" role="status" aria-live="polite">
                    Незбережені зміни
                  </span>
                )}
              </div>
              <div className="admin-mobile-bar-actions">
                <Link
                  className="ghost-button compact"
                  to="/"
                  onClick={(event) => {
                    if (!handleSiteNavigation()) {
                      event.preventDefault();
                    }
                  }}
                >
                  На сайт
                </Link>
                <button
                  className="menu-toggle admin-menu-toggle"
                  type="button"
                  aria-expanded={menuOpen}
                  aria-controls="admin-mobile-menu"
                  aria-label={menuOpen ? "Закрити навігацію адмінки" : "Відкрити навігацію адмінки"}
                  onClick={() => setMenuOpen((current) => !current)}
                >
                  <span></span>
                  <span></span>
                  <span></span>
                </button>
              </div>
            </div>

            {!menuOpen ? null : (
              <div className="mobile-menu admin-mobile-menu" id="admin-mobile-menu">
                <button
                  className="mobile-menu-backdrop"
                  type="button"
                  aria-label="Закрити навігацію"
                  onClick={() => setMenuOpen(false)}
                ></button>
                <div className="mobile-menu-panel admin-mobile-menu-panel">
                  <div className="mobile-menu-head">
                    <strong>Навігація адмінки</strong>
                    <p>Швидкі переходи між розділами і діями без довгого скролу sidebar.</p>
                    {renderUnsavedCard("admin-mobile-menu-status")}
                  </div>

                  <nav className="mobile-nav admin-mobile-nav" aria-label="Мобільна навігація адмінки">
                    {navigation.map((item) => (
                      <NavLink
                        className={({ isActive }) =>
                          `admin-nav-link ${isActive ? "is-active" : ""}`.trim()
                        }
                        key={item.href}
                        to={item.href}
                      >
                        <strong>{item.label}</strong>
                        <span>{item.description}</span>
                      </NavLink>
                    ))}
                  </nav>

                  <div className="mobile-menu-actions admin-mobile-menu-actions">
                    {!logoutError ? null : (
                      <NoticePanel
                        title="Не вдалося завершити сесію"
                        description={logoutError}
                        tone="danger"
                        action={
                          <button
                            className="ghost-button compact"
                            type="button"
                            disabled={loggingOut}
                            onClick={() => {
                              setAllowUnsafeNavigation(true);
                              void executeLogout();
                            }}
                          >
                            Повторити вихід
                          </button>
                        }
                      />
                    )}
                    <ThemeToggle />
                    <button
                      className="ghost-button compact"
                      type="button"
                      onClick={handleLogout}
                      disabled={loggingOut}
                    >
                      {loggingOut ? "Вихід..." : "Вийти"}
                    </button>
                    <Link
                      className="ghost-button compact mobile-menu-admin-link"
                      to="/"
                      onClick={(event) => {
                        if (!handleSiteNavigation()) {
                          event.preventDefault();
                        }
                      }}
                    >
                      На публічний сайт
                    </Link>
                  </div>
                </div>
              </div>
            )}

            <Outlet />
          </section>
        </main>
      </PageShell>
    </AdminUnsavedChangesContext.Provider>
  );
}
