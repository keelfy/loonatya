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
- `.github/workflows/deploy.yml`: вызываемый workflow, использует существующий Compose на VDS,
  выполняет `docker compose pull`, затем `docker compose up -d --wait`.
- `scripts/deploy.sh`: SSH-деплой с проверкой host key, временным входом в GHCR
  и ожиданием healthcheck. Ошибка pull останавливает деплой до перезапуска контейнера.

Образ: `ghcr.io/keelfy/loonatya`. Теги: `latest` и `sha-<полный commit SHA>`.
Для Compose с `image: ${IMAGE:-ghcr.io/keelfy/loonatya:latest}` автодеплой передаёт
`IMAGE` с digest успешной сборки только в окружение SSH-сеанса.
Если образ указан в серверном Compose напрямую, обновляется именно этот образ.
Сборка рассчитана на **linux/amd64**; для ARM VDS измените `platforms` в build.yml.
Запуски одной ветки сериализованы: начатый деплой не отменяется новым push.

## Настройка VDS

Нужны Bash, Docker Engine и Compose с поддержкой `up --wait`. SSH-пользователь
должен иметь доступ к Docker без интерактивного sudo и право чтения каталога сайта.
Установите публичную часть отдельного deploy-ключа в его `~/.ssh/authorized_keys`.

Первичная подготовка, пример для SSH-пользователя `deploy`:

```bash
sudo install -d -o deploy -g deploy /opt/loonatya
```

Разместите свой Compose и при необходимости `.env` в этом каталоге заранее.
Деплой не создаёт каталог, не копирует и не изменяет файлы сайта на VDS.

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

## Traefik с Docker labels

`compose.traefik.yml` подключает сайт к существующей внешней сети Traefik.
Порт на хост не публикуется: Traefik направляет запросы на порт `80` контейнера.

Создайте или дополните `/opt/loonatya/.env` на VDS:

```dotenv
COMPOSE_FILE=compose.traefik.yml
SITE_DOMAIN=loonatya.example.com
TRAEFIK_NETWORK=proxy
TRAEFIK_ENTRYPOINT=websecure
TRAEFIK_CERTRESOLVER=letsencrypt
```

Замените домен, имя Docker-сети, HTTPS entrypoint и certificate resolver на свои.
Домен указывается без `https://` и пути; его DNS должен вести на VDS.
Traefik должен использовать Docker provider, быть подключён к той же сети,
иметь указанные entrypoint и resolver. Labels сайта не создают их в Traefik.
HTTP → HTTPS redirect настройте на HTTP entrypoint существующего Traefik.
Если TLS уже настроен на HTTPS entrypoint (например, общий wildcard-сертификат),
удалите label `traefik.http.routers.loonatya.tls.certresolver` из этого Compose;
переменная `TRAEFIK_CERTRESOLVER` тогда не нужна.

Файлы в репозитории — примеры для первоначальной ручной настройки.
Если используете `COMPOSE_FILE=compose.traefik.yml`, заранее разместите этот файл
на VDS. Для стандартного `compose.yml` переменная `COMPOSE_FILE` не нужна.
Деплой использует ваш Compose и автоматически читает серверный `.env`.
Ручной запуск:

```bash
cd /opt/loonatya
docker compose up -d --wait
```

Настройки labels: [документация Traefik](https://doc.traefik.io/traefik/reference/routing-configuration/other-providers/docker/).

## Compose на сервере

`compose.yml` — готовый пример. По умолчанию порт `8080` доступен только на
`127.0.0.1`. Существующий reverse proxy на VDS должен направлять домен на
`http://127.0.0.1:8080`; TLS настраивается на этом reverse proxy.

Для прямого HTTP без reverse proxy создайте `/opt/loonatya/.env`:

```dotenv
HTTP_BIND=0.0.0.0
HTTP_PORT=80
```

Workflow выполняет в `DEPLOY_PATH` только `docker compose pull` и
`docker compose up -d --wait --wait-timeout 60`, предварительно авторизуясь в GHCR.
Compose, `.env` и ранее созданный `image.env` остаются без изменений; `image.env`
больше не используется. При ручном запуске образ выбирается из вашего Compose
и `.env`, значение `IMAGE` из предыдущего SSH-сеанса не сохраняется.
Ручной запуск:

```bash
cd /opt/loonatya
docker compose up -d --wait
docker compose logs --tail=100
```

Ручной pull приватного package требует отдельного `docker login ghcr.io` с
токеном `read:packages`: workflow не оставляет постоянные credentials на VDS.
Для публичного package авторизация при ручном pull не нужна.

## Откат

Для Compose с переменной `${IMAGE}` передайте предыдущий digest в окружение
(замените `<digest>` на действительный SHA256):

```bash
cd /opt/loonatya
export IMAGE='ghcr.io/keelfy/loonatya@sha256:<digest>'
docker compose pull
docker compose up -d --wait --wait-timeout 60
```

Автоматического отката нет. При неуспешном healthcheck workflow завершится
ошибкой, но контейнер уже может быть заменён.

## Первое включение

Настройте VDS и GitHub variables/secrets, затем отправьте файлы в ветку `main`.
Push запустит сборку и деплой. Без SSH-настроек образ соберётся, а deploy job
завершится ошибкой с именем недостающей настройки.

Контейнерная версия сайта не зависит от Sites и не требует входа в ChatGPT.

Документация: [публикация образов в GitHub Actions](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images),
[Docker Compose up](https://docs.docker.com/reference/cli/docker/compose/up/).
