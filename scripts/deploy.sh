#!/usr/bin/env bash
set -euo pipefail

: "${SSH_HOST:?Set SSH_HOST in GitHub variables}"
: "${SSH_USER:?Set SSH_USER in GitHub variables}"
: "${SSH_PRIVATE_KEY:?Set SSH_PRIVATE_KEY in GitHub secrets}"
: "${SSH_KNOWN_HOSTS:?Set SSH_KNOWN_HOSTS in GitHub secrets}"
: "${GHCR_USER:?Missing GHCR_USER}"
: "${GHCR_TOKEN:?Missing GHCR_TOKEN}"
: "${IMAGE:?Missing image digest}"
SSH_PORT=${SSH_PORT:-22}
DEPLOY_PATH=${DEPLOY_PATH:-/opt/loonatya}

# Restrict connection values and the path used in the remote shell command.
[[ "$SSH_HOST" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]]
[[ "$SSH_USER" =~ ^[a-zA-Z_][a-zA-Z0-9_-]*$ ]]
[[ "$SSH_PORT" =~ ^[0-9]{1,5}$ ]]
[[ "$DEPLOY_PATH" =~ ^/[a-zA-Z0-9_/-]+$ && "$DEPLOY_PATH" != / ]]
[[ "$IMAGE" =~ ^ghcr.io/keelfy/loonatya@sha256:[a-f0-9]{64}$ ]]

ssh_dir=$(mktemp -d)
trap 'rm -rf "$ssh_dir"' EXIT
chmod 700 "$ssh_dir"
printf '%s\n' "$SSH_PRIVATE_KEY" > "$ssh_dir/key"
printf '%s\n' "$SSH_KNOWN_HOSTS" > "$ssh_dir/known_hosts"
chmod 600 "$ssh_dir/key" "$ssh_dir/known_hosts"
ssh_options=(-i "$ssh_dir/key" -o BatchMode=yes -o IdentitiesOnly=yes
  -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$ssh_dir/known_hosts"
  -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=3)
target="$SSH_USER@$SSH_HOST"

# Send the short-lived registry token through encrypted stdin, not command arguments.
{
  printf 'registry_token=%q\n' "$GHCR_TOKEN"
  printf 'registry_user=%q\n' "$GHCR_USER"
  printf 'export IMAGE=%q\n' "$IMAGE"
  cat <<'REMOTE'
set -euo pipefail
cd "$1"
export DOCKER_CONFIG
DOCKER_CONFIG=$(mktemp -d)
trap 'rm -rf "$DOCKER_CONFIG"' EXIT
printf '%s' "$registry_token" | docker login ghcr.io --username "$registry_user" --password-stdin
unset registry_token
docker compose pull
docker compose up -d --wait --wait-timeout 60
REMOTE
} | ssh "${ssh_options[@]}" -p "$SSH_PORT" "$target" "bash -s -- '$DEPLOY_PATH'"
