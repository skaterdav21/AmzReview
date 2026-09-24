#!/usr/bin/env bash
# Deploys Review Sprint to Cloudflare in one go:
#   1. a Cloudflare Pages site (a link without your GitHub name, e.g. https://review-sprint.pages.dev)
#   2. the AI relay Worker, with your Gemini key stored as a Worker secret
#   3. config.js pointed at the relay, then the site files uploaded to Pages
#
# Required environment variables:
#   CLOUDFLARE_API_TOKEN   token with Workers Scripts: Edit and Cloudflare Pages: Edit
#   CLOUDFLARE_ACCOUNT_ID  your Cloudflare account ID
# Optional:
#   GEMINI_API_KEY         stored as the relay's secret (skip it to set the secret in the dashboard instead)
#   GROQ_API_KEY           stored as a second relay secret
#   PAGES_PROJECT          Pages project name (default: review-sprint)
#   WORKER_NAME            relay Worker name (default: review-sprint-ai)
#   WORKERS_SUBDOMAIN      account workers.dev subdomain to create if the account has none (default: reviewsprint)
#   EXTRA_ORIGINS          more site origins allowed to use the relay, comma-separated
#
# Usage: bash scripts/deploy-cloudflare.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PAGES_PROJECT="${PAGES_PROJECT:-review-sprint}"
WORKER_NAME="${WORKER_NAME:-review-sprint-ai}"
WORKERS_SUBDOMAIN="${WORKERS_SUBDOMAIN:-reviewsprint}"
GITHUB_PAGES_ORIGIN="https://skaterdav21.github.io"
API="https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID:-}"
export WRANGLER_SEND_METRICS=false

: "${CLOUDFLARE_API_TOKEN:?Set CLOUDFLARE_API_TOKEN (see relay/README.md)}"
: "${CLOUDFLARE_ACCOUNT_ID:?Set CLOUDFLARE_ACCOUNT_ID (see relay/README.md)}"

wrangler() { npx --yes wrangler@4 "$@"; }
cf() { curl -sS -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" -H "Content-Type: application/json" "$@"; }
# Reads a dotted path from JSON on stdin, printing nothing when it's missing.
json() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let v;try{v=JSON.parse(s)}catch{process.exit(0)}for(const k of process.argv[1].split("."))v=v?.[k];if(v!=null)process.stdout.write(typeof v==="object"?JSON.stringify(v):String(v))})' "$1"; }

step() { printf '\n==> %s\n' "$*"; }

step "Checking the token"
if [ "$(cf "https://api.cloudflare.com/client/v4/user/tokens/verify" | json success)" != "true" ]; then
  echo "The Cloudflare token was rejected. Check CLOUDFLARE_API_TOKEN." >&2; exit 1
fi

step "Pages project: ${PAGES_PROJECT}"
PAGES_HOST="$(cf "${API}/pages/projects/${PAGES_PROJECT}" | json result.subdomain)"
if [ -z "$PAGES_HOST" ]; then
  created="$(cf -X POST "${API}/pages/projects" --data "{\"name\":\"${PAGES_PROJECT}\",\"production_branch\":\"main\"}")"
  PAGES_HOST="$(printf '%s' "$created" | json result.subdomain)"
  [ -n "$PAGES_HOST" ] || { echo "Could not create the Pages project: $(printf '%s' "$created" | json errors)" >&2; exit 1; }
fi
PAGES_ORIGIN="https://${PAGES_HOST}"
echo "Site address: ${PAGES_ORIGIN}"

step "workers.dev subdomain"
SUB="$(cf "${API}/workers/subdomain" | json result.subdomain)"
if [ -z "$SUB" ]; then
  made="$(cf -X PUT "${API}/workers/subdomain" --data "{\"subdomain\":\"${WORKERS_SUBDOMAIN}\"}")"
  SUB="$(printf '%s' "$made" | json result.subdomain)"
  [ -n "$SUB" ] || { echo "Could not create workers.dev subdomain '${WORKERS_SUBDOMAIN}' (try WORKERS_SUBDOMAIN=another-name): $(printf '%s' "$made" | json errors)" >&2; exit 1; }
fi
RELAY_URL="https://${WORKER_NAME}.${SUB}.workers.dev"

ORIGINS="${GITHUB_PAGES_ORIGIN},${PAGES_ORIGIN}${EXTRA_ORIGINS:+,${EXTRA_ORIGINS}}"
step "Deploying the relay Worker (allowed sites: ${ORIGINS})"
(cd "${ROOT}/relay" && wrangler deploy --name "${WORKER_NAME}" --var "ALLOWED_ORIGINS:${ORIGINS}")

if [ -n "${GEMINI_API_KEY:-}" ]; then
  step "Storing GEMINI_API_KEY as a Worker secret"
  printf '%s' "$GEMINI_API_KEY" | (cd "${ROOT}/relay" && wrangler secret put GEMINI_API_KEY --name "${WORKER_NAME}")
else
  echo "GEMINI_API_KEY not set: add it in the dashboard under Worker → Settings → Variables and Secrets."
fi
if [ -n "${GROQ_API_KEY:-}" ]; then
  step "Storing GROQ_API_KEY as a Worker secret"
  printf '%s' "$GROQ_API_KEY" | (cd "${ROOT}/relay" && wrangler secret put GROQ_API_KEY --name "${WORKER_NAME}")
fi

step "Pointing config.js at ${RELAY_URL}"
node -e '
  const fs = require("fs"); const file = process.argv[1];
  const src = fs.readFileSync(file, "utf8").replace(/relayUrl:\s*"[^"]*"|relayUrl:\s*'"'"'[^'"'"']*'"'"'/, `relayUrl: ${JSON.stringify(process.argv[2]).replace(/"/g, "'"'"'")}`);
  fs.writeFileSync(file, src);
' "${ROOT}/config.js" "${RELAY_URL}"
grep -n "relayUrl" "${ROOT}/config.js"

step "Uploading the site to Pages"
SITE_DIR="$(mktemp -d)"
cp "${ROOT}"/*.html "${ROOT}"/*.js "${ROOT}"/*.css "${SITE_DIR}/"
wrangler pages deploy "${SITE_DIR}" --project-name "${PAGES_PROJECT}" --branch main --commit-dirty=true
rm -rf "${SITE_DIR}"

step "Checking the relay"
curl -sS -m 20 "${RELAY_URL}/" || echo "(could not reach ${RELAY_URL} from here; open it in a browser)"
printf '\n\nDone.\n  Site:  %s\n  Relay: %s\nCommit config.js so GitHub Pages uses the relay too.\n' "${PAGES_ORIGIN}" "${RELAY_URL}"
