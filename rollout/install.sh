#!/usr/bin/env bash
# Opens a PR in every Node.js/Next.js repo of the organization that adds the caller workflow and the PR template (run once).
#
# Usage:   ./rollout/install.sh <github-org> [--dry-run] [--only repo1,repo2]
# Requires: gh CLI (gh auth login) and git; the user needs push and PR access to the org repos.
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

  if [ ! -f package.json ]; then echo "SKIP $NAME (not a Node.js repo)"; cd "$TMP"; continue; fi
  if [ -f .github/workflows/perf-test.yml ]; then echo "SKIP $NAME (already installed)"; cd "$TMP"; continue; fi

  mkdir -p .github/workflows
  sed "s/__ORG__/$ORG/g" "$HERE/templates/perf-test.yml" > .github/workflows/perf-test.yml

  if [ -f .github/pull_request_template.md ]; then
    # A template already exists: do not overwrite it, append the perf section
    { echo; sed -n '/^## Perf test/,$p' "$HERE/templates/pull_request_template.md"; } >> .github/pull_request_template.md
  else
    cp "$HERE/templates/pull_request_template.md" .github/pull_request_template.md
  fi

  if [ "$DRY" = 1 ]; then echo "DRY-RUN $NAME: would add workflow + template"; cd "$TMP"; continue; fi

  git checkout -q -b "$BRANCH"
  git add .github
  git commit -q -m "Add PR performance test pipeline"
  git push -q origin "$BRANCH"
  gh pr create --repo "$ORG/$NAME" --base "$DEFAULT" --head "$BRANCH" \
    --title "Add PR performance test pipeline" \
    --body "After this PR is merged, a JMeter + Clinic.js performance test runs automatically on every PR whose description contains a \`perf\` block, and the result is posted to Slack. Details: https://github.com/$ORG/perf-pipeline" >/dev/null
  echo "PR OPENED $NAME"
  cd "$TMP"
done
