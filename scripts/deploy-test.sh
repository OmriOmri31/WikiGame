#!/usr/bin/env bash
# Deploy a branch (default: current checkout) to the TEST Netlify site,
# https://omri-wiki-game-test.netlify.app. Never touches the production site.
#
# Normal flow: push to the long-lived 'test' branch; Netlify auto-deploys it.
# This script is for a one-off deploy of any other branch.
# Usage:  NETLIFY_AUTH_TOKEN=... scripts/deploy-test.sh [branch]
set -euo pipefail

TEST_SITE_ID="172fd453-49a7-4972-932c-96ed6e534716"   # omri-wiki-game-test
: "${NETLIFY_AUTH_TOKEN:?Set NETLIFY_AUTH_TOKEN (Netlify personal access token)}"

repo="$(cd "$(dirname "$0")/.." && pwd)"
src="$repo"
tmp=""
if [ "${1:-}" != "" ]; then
  # Build the branch in a throwaway worktree so your checkout is untouched.
  git -C "$repo" fetch -q origin "$1"
  tmp="$(mktemp -d)"
  git -C "$repo" worktree add -q --detach "$tmp" FETCH_HEAD
  trap 'git -C "$repo" worktree remove --force "$tmp"' EXIT
  src="$tmp"
fi

cd "$src"
echo "Deploying $(git rev-parse --short HEAD) ${1:+($1) }to the test site..."
(cd web && npm ci && npm run build)
npx -y netlify-cli@latest deploy --prod --no-build \
  --dir web/dist --functions web/netlify/functions \
  --site "$TEST_SITE_ID" \
  --message "test: ${1:-local} $(git rev-parse --short HEAD)"
echo "Live at https://omri-wiki-game-test.netlify.app"
echo "Note: the next push to the 'test' branch auto-deploys and replaces this."
