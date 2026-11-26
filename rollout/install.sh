#!/usr/bin/env bash
# Company ki saari Node.js/Next.js repos me caller workflow + PR template ki PR kholta hai (ek baar chalana hai).
#
# Usage:   ./rollout/install.sh <github-org> [--dry-run] [--only repo1,repo2]
# Zaroori: gh CLI (gh auth login), git; chalane wale ke paas org repos me push/PR ka access ho.
set -euo pipefail

ORG="${1:?Usage: install.sh <github-org> [--dry-run] [--only repo1,repo2]}"
shift || true
DRY=0
ONLY=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --only) ONLY="${2:-}"; shift ;;
  esac
  shift
done

HERE="$(cd "$(dirname "$0")/.." && pwd)"
BRANCH="add-perf-pipeline"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

gh repo list "$ORG" --limit 1000 --no-archived --source --json name,defaultBranchRef \
  --jq '.[] | [.name, .defaultBranchRef.name] | @tsv' | while IFS=$'\t' read -r NAME DEFAULT; do

  if [ -n "$ONLY" ] && ! echo ",$ONLY," | grep -q ",$NAME,"; then continue; fi

  DIR="$TMP/$NAME"
  git clone --quiet --depth 1 "https://github.com/$ORG/$NAME.git" "$DIR" 2>/dev/null || { echo "SKIP $NAME (clone fail)"; continue; }
  cd "$DIR"

  if [ ! -f package.json ]; then echo "SKIP $NAME (Node.js repo nahi)"; cd "$TMP"; continue; fi
  if [ -f .github/workflows/perf-test.yml ]; then echo "SKIP $NAME (pehle se laga hai)"; cd "$TMP"; continue; fi

  mkdir -p .github/workflows
  sed "s/__ORG__/$ORG/g" "$HERE/templates/perf-test.yml" > .github/workflows/perf-test.yml

  if [ -f .github/pull_request_template.md ]; then
    # Pehle se template hai: overwrite nahi, perf section jod do
    { echo; sed -n '/^## Perf test/,$p' "$HERE/templates/pull_request_template.md"; } >> .github/pull_request_template.md
  else
    cp "$HERE/templates/pull_request_template.md" .github/pull_request_template.md
  fi

  if [ "$DRY" = 1 ]; then echo "DRY-RUN $NAME: workflow + template add hota"; cd "$TMP"; continue; fi

  git checkout -q -b "$BRANCH"
  git add .github
  git commit -q -m "Add PR performance test pipeline"
  git push -q origin "$BRANCH"
  gh pr create --repo "$ORG/$NAME" --base "$DEFAULT" --head "$BRANCH" \
    --title "Add PR performance test pipeline" \
    --body "Is PR ke merge hone ke baad PR description me \`perf\` block likhne par JMeter + Clinic.js perf test apne aap chalega aur Slack me result aayega. Details: https://github.com/$ORG/perf-pipeline" >/dev/null
  echo "PR OPENED $NAME"
  cd "$TMP"
done
