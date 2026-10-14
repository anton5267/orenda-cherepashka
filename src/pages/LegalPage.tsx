import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { isStaticSite, staticSiteBasePath } from "../api";
import { BrandLink, PageShell, ThemeToggle } from "../shared";

const pageContent = {
  privacy: {
    title: "Політика конфіденційності",
    sections: [
      ["Які дані ми отримуємо", "Ім'я, Telegram/email/номер і коментар, які ти добровільно залишаєш у формі заявки."],
      ["Навіщо вони потрібні", "Щоб зв'язатися щодо обраної підписки, уточнити тариф і підтвердити замовлення."],
      ["Зберігання", "Заявки доступні лише адміністратору сайту та зберігаються у захищеній базі до моменту видалення або завершення роботи із зверненням."],
      ["Треті сторони", "Ми не продаємо контактні дані. Telegram використовується лише як канал зв'язку за твоїм вибором."]
    ]
  },
  terms: {
    title: "Умови оренди",
    sections: [
      ["Як працює замовлення", "Ти обираєш сервіс і тариф, залишаєш контакт, після чого продавець підтверджує доступність та актуальну ціну в Telegram."],
      ["Актуальність", "Ціна, строк і доступність можуть змінюватися до моменту підтвердження замовлення."],
      ["Використання", "Доступ призначений для особистого використання відповідно до правил відповідного сервісу. Не передавай доступ третім особам без узгодження."]
    ]
  },
  refund: {
    title: "Умови заміни та повернення",
    sections: [
      ["Проблема з доступом", "Якщо доступ не працює або не відповідає підтвердженому тарифу, напиши продавцю через Telegram із номером заявки."],
      ["Заміна", "Після перевірки проблеми продавець узгоджує заміну або інший спосіб вирішення ситуації."],
      ["Повернення", "Умови повернення залежать від фактично використаного строку та конкретного сервісу й погоджуються до завершення замовлення."]
    ]
  },
  contacts: {
    title: "Контакти продавця",
    sections: [
      ["Telegram продавця", "Основний канал для замовлення, підтвердження та підтримки: @yts_nnn."],
      ["Telegram-канал новин", "Оновлення доступності та нові пропозиції: @arenda_cherepashka."],
      ["Перед зверненням", "Вкажи назву сервісу, тариф і коротко опиши питання — це пришвидшить відповідь."]
    ]
  }
} as const;

export function LegalPage() {
  const { slug = "privacy" } = useParams();
  const content = useMemo(
    () => pageContent[slug as keyof typeof pageContent] ?? pageContent.privacy,
    [slug]
  );
  const homeHref = isStaticSite ? `${staticSiteBasePath}/` : "/";

  return (
    <PageShell>
      <header className="site-header is-scrolled">
        <div className="shell">
          <div className="header-row">
            <BrandLink href={homeHref} siteName="Orenda Cherepashka" subtitle="Оренда підписок" />
            <div className="header-actions">
              <ThemeToggle />
              <a className="ghost-button compact" href={homeHref}>До сайту</a>
            </div>
          </div>
        </div>
      </header>
      <main className="legal-page-main">
        <div className="shell narrow legal-page-card">
          <span className="section-kicker">Orenda Cherepashka</span>
          <h1>{content.title}</h1>
          {content.sections.map(([heading, text]) => (
            <section key={heading}>
              <h2>{heading}</h2>
              <p>{text}</p>
            </section>
          ))}
          <a className="primary-button compact" href={homeHref}>Повернутися до каталогу</a>
        </div>
      </main>
    </PageShell>
  );
}
