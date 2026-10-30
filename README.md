# loonatya

Статический мини-сайт Лунати. Исходники — `site/index.html` и `site/avatar.png`.
Контейнер раздаёт их через Nginx; Node.js и отдельная сборка фронтенда не нужны.

## Локальный запуск

```bash
docker build -t loonatya:local .
cp .env.example .env
IMAGE=loonatya:local docker compose up -d --wait
```

Сайт: <http://localhost:8080>. Проверка: `curl -f http://localhost:8080/healthz`.

## GitHub Actions

- `.github/workflows/build.yml`: на PR проверяет сборку; на push в `main` или ручной
  запуск с `main` публикует образ в GHCR и вызывает деплой.
- `.github/workflows/deploy.yml`: вызываемый workflow, копирует Compose на VDS,
  выполняет `docker compose pull`, затем `docker compose up -d --wait`.
- `scripts/deploy.sh`: SSH-деплой с проверкой host key, временным входом в GHCR
  и ожиданием healthcheck. Ошибка pull останавливает деплой до перезапуска контейнера.

Образ: `ghcr.io/keelfy/loonatya`. Теги: `latest` и `sha-<полный commit SHA>`.
Автодеплой использует digest конкретной успешной сборки, а не изменяемый `latest`.
Сборка рассчитана на **linux/amd64**; для ARM VDS измените `platforms` в build.yml.
Запуски одной ветки сериализованы: начатый деплой не отменяется новым push.

## Настройка VDS

Нужны Bash, Docker Engine и Compose с поддержкой `up --wait`. SSH-пользователь
должен иметь доступ к Docker без интерактивного sudo и право записи в каталог сайта.
Установите публичную часть отдельного deploy-ключа в его `~/.ssh/authorized_keys`.

Первичная подготовка, пример для SSH-пользователя `deploy`:

```bash
sudo install -d -o deploy -g deploy /opt/loonatya
```

В GitHub создайте environment **production** в Settings → Environments.
Добавьте variables и secrets в этот environment (или на уровне репозитория).

| Тип | Имя | Значение |
| --- | --- | --- |
| Variable | `SSH_HOST` | DNS-имя или IPv4 VDS |
| Variable | `SSH_USER` | SSH-пользователь, например `deploy` |
| Variable | `SSH_PORT` | Необязательно, по умолчанию `22` |
| Variable | `DEPLOY_PATH` | Необязательно, по умолчанию `/opt/loonatya`; абсолютный путь без пробелов |
| Secret | `SSH_PRIVATE_KEY` | Полный приватный deploy-ключ без passphrase |
| Secret | `SSH_KNOWN_HOSTS` | Проверенная строка known_hosts для VDS; для нестандартного порта — `[host]:port` |

Для получения host key можно выполнить `ssh-keyscan -p 22 your-vds.example`.
Сверьте fingerprint с ключом через доверенную консоль VDS перед сохранением.
Workflow не принимает неизвестный ключ автоматически.

Отдельный PAT для автодеплоя не нужен: workflow использует краткоживущий
`GITHUB_TOKEN` с `packages:read`. Временный Docker config на VDS удаляется после
деплоя. GHCR package должен разрешать этому репозиторию Actions access;
новый package, созданный workflow, связывается с репозиторием автоматически.

## Compose на сервере

`compose.yml` — готовый пример. По умолчанию порт `8080` доступен только на
`127.0.0.1`. Существующий reverse proxy на VDS должен направлять домен на
`http://127.0.0.1:8080`; TLS настраивается на этом reverse proxy.

Для прямого HTTP без reverse proxy создайте `/opt/loonatya/.env`:

```dotenv
HTTP_BIND=0.0.0.0
HTTP_PORT=80
```

Workflow сохраняет `.env` и записывает digest успешного деплоя в `image.env`.
Ручной повторный запуск уже загруженного образа:

```bash
cd /opt/loonatya
docker compose --env-file .env --env-file image.env up -d --wait
docker compose --env-file .env --env-file image.env logs --tail=100
```

Ручной pull приватного package требует отдельного `docker login ghcr.io` с
токеном `read:packages`: workflow не оставляет постоянные credentials на VDS.
Для публичного package авторизация при ручном pull не нужна.

## Откат

Укажите digest предыдущей успешной сборки в `image.env`, затем выполните:

```bash
docker compose --env-file .env --env-file image.env pull
docker compose --env-file .env --env-file image.env up -d --wait --wait-timeout 60
```

Автоматического отката нет. При неуспешном healthcheck workflow завершится
ошибкой; предыдущий `image.env` сохранится, но контейнер уже может быть заменён.

## Первое включение

Настройте VDS и GitHub variables/secrets, затем отправьте файлы в ветку `main`.
Push запустит сборку и деплой. Без SSH-настроек образ соберётся, а deploy job
завершится ошибкой с именем недостающей настройки.

Контейнерная версия сайта не зависит от Sites и не требует входа в ChatGPT.

Документация: [публикация образов в GitHub Actions](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images),
[Docker Compose up](https://docs.docker.com/reference/cli/docker/compose/up/).
