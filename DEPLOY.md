# Deploy guide — guitar app on minipc (mpc.local)

> **STATUS:** Раскатано и работает. Live: **https://guitar.petrochenko.info**
>
> Этот файл описывает изначально запланированный flow. Фактически
> применённая конфигурация (мая 2026) — ниже отмечена пометкой
> ✅ DEPLOYED. Расхождения с планом минимальны.

---

> Деплой на личный сервер по существующим конвенциям сервера
> (читай `/root/CLAUDE.md` и `/data/projects/caddy/INFRASTRUCTURE.md`
> на mpc для общего контекста).

## Целевая архитектура

```
Browser
   │
   ├─── (внутри сети) → guitar.mintpos.tech (resolve через Keenetic split DNS)
   │                                                  │
   ├─── (вне сети) → guitar.mintpos.tech → Cloudflare Tunnel
   │                                                  │
   ▼                                                  ▼
                          Caddy на mpc:443
                                 │
                                 ▼
              host.docker.internal:8500  (наш nginx-контейнер)
                                 │
                          serve /usr/share/nginx/html
                                 │
                          ┌──────┴──────┐
                          ▼             ▼
                       dist/        assets/
                  (build из git)   (rsync с CD)
```

## Раскатка по шагам

### 1. Локально — собрать фронт

```bash
cd ~/src/guitar
npm run build
# → dist/ ~1 МБ (HTML + JS + CSS + favicon)
```

### 2. Создать структуру проекта на сервере

```bash
ssh root@192.168.2.2 'mkdir -p /data/projects/guitar/{dist,assets}'
```

`/data/projects/guitar/`:
- `docker-compose.yml` — описание nginx-контейнера
- `nginx.conf` — конфиг (SPA fallback на index.html для hash-роутера)
- `dist/` — фронт (rsync с локали)
- `assets/` — медиа CD (rsync с локали)

### 3. Скопировать файлы

```bash
# Фронт (~1 МБ — мгновенно)
rsync -av --delete dist/ root@192.168.2.2:/data/projects/guitar/dist/

# Ассеты (~448 МБ — первый раз ~5-10 мин по гигабиту, потом инкрементально)
rsync -av --delete public/assets/ root@192.168.2.2:/data/projects/guitar/assets/
```

### 4. Создать `docker-compose.yml` на сервере

```yaml
# /data/projects/guitar/docker-compose.yml
services:
  guitar:
    image: nginx:alpine
    container_name: guitar
    restart: unless-stopped
    ports:
      - "127.0.0.1:8500:80"   # привязать только к localhost — Caddy проксирует
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - ./dist:/usr/share/nginx/html:ro
      - ./assets:/usr/share/nginx/html/assets:ro
```

### 5. Создать `nginx.conf`

```nginx
# /data/projects/guitar/nginx.conf
server {
  listen 80 default_server;
  server_name _;

  root /usr/share/nginx/html;
  index index.html;

  # SPA hash-router — не нужен fallback, hash роутится клиентом.
  # Но если будем на history-mode позже:
  # try_files $uri $uri/ /index.html;

  # Большие медиа отдавать с Range support (для seek в видео)
  location /assets/ {
    add_header Access-Control-Allow-Origin "*";
    expires 30d;
    add_header Cache-Control "public, immutable";
  }

  # HTML — без кэша (всегда свежий после деплоя)
  location = /index.html {
    expires off;
    add_header Cache-Control "no-store, must-revalidate";
  }

  # Сжатие
  gzip on;
  gzip_types text/css application/javascript application/json image/svg+xml;
  gzip_min_length 1024;
}
```

### 6. Запустить контейнер

```bash
ssh root@192.168.2.2 '
  cd /data/projects/guitar
  docker compose up -d
  docker logs guitar --tail 20
'
```

### 7. Зарегистрировать домен через `domain-manager`

```bash
ssh root@192.168.2.2 '
  /data/projects/caddy/domain-manager.py add guitar 8500
'
```

Это сделает три вещи (по INFRASTRUCTURE.md):
- Добавит блок в Caddyfile с reverse_proxy на host.docker.internal:8500
- Перезагрузит Caddy
- Обновит Cloudflare DNS + Keenetic split DNS

После — **https://guitar.mintpos.tech** работает откуда угодно.

### 8. Бэкап исходного ISO (отдельная задача)

```bash
# С локали:
rsync -av ~/Downloads/Guitar.iso root@192.168.2.2:/data/backups/guitar/

# Опционально: вторая копия в iCloud Drive
cp ~/Downloads/Guitar.iso ~/Library/Mobile\ Documents/com~apple~CloudDocs/backups/
```

## Авторизация

По умолчанию без auth — кто узнает URL, тот зайдёт. Контент CD —
лицензированный, но это персональное использование за приватной DNS,
утечка маловероятна.

**Если нужна basic auth — добавить в Caddyfile:**

```caddy
guitar.mintpos.tech {
    import no_index
    basicauth {
        apetrochenko $2a$14$<bcrypt-hash>
    }
    reverse_proxy host.docker.internal:8500
}
```

Bcrypt-hash сгенерировать: `caddy hash-password`.

**Альтернатива — Cloudflare Access**: на стороне Cloudflare настроить
правило «только мой Google account». Сложнее в настройке, но не нужно
помнить ещё один пароль.

## Update workflow (после первого деплоя)

```bash
# изменили код локально
npm run build
rsync -av --delete dist/ root@192.168.2.2:/data/projects/guitar/dist/
# Готово. nginx читает файлы по volume — restart не нужен.
```

Если меняли `nginx.conf`:
```bash
ssh root@192.168.2.2 'cd /data/projects/guitar && docker compose restart guitar'
```

## Auto-deploy через GitHub Actions (опционально, бонус)

На сервере уже крутится `github_actions_runner` (виден в `docker ps`).
Можно прицепить его к нашему репо:

1. В GitHub → Settings → Actions → Self-hosted runners → видно ваш runner
2. Создать `.github/workflows/deploy.yml`:
   ```yaml
   on:
     push:
       branches: [main]
   jobs:
     deploy:
       runs-on: self-hosted
       steps:
         - uses: actions/checkout@v4
         - run: npm ci
         - run: npm run build
         - run: rsync -av --delete dist/ /data/projects/guitar/dist/
   ```
3. На каждый push в main → авто-деплой за 30 секунд.

Ассеты (`public/assets/`) в Git нет — они отдельно (см. шаг 3 выше).

## Размеры на сервере после деплоя

| Что | Размер |
|---|---|
| `/data/projects/guitar/dist/` | ~1 МБ |
| `/data/projects/guitar/assets/` | ~448 МБ |
| `/data/backups/guitar/Guitar.iso` | ~572 МБ |
| **Итого** | **~1 ГБ** (на 429 ГБ свободного места) |

## Проверка после деплоя

```bash
# на mpc:
docker logs guitar --tail 20            # nginx логи
curl -I http://localhost:8500/          # должен 200 OK

# с локали в браузере:
open https://guitar.mintpos.tech
```

Должна открыться home-страница со всеми 7 песнями.
