import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../api";
import { isSupabaseConfigured } from "../supabase";
import {
  ActionButton,
  ActionLink,
  BrandLink,
  NoticePanel,
  PageShell,
  TextField,
  ThemeToggle
} from "../shared";
import { useToast } from "../toasts";

export function AdminLoginPage() {
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [sessionError, setSessionError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [retryableLogin, setRetryableLogin] = useState(false);

  const checkSession = useCallback(async () => {
    setLoading(true);
    setSessionError("");

    try {
      const session = await api.getAdminSession();
      if (session.authenticated) {
        navigate("/admin/dashboard", { replace: true });
      }
    } catch (caughtError) {
      if (
        caughtError instanceof ApiError &&
        (caughtError.status === 401 || caughtError.status === 403)
      ) {
        setSessionError("");
        return;
      }

      const message =
        caughtError instanceof ApiError ? caughtError.message : "Не вдалося перевірити сесію.";
      setSessionError(message);
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    let ignore = false;

    async function safeCheckSession() {
      try {
        setLoading(true);
        setSessionError("");
        const session = await api.getAdminSession();
        if (!ignore && session.authenticated) {
          navigate("/admin/dashboard", { replace: true });
        }
      } catch (caughtError) {
        if (!ignore) {
          if (
            caughtError instanceof ApiError &&
            (caughtError.status === 401 || caughtError.status === 403)
          ) {
            setSessionError("");
            return;
          }

          const message =
            caughtError instanceof ApiError
              ? caughtError.message
              : "Не вдалося перевірити сесію.";
          setSessionError(message);
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    safeCheckSession();
    return () => {
      ignore = true;
    };
  }, [navigate]);

  useEffect(() => {
    if (!error) {
      return;
    }

    setError("");
    setRetryableLogin(false);
  }, [identifier, password]);

  const submitPassword = useCallback(
    async (rawIdentifier: string, rawPassword: string) => {
      if (isSupabaseConfigured && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawIdentifier.trim())) {
        setRetryableLogin(false);
        setError("Вкажи коректну email-адресу адміністратора.");
        return;
      }
      if (!rawPassword.trim() || (!isSupabaseConfigured && rawPassword.trim().length < 4)) {
        setRetryableLogin(false);
        setError(isSupabaseConfigured ? "Введи пароль адміністратора." : "Введи щонайменше 4 символи.");
        return;
      }

      setSubmitting(true);
      setError("");
      setRetryableLogin(false);

      try {
        await api.login(
          isSupabaseConfigured ? rawIdentifier.trim() : rawPassword,
          isSupabaseConfigured ? rawPassword : undefined
        );
        pushToast("Авторизація успішна.", "success");
        navigate("/admin/dashboard", { replace: true });
      } catch (caughtError) {
        const message =
          caughtError instanceof ApiError ? caughtError.message : "Не вдалося увійти.";
        setError(message);
        setRetryableLogin(
          !(caughtError instanceof ApiError) ||
            caughtError.status === 0 ||
            caughtError.status === 408 ||
            caughtError.status >= 500
        );
      } finally {
        setSubmitting(false);
      }
    },
    [navigate, pushToast]
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitPassword(identifier, password);
  };

  return (
    <PageShell className="admin-page">
      <main className="auth-shell">
        <section className="auth-card">
          <div className="auth-toolbar">
            <BrandLink href="/" siteName="Orenda Cherepashka" subtitle="Адмін-панель" />
            <ThemeToggle />
          </div>

          <h1>Вхід в адмін-панель</h1>
          <p className="auth-note">
            {isSupabaseConfigured
              ? "Вхід для уповноваженого адміністратора. Реєстрація для відвідувачів вимкнена."
              : "Локальний вхід в адмін-панель. У dev-режимі без налаштувань використовується тестовий пароль admin1234."}
          </p>

          {loading ? (
            <div className="inline-loader">Перевірка сесії...</div>
          ) : (
            <form className="auth-form" onSubmit={handleSubmit}>
              {!sessionError ? null : (
                <NoticePanel
                  title="Не вдалося перевірити сесію"
                  description={sessionError}
                  tone="warning"
                  action={
                    <ActionButton
                      variant="secondary"
                      size="compact"
                      type="button"
                      onClick={() => void checkSession()}
                    >
                      Повторити запит
                    </ActionButton>
                  }
                />
              )}
              {isSupabaseConfigured ? (
                <TextField
                  id="admin-email"
                  label="Email адміністратора"
                  type="email"
                  autoComplete="username"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  placeholder="admin@example.com"
                  required
                />
              ) : null}
              <TextField
                id="admin-password"
                label="Пароль"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Введіть пароль"
                required
              />

              {!error ? null : (
                <NoticePanel
                  title="Не вдалося увійти"
                  description={error}
                  tone="danger"
                  action={
                    !retryableLogin ? undefined : (
                      <ActionButton
                        variant="secondary"
                        size="compact"
                        type="button"
                        disabled={submitting}
                        onClick={() => void submitPassword(identifier, password)}
                      >
                        Повторити вхід
                      </ActionButton>
                    )
                  }
                />
              )}

              <div className="auth-actions">
                <ActionButton type="submit" loading={submitting} loadingLabel="Вхід...">
                  Увійти
                </ActionButton>
                <ActionLink variant="secondary" href="/">
                  Назад на сайт
                </ActionLink>
              </div>
            </form>
          )}
        </section>
      </main>
    </PageShell>
  );
}
