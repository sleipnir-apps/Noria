#!/usr/bin/env bash
# Generates the JWT secrets and pushes all app secrets to Infisical
# (project apps-x-tl-w, envs staging + prod).
# Idempotent: checks whether each secret already exists (update it)
# or not (create it) — relaunching the init never fails.
# Usage: infisical-push.sh <slug>
# Requires env: INFISICAL_APPS_CLIENT_ID, INFISICAL_APPS_CLIENT_SECRET,
#               MONGODB_URI_PROD, MONGODB_URI_STAGING

set -euo pipefail

SLUG="$1"
SCREAM=$(echo "$SLUG" | tr '[:lower:]-' '[:upper:]_')

INFISICAL_BASE="${INFISICAL_BASE:-https://app.infisical.com/api}"
PROJECT_SLUG="apps-x-tl-w"

# --- Login (Universal Auth machine identity) ---
TOKEN=$(curl -sS -X POST "$INFISICAL_BASE/v1/auth/universal-auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"clientId\":\"$INFISICAL_APPS_CLIENT_ID\",\"clientSecret\":\"$INFISICAL_APPS_CLIENT_SECRET\"}" \
  | jq -r '.accessToken')
if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "✗ Infisical login failed" >&2
  exit 1
fi

# --- Resolve the project ID from the slug (v4 API requires projectId) ---
PROJECT_ID=$(curl -sS "$INFISICAL_BASE/v2/workspace/$PROJECT_SLUG" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.id // empty')
if [ -z "$PROJECT_ID" ]; then
  echo "✗ Project '$PROJECT_SLUG' introuvable dans Infisical" >&2
  exit 1
fi

# --- Secret names (same name, different value per env) ---
JWT_ACCESS=$(openssl rand -base64 48 | tr -d '\n')
JWT_REFRESH=$(openssl rand -base64 48 | tr -d '\n')

push_secret() {
  local env="$1" name="$2" value="$3"
  # Body built with jq to guarantee valid JSON whatever the value
  # (base64 with + / =, mongo URIs with special chars, etc).
  local body
  body=$(jq -n \
    --arg id "$PROJECT_ID" \
    --arg env "$env" \
    --arg value "$value" \
    '{projectId: $id, environment: $env, secretPath: "/", secretValue: $value, skipMultilineEncoding: true}')

  # Does the secret already exist? (relaunch of the init)
  local exists status method verb
  exists=$(curl -sS -o /dev/null -w "%{http_code}" \
    "$INFISICAL_BASE/v4/secrets/$name?projectId=$PROJECT_ID&environment=$env&secretPath=/" \
    -H "Authorization: Bearer $TOKEN")
  if [ "$exists" = "200" ]; then
    method="PATCH"
    verb="updated"
  else
    method="POST"
    verb="created"
  fi

  status=$(curl -sS -o /dev/null -w "%{http_code}" -X "$method" \
    "$INFISICAL_BASE/v4/secrets/$name" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$body")
  if [ "$status" -ge 200 ] && [ "$status" -lt 300 ]; then
    echo "  ✓ [$env] $name ($verb)"
  else
    echo "✗ [$env] $name → HTTP $status" >&2
    exit 1
  fi
}

echo "▶ Pushing secrets to Infisical (project: $PROJECT_SLUG)"

echo "  staging:"
push_secret staging "${SCREAM}_MONGODB_URI" "$MONGODB_URI_STAGING"
push_secret staging "${SCREAM}_JWT_ACCESS_SECRET" "$JWT_ACCESS"
push_secret staging "${SCREAM}_JWT_REFRESH_SECRET" "$JWT_REFRESH"

echo "  prod:"
# Separate secrets per env (JWTs are different, same names).
JWT_ACCESS=$(openssl rand -base64 48 | tr -d '\n')
JWT_REFRESH=$(openssl rand -base64 48 | tr -d '\n')
push_secret prod "${SCREAM}_MONGODB_URI" "$MONGODB_URI_PROD"
push_secret prod "${SCREAM}_JWT_ACCESS_SECRET" "$JWT_ACCESS"
push_secret prod "${SCREAM}_JWT_REFRESH_SECRET" "$JWT_REFRESH"

echo "✓ All secrets pushed"