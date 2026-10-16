# Де знаходиться актуальний проєкт

Єдиним джерелом коду є [GitHub `anton5267/orenda-cherepashka`](https://github.com/anton5267/orenda-cherepashka), гілка `main`. Cloudflare Pages автоматично збирає цю гілку та публікує <https://orenda-cherepashka-live.pages.dev/>. Сайт не читає файли напряму з комп'ютера власника.

У `Downloads` залишилися три локальні папки з історії розробки:

| Папка | Призначення |
| --- | --- |
| `orenda-cherepashka-clone-main/orenda-cherepashka-git` | Актуальний локальний Git checkout, синхронізований з `main` |
| `orenda-cherepashka-clone-main/orenda-cherepashka-clone-main` | Початкова розпакована копія без Git-історії |
| `orenda-cherepashka-supabase` і `orenda-cherepashka-clone-github` | Старіші Git checkout того самого репозиторію; їхні коміти вже є в актуальній історії |

Для подальших змін відкривайте актуальний checkout або зробіть новий `git clone` з GitHub. Старі папки не потрібні для роботи опублікованого сайту. Видалення локальних копій не впливає на GitHub, Cloudflare або Supabase, але приватні локальні файли варто зберегти окремо за потреби.

## Що зберігається в GitHub

- `src/`, `shared/`, `public/`, `styles.css` — вітрина й адмін-інтерфейс.
- `supabase/migrations/`, `supabase/functions/` — версії схеми та Edge Functions, але не живі записи бази.
- `server/`, `Dockerfile` — код альтернативного локального/Docker-режиму з SQLite, а не база production-сайту. Локальні файли `data/` виключені з Git.
- `.github/workflows/` — CI, регулярне оновлення публічної стрічки новин і перенаправлення старого GitHub Pages.
- `README.md`, [стан проєкту](PROJECT_STATUS.md), [розгортання](../supabase/DEPLOYMENT.md) і [план резервування](../supabase/BACKUP.md) — інструкції та чесно зафіксовані межі перевірок.

## Що зберігається окремо

Production-дані й облікові записи зберігаються у Supabase, а налаштування розгортання — у Cloudflare Pages. Значення секретів і Deploy Hook зберігаються в налаштуваннях сервісів/GitHub Actions secrets. Приватні `.env`, `node_modules`, зібрані `dist`, локальні артефакти тестів і резервні копії виключені з Git через `.gitignore`. GitHub-репозиторій публічний, тому паролі, токени, приватні записи заявок і повну копію production-бази сюди не додають.

Після змін коду запустіть `npm run ci:verify` і `npm run self-qa:auth-recovery`, запуште гілку та перевірте GitHub Actions. Після злиття в `main` перевірте новий Cloudflare deployment і відповідний шлях на основній адресі. Резервне копіювання Supabase виконують окремо за [інструкцією](../supabase/BACKUP.md).
