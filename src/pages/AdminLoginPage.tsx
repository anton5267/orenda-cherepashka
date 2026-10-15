import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../api";
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
  }, [password]);

  const submitPassword = useCallback(
    async (rawPassword: string) => {
      if (rawPassword.trim().length < 4) {
        setRetryableLogin(false);
        setError("Введи щонайменше 4 символи.");
        return;
      }

      setSubmitting(true);
      setError("");
      setRetryableLogin(false);

      try {
        await api.login(rawPassword);
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
    await submitPassword(password);
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
            Логін для одного адміністратора. У dev-режимі, якщо env не заданий,
            пароль за замовчуванням: <code>admin1234</code>.
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
              <TextField
                id="admin-password"
                label="Пароль"
                type="password"
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
                        onClick={() => void submitPassword(password)}
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
