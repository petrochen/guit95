# Backlog

> Идеи отложенные «на потом». Всё что в этом файле — не блокер, не баг,
> а предложения по развитию. Можно брать в работу по одной фразе.

## ✅ Done since previous version

- ✅ **Фото артистов на карточках home** (Phase 7b — cropped from CD
  TITLE1B.BMP + TITLE2.BMP via ffmpeg crop)
- ✅ **Hover-анимации карточек** (translateY-2px + border highlight)
- ✅ **Hand close-up фото в NOW** (Phase 9a)
- ✅ **«↪ Show in song» jump-icon** на аккордах (Phase 9a)
- ✅ **Lyrics overlay** — 3-4 страницы из CD (Phase 9b)
- ✅ **About / Credits** — 6 страниц Ubi Soft (Phase 9b)
- ✅ **Title backdrop** на home (Phase 9b — dimmed TITLE1B.BMP)
- ✅ **Tuner reference notes** (Phase 9c — 6 эталонов WAV с CD)
- ✅ **Toolkit** (Phase 9c — 9 общих упражнений с правильным close-up+голос)
- ✅ **Multi-segment exercises** (Phase 9c)
- ✅ **Production deploy** на guitar.petrochenko.info (Docker + Caddy +
  Cloudflare Tunnel на mpc)
- ✅ **GitHub repo** github.com/petrochen/guit95 (публичный, MIT для движка)

## Visual polish (UI overhaul) — planned via Claude Design

> Сейчас выглядит как «улучшенный инженерный прототип». Запланирован
> **Retro 90s synthwave redesign через Claude Design** (web tool от
> Anthropic Labs, claude.ai/design). Workflow: импортировать
> petrochen/guit95 → итерировать дизайн на canvas → Handoff to Claude
> Code → применить bundle на кодбейс.

- [ ] **Claude Design UI revamp** — вектор: retro 90s synthwave.
      Палитра: deep purple `#1a0d24` background, hot pink `#ff2e88` +
      electric cyan `#00f5ff` accents. VT323 (Google Font) для display.
      Subtle CRT scanlines overlay. Chunky hard-shadow buttons
      `box-shadow: 3px 3px 0 #000`. Per-song neon accent в NOW.
- [ ] **Акцентный цвет на песню** — `accentColor` в SongMeta. Цвета
      (synthwave-tinted):
      Hendrix=psychedelic-purple `#a855f7`,
      Marley=rasta-lime `#84cc16`,
      SRV=blues-blue `#3b82f6`,
      Skynyrd=southern-amber `#f97316`,
      Kansas=dust-amber `#fbbf24`,
      Dylan=folk-lavender `#a78bfa`,
      Cat Stevens=coral `#fb7185`.
- [ ] **Типографика** — VT323 для display + system sans для body.
- [ ] **Плавные переходы Home↔Song** — fade 200ms (View Transitions API).
- [ ] **Loading state при переключении песни** — spinner / skeleton.
- [ ] **Логотип / favicon** — мини-знак приложения.

## Practice features

- [ ] **Practice journal** — сегодня занимался N минут, недельный
      streak. Сохранять в localStorage `practice-log[date] = seconds`.
      Показывать на home или отдельной секции. ~3 часа.
- [ ] **Именованные сохранённые лупы** — «Hey Joe куплет», «Sweet Home
      соло», и т.д. Сейчас A/B живёт только в сессии. Добавить кнопку
      «💾 Save loop», список сохранённых лупов в side panel или меню.
      ~2 часа.
- [ ] **Заметки на упражнение** — текстовое поле с автосейвом в
      localStorage `notes[slug][exerciseDisplayIdx] = string`. ~1 час.
- [ ] **Зеркало видео для левшей** — `transform: scaleX(-1)` на
      `<video>` с кнопкой-тогглом. ~30 мин.
- ❌ **Tuner FFT/YIN** — отвергнуто (у пользователя тюнер в телефоне)
- ❌ **Metronome** — отвергнуто (у пользователя метроном в телефоне)

## Onboarding / открытие

- [ ] **Onboarding-тур** при первом визите — 5 шагов с подсветкой
      кнопок (Shepherd.js без зависимостей или просто DIV-overlay
      handcrafted). ~2 часа.
- ✅ **About / Credits** (Phase 9b — 6 оригинальных страниц Ubi Soft)

## Доставка / устройства

- [ ] **PWA — installable** — manifest.json + service worker + icon.
      Можно «Add to Dock» на macOS, открывать как родное приложение.
      ~1 час.
- ✅ **Деплой на личный сервер** (mpc, Caddy + Cloudflare Tunnel,
      live на guitar.petrochenko.info)
- [ ] **Базовая аутентификация** — Cloudflare Access (по Google
      account) или Caddy `basicauth`. Сейчас открыто (security-by-
      obscurity через приватную DNS).
- [ ] **GitHub Actions auto-deploy** — на сервере уже крутится
      self-hosted runner. Нужен workflow для `npm run build` + rsync
      на push в main. ~30 мин.

## Архитектура / технический долг

- ✅ **Многосегментные упражнения** (Phase 9c — EXR парсер собирает
      все aviopen + playsnd, UI рендерит Part-кнопки)
- [ ] **Полный sequence-runner для всех 15 опкодов** оригинального
      CD — позволит переиспользовать оригинальные сценарии 1-в-1.
      Большая работа. См. SPEC.md §3.2. Низкий приоритет.
- ❌ **Альтернативные аранжировки `<song>2.sng`** — отвергнуто, это
      просто альт UI layout (другие позиции кнопок на `play2.bmp`
      фоне), ссылается на тот же SCO + те же exercises. Не другой
      контент.
- ❌ **`chords2.cho`** — отвергнуто, та же причина (только UI вариация)
- ✅ **Toolkit** (Phase 9c — 9 упражнений с faithful CD-style чередованием
      close-up+голос → silent normal-tempo demo)
- ❌ **Words / тексты с подсветкой** — отвергнуто, нет таймингов в
      WORDS файлах на CD. Только статичные страницы — реализовано
      как Lyrics overlay в Phase 9b.
- [ ] **Глобальные UBI-анимации** — оригинал показывал 8 декоративных
      анимаций (`ANIMS/*.UBI`) каждые 5-60 секунд. Формат не
      разобран. Низкий приоритет.

## Качество жизни

- [ ] **Multiple speed presets** beyond 0.5/0.75/1 — например, 0.4×
      для совсем медленной практики.
- [ ] **A↔B loop через клик-тащить на партитуре** — сейчас только через
      кнопки/хоткеи. Drag-to-select region was Phase 8 plan but не
      сделали.
- [ ] **Volume per stream** — отдельная громкость для видео (бэк-трек)
      и сэмплов аккордов.
- [ ] **Search / filter songs** — пока всего 7, не нужно. Если когда-то
      добавить разные CD.

## Claude tooling automation (research result, май 2026)

> Изучено в чате — что из инфраструктуры Claude может ускорить
> разработку/деплой этого проекта.

- [ ] **Telegram channel** — `claude --channels plugin:telegram@claude-plugins-official`.
      Бот в Telegram → пишу с телефона «фикс баг X», «деплой на mpc»,
      «добавь идею в BACKLOG» → клод-агент дома делает + отвечает в
      Telegram. Setup: BotFather → токен → `/plugin install telegram@claude-plugins-official`
      → `/telegram:configure <token>`. ~10 мин.
- [ ] **Git push hook → auto-deploy + Telegram notify** —
      `~/.claude/settings.json` hook `Stop` после успешного git push:
      `rsync dist/ root@mpc:/data/projects/guitar/dist/` + Telegram
      «✅ deployed».
- [ ] **`/schedule` weekly backup** — раз в неделю: `rsync ~/Downloads/Guitar.iso
      root@mpc:/data/backups/guitar/` + проверка свободного места + ping
      в Telegram если <50ГБ.
- [ ] **Claude Code Web** для работы с чужого компа — клон репо в
      облачном sandbox без вашего Mac.
- [ ] **Notion MCP** для practice journal — каждый день: «сколько занимался,
      какие фразы освоил, что было сложно».
- [ ] **Spotify MCP** для контекста — «какую песню я слушаю в Spotify?»
      → если есть в нашем CD-listing → быстрый jump к её плееру.

---

## Технические детали для деплоя на свой сервер

> ⚠ Этот раздел был планом ДО фактической раскатки. Сейчас живёт на
> guitar.petrochenko.info. Актуальная инструкция — в `DEPLOY.md`.

### Что и куда

```
guitar.mpc.local/                  ← свой сервер
├── (root, served by nginx/caddy)
│   ├── index.html               ← из dist/ после vite build
│   ├── assets/...               ← из dist/assets/
│   └── public-assets/           ← это копия public/assets/ — переименовать!
│       ├── heyjoe/
│       ├── jingles/
│       └── ... (все 7 песен + jingles)
```

### Шаги деплоя

1. На своей машине: `npm run build` → создаёт `dist/` (~1 МБ HTML/JS/CSS).
2. `rsync -av dist/ user@mpc:/var/www/guitar/` — фронт.
3. `rsync -av public/assets/ user@mpc:/var/www/guitar/assets/` — медиа
   (~448 МБ, первый раз долго, потом инкрементально).
4. Nginx config: serve static, fallback `index.html` для роутинга.
5. (Опционально) basic auth через nginx `auth_basic` — пара строк.

### Альтернативы

- **GitHub Pages**: ассеты не лезут (>1 ГБ ограничение, индивидуальный
  файл >100 МБ блокируется LFS). Вариант: git LFS + Pages. Возможно но
  морочно.
- **Cloudflare Pages / Netlify / Vercel**: бесплатный фронт, но ассеты
  в публичный CDN — лицензионно сомнительно (Hendrix Records скажет
  спасибо). Свой сервер с авторизацией — единственный безопасный вариант.
- **Tailscale**: разместить на Mac mini с tailscale — доступно с
  твоих устройств без публичного IP.

### Цена для GitHub free

Что попадёт в репо: ~500 КБ (исходники + спеки + docs + node_modules
исключён). GitHub free — лимит 1 ГБ на репо, файл до 100 МБ. **Влезает
с огромным запасом.** Никаких LFS не нужно.
