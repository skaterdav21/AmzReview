#!/usr/bin/env bash
# Deploys Review Sprint to Cloudflare in one go:
#   1. a Cloudflare Pages site (a link without your GitHub name, e.g. https://review-sprint.pages.dev)
#   2. the AI relay Worker, with your Gemini key stored as a Worker secret
#   3. config.js pointed at the relay, then the site files uploaded to Pages
#
# Sign in first with EITHER:
#   npx wrangler login                         (browser login; add --browser=false to pick the browser)
#   or CLOUDFLARE_API_TOKEN (+ CLOUDFLARE_ACCOUNT_ID) set in this terminal
# Optional:
#   GEMINI_API_KEY         stored as the relay's secret (otherwise you're asked for it; press Enter to skip)
#   GROQ_API_KEY           stored as a second relay secret
#   CLOUDFLARE_ACCOUNT_ID  needed if your login can see more than one Cloudflare account
#   PAGES_PROJECT          Pages project name (default: review-sprint)
#   WORKER_NAME            relay Worker name (default: review-sprint-ai)
#   EXTRA_ORIGINS          more site origins allowed to use the relay, comma-separated
#
# Usage: bash scripts/deploy-cloudflare.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PAGES_PROJECT="${PAGES_PROJECT:-review-sprint}"
WORKER_NAME="${WORKER_NAME:-review-sprint-ai}"
GITHUB_PAGES_ORIGIN="https://skaterdav21.github.io"
export WRANGLER_SEND_METRICS=false

# WRANGLER_BIN lets tests substitute a stub.
wrangler() { if [ -n "${WRANGLER_BIN:-}" ]; then "$WRANGLER_BIN" "$@"; else npx --yes wrangler@4 "$@"; fi; }
step() { printf '\n==> %s\n' "$*"; }
die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

step "Checking your Cloudflare login"
WHOAMI="$(wrangler whoami 2>&1 || true)"
if printf '%s' "$WHOAMI" | grep -qi "not authenticated"; then
  die "Not signed in. Run 'npx wrangler login' (or set CLOUDFLARE_API_TOKEN) and try again."
fi
printf '%s\n' "$WHOAMI" | grep -iE "logged in|associated with|account" | head -5 || true

if [ -z "${GEMINI_API_KEY:-}" ] && [ -t 0 ]; then
  printf '\nPaste the Gemini API key for the relay (input hidden), or press Enter to add it later: '
  read -rs GEMINI_API_KEY; echo
fi

step "Pages project: ${PAGES_PROJECT}"
CREATE_OUT="$(wrangler pages project create "${PAGES_PROJECT}" --production-branch main 2>&1 || true)"
if printf '%s' "$CREATE_OUT" | grep -qiE "more than one account|multiple accounts"; then
  die "Your login can see several Cloudflare accounts. Set CLOUDFLARE_ACCOUNT_ID (Workers & Pages → right sidebar) and run again."
fi
LIST_OUT="$(wrangler pages project list 2>&1 || true)"
PAGES_HOST="$(printf '%s\n%s\n' "$LIST_OUT" "$CREATE_OUT" | grep -oE "\b${PAGES_PROJECT}(-[a-z0-9]+)?\.pages\.dev\b" | head -1 || true)"
if [ -z "$PAGES_HOST" ]; then
  printf '%s\n' "$CREATE_OUT" >&2
  die "Could not find or create the Pages project '${PAGES_PROJECT}'. Try another name with PAGES_PROJECT=my-name."
fi
PAGES_ORIGIN="https://${PAGES_HOST}"
echo "Site address: ${PAGES_ORIGIN}"

ORIGINS="${GITHUB_PAGES_ORIGIN},${PAGES_ORIGIN}${EXTRA_ORIGINS:+,${EXTRA_ORIGINS}}"
step "Deploying the relay Worker (allowed sites: ${ORIGINS})"
DEPLOY_OUT="$(cd "${ROOT}/relay" && wrangler deploy --name "${WORKER_NAME}" --var "ALLOWED_ORIGINS:${ORIGINS}" 2>&1)" || {
  printf '%s\n' "$DEPLOY_OUT" >&2
  if printf '%s' "$DEPLOY_OUT" | grep -qi "workers.dev subdomain"; then
    die "Your account has no workers.dev subdomain yet. Open https://dash.cloudflare.com → Workers & Pages once (it asks you to pick one), then run this again."
  fi
  die "Worker deploy failed (see above)."
}
printf '%s\n' "$DEPLOY_OUT" | tail -8
RELAY_URL="$(printf '%s' "$DEPLOY_OUT" | grep -oE "https://${WORKER_NAME}\.[a-z0-9-]+\.workers\.dev" | head -1 || true)"
[ -n "$RELAY_URL" ] || die "Deployed, but couldn't read the relay address from the output above. Tell Claude the workers.dev URL shown there."

if [ -n "${GEMINI_API_KEY:-}" ]; then
  step "Storing GEMINI_API_KEY as a Worker secret"
  printf '%s' "$GEMINI_API_KEY" | (cd "${ROOT}/relay" && wrangler secret put GEMINI_API_KEY --name "${WORKER_NAME}") >/dev/null
  echo "Stored."
else
  echo "No Gemini key given: add it later with  cd relay && npx wrangler secret put GEMINI_API_KEY --name ${WORKER_NAME}"
fi
if [ -n "${GROQ_API_KEY:-}" ]; then
  step "Storing GROQ_API_KEY as a Worker secret"
  printf '%s' "$GROQ_API_KEY" | (cd "${ROOT}/relay" && wrangler secret put GROQ_API_KEY --name "${WORKER_NAME}") >/dev/null
  echo "Stored."
fi

step "Pointing config.js at ${RELAY_URL}"
node -e '
  const fs = require("fs"); const [file, url] = process.argv.slice(1);
  const src = fs.readFileSync(file, "utf8").replace(/relayUrl:\s*(["'"'"'])[^"'"'"']*\1/, `relayUrl: '"'"'${url}'"'"'`);
  fs.writeFileSync(file, src);
' "${ROOT}/config.js" "${RELAY_URL}"
grep -n "relayUrl" "${ROOT}/config.js"

step "Uploading the site to Pages"
SITE_DIR="$(mktemp -d)"
cp "${ROOT}"/*.html "${ROOT}"/*.js "${ROOT}"/*.css "${ROOT}/manifest.webmanifest" "${SITE_DIR}/"
cp -R "${ROOT}/icons" "${SITE_DIR}/"
wrangler pages deploy "${SITE_DIR}" --project-name "${PAGES_PROJECT}" --branch main --commit-dirty=true 2>&1 | tail -4
rm -rf "${SITE_DIR}"

step "Checking the relay"
curl -sS -m 20 "${RELAY_URL}/" || echo "(could not reach ${RELAY_URL}; open it in a browser)"
printf '\n\nDone.\n  Site:  %s\n  Relay: %s\n' "${PAGES_ORIGIN}" "${RELAY_URL}"
printf 'Paste those two lines to Claude so it can check them and publish config.js to GitHub.\n'
