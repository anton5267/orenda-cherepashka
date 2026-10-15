import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSupabaseClient, isSupabaseConfigured } from "../supabase";
import {
  ActionButton,
  ActionLink,
  BrandLink,
  NoticePanel,
  PageShell,
  TextField,
  ThemeToggle
} from "../shared";

type RecoveryMode = "loading" | "request" | "update" | "unavailable";

export function AdminPasswordRecoveryPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<RecoveryMode>("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [recoveryLinkInvalid, setRecoveryLinkInvalid] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setMode("unavailable");
      return;
    }

    let active = true;
    let unsubscribe: () => void = () => {};
    const callbackHash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const callbackQuery = new URLSearchParams(window.location.search);
    const recoveryError = callbackHash.get("error") || callbackQuery.get("error");
    const isRecoveryCallback =
      callbackHash.get("type") === "recovery" ||
      callbackQuery.get("type") === "recovery" ||
      callbackQuery.has("code");

    void getSupabaseClient()
      .then(async (supabase) => {
        if (!active) return;

        const { data } = supabase.auth.onAuthStateChange((event, session) => {
          if (active && event === "PASSWORD_RECOVERY" && session) {
            setRecoveryLinkInvalid(false);
            setMode("update");
            setMessage("");
          }
        });
        unsubscribe = () => data.subscription.unsubscribe();

        if (recoveryError) {
          setRecoveryLinkInvalid(true);
          setMode("request");
          return;
        }

        if (!isRecoveryCallback) {
          setMode("request");
          return;
        }

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (!active) return;
        if (sessionData.session && !sessionError) {
          setMode("update");
        } else {
          setRecoveryLinkInvalid(true);
          setMode("request");
        }
      })
      .catch(() => {
        if (active) setMode("unavailable");
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const requestReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");

    try {
      const supabase = await getSupabaseClient();
      const redirectTo = new URL("/admin/reset-password", window.location.origin).toString();
      await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo });
      setMessage("Якщо для цієї адреси є обліковий запис адміністратора, ми надіслали лист з інструкціями.");
    } catch {
      setError("Не вдалося надіслати запит зараз. Перевір адресу й спробуй ще раз трохи пізніше.");
    } finally {
      setBusy(false);
    }
  };

  const updatePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setError("");

    if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
      setError("Пароль має містити щонайменше 12 символів, великі й малі літери та цифру.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Паролі не збігаються.");
      return;
    }

    setBusy(true);
    try {
      const supabase = await getSupabaseClient();
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        setRecoveryLinkInvalid(true);
        setMode("request");
        setError("Посилання для відновлення недійсне або вже застаріло. Запроси новий лист.");
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      await supabase.auth.signOut({ scope: "local" });
      setPassword("");
      setConfirmPassword("");
      navigate("/admin/login", { replace: true, state: { passwordChanged: true } });
    } catch {
      setError("Не вдалося змінити пароль. Запроси нове посилання та спробуй ще раз.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell className="admin-page">
      <main className="auth-shell">
        <section className="auth-card" aria-labelledby="recovery-title">
          <div className="auth-toolbar">
            <BrandLink href="/" siteName="Orenda Cherepashka" subtitle="Відновлення доступу" />
            <ThemeToggle />
          </div>

          <h1 id="recovery-title">{mode === "update" ? "Новий пароль" : "Відновлення доступу"}</h1>
          <p className="auth-note">
            {mode === "update"
              ? "Задай новий надійний пароль для адмін-панелі."
              : "Вкажи email адміністратора — надішлемо безпечне посилання для зміни пароля."}
          </p>

          {mode === "loading" ? <div className="inline-loader" role="status">Перевірка посилання…</div> : null}
          {mode === "unavailable" ? (
            <NoticePanel
              title="Відновлення недоступне"
              description="Зараз не вдається під’єднатися до сервісу авторизації. Спробуй пізніше."
              tone="warning"
            />
          ) : null}

          {mode === "request" ? (
            <form className="auth-form" onSubmit={requestReset}>
              {recoveryLinkInvalid ? (
                <NoticePanel
                  title="Посилання не працює"
                  description="Посилання для відновлення недійсне або застаріло. Можна запросити нове нижче."
                  tone="warning"
                />
              ) : null}
              {message ? <NoticePanel title="Перевір пошту" description={message} tone="success" /> : null}
              {error ? <NoticePanel title="Не вдалося надіслати запит" description={error} tone="danger" /> : null}
              <TextField
                id="recovery-email"
                label="Email адміністратора"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@example.com"
                required
              />
              <div className="auth-actions">
                <ActionButton type="submit" loading={busy} loadingLabel="Надсилаємо…">
                  Надіслати посилання
                </ActionButton>
                <ActionLink variant="secondary" href="/admin/login">Повернутися до входу</ActionLink>
              </div>
            </form>
          ) : null}

          {mode === "update" ? (
            <form className="auth-form" onSubmit={updatePassword}>
              {error ? <NoticePanel title="Не вдалося змінити пароль" description={error} tone="danger" /> : null}
              <TextField
                id="new-admin-password"
                label="Новий пароль"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Щонайменше 12 символів"
                required
              />
              <TextField
                id="confirm-admin-password"
                label="Повтори новий пароль"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Повтори пароль"
                required
              />
              <div className="auth-actions">
                <ActionButton type="submit" loading={busy} loadingLabel="Зберігаємо…">
                  Змінити пароль
                </ActionButton>
                <ActionLink variant="secondary" href="/admin/login">Повернутися до входу</ActionLink>
              </div>
            </form>
          ) : null}
        </section>
      </main>
    </PageShell>
  );
}
