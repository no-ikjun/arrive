#!/usr/bin/env bash
# Run on a GitHub-hosted runner. Runtime secrets stay in Kubernetes.
set -euo pipefail
: "${APP:?}" "${IMAGE:?}" "${GITHUB_SHA:?}" "${GITHUB_RUN_NUMBER:?}" "${GITHUB_RUN_ID:?}" "${GITHUB_RUN_ATTEMPT:?}"
: "${LIGHTSAIL_HOST:?}" "${LIGHTSAIL_USERNAME:?}" "${LIGHTSAIL_SSH_KEY:?}" "${RUNNER_TEMP:?}"
[[ "$APP" == arrive || "$APP" == sprit ]]
[[ "$IMAGE" =~ ^docker\.io/ikjunchoi/(arrive-together-be|sprit)@sha256:[a-f0-9]{64}$ ]]
[[ "$GITHUB_SHA" =~ ^[a-f0-9]{40}$ ]]
[[ "$GITHUB_RUN_NUMBER" =~ ^[1-9][0-9]*$ && "$GITHUB_RUN_ID" =~ ^[1-9][0-9]*$ && "$GITHUB_RUN_ATTEMPT" =~ ^[1-9][0-9]*$ ]]
[[ "${SSH_PORT:-22}" =~ ^[0-9]+$ ]]
key_file=$(mktemp "$RUNNER_TEMP/lightsail-key.XXXXXX")
trap 'rm -f "$key_file"' EXIT
chmod 600 "$key_file"
printf '%s\n' "$LIGHTSAIL_SSH_KEY" > "$key_file"
ssh -i "$key_file" -p "${SSH_PORT:-22}" \
  -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes \
  -o HostKeyAlias=lightsail-production \
  -o UserKnownHostsFile=scripts/ci/lightsail_known_hosts \
  -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=4 \
  "$LIGHTSAIL_USERNAME@$LIGHTSAIL_HOST" \
  "sudo -n /usr/local/sbin/lightsail-k3s-deploy $APP $IMAGE $GITHUB_SHA $GITHUB_RUN_NUMBER $GITHUB_RUN_ID $GITHUB_RUN_ATTEMPT"
