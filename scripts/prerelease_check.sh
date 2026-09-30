#!/usr/bin/env bash
# Pre-release gate for arunika-backoffice. Spec and severity policy:
# arunika_app/openspec/changes/add-prerelease-security-gate
#
# Usage: scripts/prerelease_check.sh [--allow-missing] [--skip-dast] [--write-baselines]
#   --allow-missing    a missing tool is a warning instead of a failure
#   --skip-dast        skip the OWASP ZAP baseline scan (needs Docker)
#   --write-baselines  re-record bundle-baseline.json after an intentional change
set -uo pipefail
cd "$(dirname "$0")/.."

REPORT_DIR=prerelease-reports
BUNDLE_BASELINE=bundle-baseline.json
ZAP_IMAGE=ghcr.io/zaproxy/zaproxy:stable
ALLOW_MISSING=false SKIP_DAST=false WRITE_BASELINES=false
for arg in "$@"; do
  case "$arg" in
    --allow-missing) ALLOW_MISSING=true ;;
    --skip-dast) SKIP_DAST=true ;;
    --write-baselines) WRITE_BASELINES=true ;;
    *) echo "unknown option: $arg"; sed -n 5,8p "$0"; exit 2 ;;
  esac
done
mkdir -p "$REPORT_DIR"

RED='\033[0;31m' GREEN='\033[0;32m' YELLOW='\033[1;33m' NC='\033[0m'
FAILED=() SKIPPED=()
section() { echo -e "\n${YELLOW}==> $1${NC}"; }
ok()      { echo -e "${GREEN}  ✓ $1${NC}"; }
fail()    { echo -e "${RED}  ✗ $1${NC}"; FAILED+=("$1"); }
skip()    { echo -e "  - skipped: $1"; SKIPPED+=("$1"); }

# need TOOL INSTALL_HINT — succeeds when TOOL is on PATH. A missing tool fails
# the gate unless --allow-missing, so an unscanned repo never looks clean.
need() {
  command -v "$1" >/dev/null 2>&1 && return 0
  if $ALLOW_MISSING; then skip "$1 not installed ($2)"; else fail "$1 not installed — $2"; fi
  return 1
}

# check NAME REPORT CMD... — runs CMD with output to REPORT; pass/fail on exit code.
check() {
  local name="$1" report="$REPORT_DIR/$2"; shift 2
  if "$@" >"$report" 2>&1; then ok "$name"; else fail "$name — see $report"; fi
}

section "Secrets"
if need gitleaks "brew install gitleaks"; then
  check "gitleaks: git history" gitleaks-history.txt \
    gitleaks git --no-banner --redact --report-path "$REPORT_DIR/gitleaks-history.json" .
  # History covers committed files; this covers edits and new files not yet committed.
  changed=$(git ls-files -mo --exclude-standard | grep -v "^$REPORT_DIR/")
  if [ -n "$changed" ]; then
    leaks=0
    while IFS= read -r f; do
      [ -f "$f" ] || continue
      gitleaks dir --no-banner --redact "$f" >>"$REPORT_DIR/gitleaks-worktree.txt" 2>&1 || leaks=1
    done <<<"$changed"
    if [ "$leaks" = 0 ]; then ok "gitleaks: uncommitted changes"
    else fail "gitleaks: uncommitted changes — see $REPORT_DIR/gitleaks-worktree.txt"; fi
  else
    ok "gitleaks: uncommitted changes (none)"
  fi
fi

section "Dependencies and static analysis"
# Only runtime dependencies reach the browser: the build emits a static bundle,
# so dev tooling (vite, vitest, eslint) CVEs are tracked, not blocking. The
# full audit is still written out for triage.
npm audit >"$REPORT_DIR/npm-audit-all.txt" 2>&1
check "npm audit: no high/critical in runtime dependencies" npm-audit.txt \
  npm audit --omit=dev --audit-level=high
echo "  → dev-dependency advisories for triage: $REPORT_DIR/npm-audit-all.txt"
# eslint-plugin-security reports warnings (its rules are heuristic); errors fail.
check "eslint (incl. eslint-plugin-security)" eslint.txt npx eslint .
warnings=$(grep -cE "warning +.*security/" "$REPORT_DIR/eslint.txt")
[ "$warnings" -gt 0 ] && echo "  → $warnings security lint warnings to triage in $REPORT_DIR/eslint.txt"
check "no TODO/FIXME in auth, payment or order code" todo.txt \
  bash -c "! grep -rnE 'TODO|FIXME' src | grep -iE '^[^:]*(auth|pay|purchase|billing|entitle|order|token|refund|security)'"

section "Tests and bundle size"
check "npm test" npm-test.txt npm test
if npm run build >"$REPORT_DIR/build.txt" 2>&1; then
  bytes=$(find dist/assets -type f \( -name '*.js' -o -name '*.css' \) -exec cat {} + | wc -c | tr -d ' ')
  if $WRITE_BASELINES || [ ! -f "$BUNDLE_BASELINE" ]; then
    echo "{ \"js_css_bytes\": $bytes }" >"$BUNDLE_BASELINE"
    ok "bundle size: baseline recorded ($bytes bytes of JS+CSS)"
  else
    base=$(grep -oE '[0-9]+' "$BUNDLE_BASELINE")
    if [ "$bytes" -le $((base * 12 / 10)) ]; then ok "bundle size: $bytes bytes (baseline $base)"
    else fail "bundle size regressed >20%: $bytes bytes vs baseline $base"; fi
  fi
else
  fail "npm run build — see $REPORT_DIR/build.txt"
fi

section "DAST: OWASP ZAP baseline against the production image"
if $SKIP_DAST; then
  skip "ZAP baseline (--skip-dast)"
elif need docker "https://docs.docker.com/get-docker/"; then
  # Scans the nginx image that ships, since the security headers live in its
  # config; a Vite dev server would report findings that don't exist in prod.
  net=arunika-prerelease-$$
  docker network create "$net" >/dev/null
  if docker build -q -t arunika-backoffice:prerelease . >"$REPORT_DIR/docker-build.txt" 2>&1 \
    && docker run -d --rm --name "$net-bo" --network "$net" arunika-backoffice:prerelease >/dev/null; then
    # zap-baseline exit codes: 0 clean, 1 FAIL alerts, 2 WARN alerts only, 3 error.
    docker run --rm --network "$net" -v "$PWD/$REPORT_DIR:/zap/wrk:rw" "$ZAP_IMAGE" \
      zap-baseline.py -t "http://$net-bo" -r zap-report.html -J zap-report.json \
      >"$REPORT_DIR/zap.txt" 2>&1
    case $? in
      0) ok "ZAP baseline: no alerts" ;;
      # Alert lines end in "[rule id] x count"; the summary line doesn't.
      1|2) warns=$(grep -cE "^WARN-NEW: .*\[[0-9]+\]" "$REPORT_DIR/zap.txt")
           fails=$(grep -cE "^FAIL-NEW: .*\[[0-9]+\]" "$REPORT_DIR/zap.txt")
           if [ "$fails" -gt 0 ]; then fail "ZAP baseline: $fails failing alerts — see $REPORT_DIR/zap-report.html"
           else ok "ZAP baseline: $warns warnings to triage — see $REPORT_DIR/zap-report.html"; fi ;;
      *) fail "ZAP baseline did not complete — see $REPORT_DIR/zap.txt" ;;
    esac
  else
    fail "could not build or start the backoffice image — see $REPORT_DIR/docker-build.txt"
  fi
  docker rm -f "$net-bo" >/dev/null 2>&1
  docker network rm "$net" >/dev/null 2>&1
fi

section "Summary"
echo "Failures: ${#FAILED[@]}   Skipped: ${#SKIPPED[@]}   Reports: $REPORT_DIR/"
for f in ${FAILED[@]+"${FAILED[@]}"}; do echo -e "  ${RED}✗${NC} $f"; done
for s in ${SKIPPED[@]+"${SKIPPED[@]}"}; do echo "  - $s"; done
echo "Triage every finding in arunika_app/docs/prerelease-triage.md before release."
[ "${#FAILED[@]}" -eq 0 ]
