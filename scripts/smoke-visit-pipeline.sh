#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

API_BASE_DEFAULT="https://us-central1-lumimd-dev.cloudfunctions.net/api"

# Prefer explicit env vars; fall back to local (gitignored) mobile/.env for convenience.
API_KEY="${SMOKE_FIREBASE_API_KEY:-${EXPO_PUBLIC_FIREBASE_API_KEY:-}}"
API_BASE="${SMOKE_API_BASE:-${API_BASE:-}}"
WEBHOOK_SECRET="${SMOKE_ASSEMBLYAI_WEBHOOK_SECRET:-${ASSEMBLYAI_WEBHOOK_SECRET:-}}"

if [[ -z "$API_KEY" && -f "$ROOT_DIR/mobile/.env" ]]; then
  API_KEY="$(grep '^EXPO_PUBLIC_FIREBASE_API_KEY=' "$ROOT_DIR/mobile/.env" | cut -d= -f2- || true)"
fi

if [[ -z "$API_BASE" && -f "$ROOT_DIR/mobile/.env" ]]; then
  API_BASE="$(grep '^EXPO_PUBLIC_API_BASE_URL=' "$ROOT_DIR/mobile/.env" | cut -d= -f2- || true)"
fi

API_BASE="${API_BASE:-$API_BASE_DEFAULT}"

if [[ -z "$API_KEY" ]]; then
  echo "[smoke] ERROR: missing Firebase API key." >&2
  echo "[smoke] Provide SMOKE_FIREBASE_API_KEY (or EXPO_PUBLIC_FIREBASE_API_KEY) in the environment, or create mobile/.env locally." >&2
  exit 1
fi

tmpdir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmpdir"
}
trap cleanup EXIT

json_get() {
  local file="$1"
  local key="$2"
  node -e "const fs=require('fs');const j=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));process.stdout.write((j[process.argv[2]]??'')+'');" "$file" "$key"
}

request_json() {
  # args: METHOD URL OUTFILE [curl extra args...]
  local method="$1"
  local url="$2"
  local outfile="$3"
  shift 3
  curl -s -o "$outfile" -w "%{http_code}" -X "$method" "$url" "$@"
}

echo "[smoke] API_BASE=$API_BASE"

email="smoke.$(date +%s)@lumimd.dev"
password="${SMOKE_PASSWORD:-SmokePass!123}"
signup_json="$tmpdir/signup.json"

echo "[smoke] Creating ephemeral Firebase Auth user (email/password)"
signup_code="$(request_json POST "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=$API_KEY" "$signup_json" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$email\",\"password\":\"$password\",\"returnSecureToken\":true}")"

if [[ "$signup_code" != "200" ]]; then
  echo "[smoke] ERROR: signUp failed (HTTP $signup_code)" >&2
  head -c 500 "$signup_json" >&2 || true
  echo >&2
  exit 1
fi

id_token="$(json_get "$signup_json" idToken)"
if [[ -z "$id_token" ]]; then
  echo "[smoke] ERROR: signUp response missing idToken" >&2
  head -c 500 "$signup_json" >&2 || true
  echo >&2
  exit 1
fi

authz_header="Authorization: Bearer $id_token"

create_visit() {
  local notes="$1"
  local visit_json="$2"
  local object_path="visits/smoke/$(date +%s)/nonexistent.m4a"
  local audio_url="https://firebasestorage.googleapis.com/v0/b/lumimd-dev.firebasestorage.app/o/$(python3 -c "import urllib.parse; print(urllib.parse.quote('''$object_path''', safe=''))")?alt=media"

  local code
  code="$(request_json POST "$API_BASE/v1/visits" "$visit_json" \
    -H "$authz_header" \
    -H 'Content-Type: application/json' \
    -d "{\"notes\":\"$notes\",\"status\":\"completed\",\"storagePath\":\"$object_path\",\"audioUrl\":\"$audio_url\"}")"

  if [[ "$code" != "201" ]]; then
    echo "[smoke] ERROR: create visit failed (HTTP $code)" >&2
    head -c 800 "$visit_json" >&2 || true
    echo >&2
    exit 1
  fi

  local visit_id
  visit_id="$(json_get "$visit_json" id)"
  if [[ -z "$visit_id" ]]; then
    echo "[smoke] ERROR: create visit response missing id" >&2
    head -c 800 "$visit_json" >&2 || true
    echo >&2
    exit 1
  fi

  echo "$visit_id"
}

patch_visit() {
  local visit_id="$1"
  local patch_payload="$2"
  local out="$3"
  local code
  code="$(request_json PATCH "$API_BASE/v1/visits/$visit_id" "$out" \
    -H "$authz_header" \
    -H 'Content-Type: application/json' \
    -d "$patch_payload")"
  if [[ "$code" != "200" ]]; then
    echo "[smoke] ERROR: patch visit $visit_id failed (HTTP $code)" >&2
    head -c 800 "$out" >&2 || true
    echo >&2
    exit 1
  fi
}

retry_visit() {
  local visit_id="$1"
  local out="$2"
  request_json POST "$API_BASE/v1/visits/$visit_id/retry" "$out" \
    -H "$authz_header" \
    -H 'Content-Type: application/json'
}

get_visit() {
  local visit_id="$1"
  local out="$2"
  request_json GET "$API_BASE/v1/visits/$visit_id" "$out" \
    -H "$authz_header"
}

delete_visit() {
  local visit_id="$1"
  local out="$2"
  request_json DELETE "$API_BASE/v1/visits/$visit_id" "$out" \
    -H "$authz_header"
}

echo "[smoke] Case A: summarize path + already_processing + retry throttle"
visit_a_json="$tmpdir/visit_a.json"
visit_a_id="$(create_visit "smoke summarize path" "$visit_a_json")"

patch_visit "$visit_a_id" '{"status":"failed","processingStatus":"failed","transcript":"Synthetic transcript for smoke"}' "$tmpdir/patch_a.json"

retry1_a_json="$tmpdir/retry1_a.json"
retry1_a_code="$(retry_visit "$visit_a_id" "$retry1_a_json")"
if [[ "$retry1_a_code" != "200" ]]; then
  echo "[smoke] ERROR: retry #1 expected 200, got $retry1_a_code" >&2
  head -c 800 "$retry1_a_json" >&2 || true
  echo >&2
  exit 1
fi
status_a="$(json_get "$retry1_a_json" processingStatus)"
if [[ "$status_a" != "summarizing" ]]; then
  echo "[smoke] ERROR: retry #1 expected processingStatus=summarizing, got '$status_a'" >&2
  head -c 800 "$retry1_a_json" >&2 || true
  echo >&2
  exit 1
fi

retry2_a_json="$tmpdir/retry2_a.json"
retry2_a_code="$(retry_visit "$visit_a_id" "$retry2_a_json")"
if [[ "$retry2_a_code" != "409" ]]; then
  echo "[smoke] ERROR: retry #2 expected 409 already_processing, got $retry2_a_code" >&2
  head -c 800 "$retry2_a_json" >&2 || true
  echo >&2
  exit 1
fi

# Simulate a fast-fail case to verify throttle logic (lastRetryAt set, but not in-processing)
patch_visit "$visit_a_id" '{"status":"failed","processingStatus":"failed"}' "$tmpdir/patch_a2.json"

retry3_a_json="$tmpdir/retry3_a.json"
retry3_a_code="$(retry_visit "$visit_a_id" "$retry3_a_json")"
if [[ "$retry3_a_code" != "429" ]]; then
  echo "[smoke] ERROR: retry #3 expected 429 retry_too_soon, got $retry3_a_code" >&2
  head -c 800 "$retry3_a_json" >&2 || true
  echo >&2
  exit 1
fi

echo "[smoke] Case B: retranscribe path + webhook error transition"
visit_b_json="$tmpdir/visit_b.json"
visit_b_id="$(create_visit "smoke retranscribe path" "$visit_b_json")"

patch_visit "$visit_b_id" '{"status":"failed","processingStatus":"failed","transcript":null}' "$tmpdir/patch_b.json"

retry_b_json="$tmpdir/retry_b.json"
retry_b_code="$(retry_visit "$visit_b_id" "$retry_b_json")"
if [[ "$retry_b_code" != "200" ]]; then
  echo "[smoke] ERROR: retranscribe retry expected 200, got $retry_b_code" >&2
  head -c 800 "$retry_b_json" >&2 || true
  echo >&2
  exit 1
fi

status_b="$(json_get "$retry_b_json" processingStatus)"
transcription_id="$(json_get "$retry_b_json" transcriptionId)"
if [[ "$status_b" != "transcribing" ]]; then
  echo "[smoke] ERROR: retranscribe retry expected processingStatus=transcribing, got '$status_b'" >&2
  head -c 800 "$retry_b_json" >&2 || true
  echo >&2
  exit 1
fi
if [[ -z "$transcription_id" ]]; then
  echo "[smoke] ERROR: retranscribe retry expected transcriptionId to be present" >&2
  head -c 800 "$retry_b_json" >&2 || true
  echo >&2
  exit 1
fi

webhook_json="$tmpdir/webhook.json"
webhook_args=(
  -H 'Content-Type: application/json'
)

if [[ -n "$WEBHOOK_SECRET" ]]; then
  webhook_args+=(-H "x-assemblyai-secret: $WEBHOOK_SECRET")
fi

webhook_code="$(request_json POST "$API_BASE/v1/webhooks/assemblyai/transcription-complete" "$webhook_json" \
  "${webhook_args[@]}" \
  -d "{\"transcript_id\":\"$transcription_id\",\"status\":\"error\",\"error\":\"Smoke test webhook failure\"}")"

if [[ "$webhook_code" == "401" && -z "$WEBHOOK_SECRET" ]]; then
  # Best-effort: if the CLI is authenticated, pull the secret so this can run
  # without manual copying in developer environments.
  secret_file="$tmpdir/webhook_secret.txt"
  firebase functions:secrets:access ASSEMBLYAI_WEBHOOK_SECRET --project lumimd-dev > "$secret_file" 2>/dev/null || true
  secret="$(tr -d '\r\n' < "$secret_file" 2>/dev/null || true)"

  if [[ -n "$secret" ]]; then
    webhook_code="$(request_json POST "$API_BASE/v1/webhooks/assemblyai/transcription-complete" "$webhook_json" \
      -H 'Content-Type: application/json' \
      -H "x-assemblyai-secret: $secret" \
      -d "{\"transcript_id\":\"$transcription_id\",\"status\":\"error\",\"error\":\"Smoke test webhook failure\"}")"
  fi
fi

if [[ "$webhook_code" == "401" ]]; then
  echo "[smoke] ERROR: webhook rejected with 401. Provide SMOKE_ASSEMBLYAI_WEBHOOK_SECRET (or ASSEMBLYAI_WEBHOOK_SECRET) to run this step." >&2
  head -c 800 "$webhook_json" >&2 || true
  echo >&2
  exit 1
fi

if [[ "$webhook_code" != "200" ]]; then
  echo "[smoke] ERROR: webhook expected 200, got $webhook_code" >&2
  head -c 800 "$webhook_json" >&2 || true
  echo >&2
  exit 1
fi

get_b_json="$tmpdir/get_b.json"
get_b_code="$(get_visit "$visit_b_id" "$get_b_json")"
if [[ "$get_b_code" != "200" ]]; then
  echo "[smoke] ERROR: get visit after webhook expected 200, got $get_b_code" >&2
  head -c 800 "$get_b_json" >&2 || true
  echo >&2
  exit 1
fi

final_status_b="$(json_get "$get_b_json" processingStatus)"
if [[ "$final_status_b" != "failed" ]]; then
  echo "[smoke] ERROR: expected visit processingStatus=failed after webhook error, got '$final_status_b'" >&2
  head -c 800 "$get_b_json" >&2 || true
  echo >&2
  exit 1
fi

echo "[smoke] Cleanup: deleting smoke visits"
delete_visit "$visit_a_id" "$tmpdir/delete_a.json" >/dev/null || true
delete_visit "$visit_b_id" "$tmpdir/delete_b.json" >/dev/null || true

echo "[smoke] Cleanup: deleting ephemeral auth user"
delete_user_json="$tmpdir/delete_user.json"
delete_user_code="$(request_json POST "https://identitytoolkit.googleapis.com/v1/accounts:delete?key=$API_KEY" "$delete_user_json" \
  -H 'Content-Type: application/json' \
  -d "{\"idToken\":\"$id_token\"}")"
if [[ "$delete_user_code" != "200" ]]; then
  echo "[smoke] WARN: unable to delete ephemeral user (HTTP $delete_user_code)" >&2
fi

echo "[smoke] PASS: visit pipeline smoke checks completed"
