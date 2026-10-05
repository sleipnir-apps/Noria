#!/usr/bin/env bash
# Creates the MongoDB Atlas project + M0 cluster (Paris) + DB user for a repo.
# Outputs env vars for the caller (>> $GITHUB_ENV when sourced via the caller):
#   MONGODB_URI_PROD, MONGODB_URI_STAGING
# Usage: atlas-init.sh <slug>
# Requires env (names Infisical, injectés par secrets-action dans
# self-hosted-server-tjnf): ATLAS_PUBLIC_API_KEY, ATLAS_PRIVATE_API_KEY,
# ATLAS_ORG_ID

set -euo pipefail

SLUG="$1"
CLUSTER_NAME="${SLUG:0:23}-cluster"   # Atlas: max 30 chars, no special chars
DB_USER="$SLUG"                        # will appear in the URI
DB_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)"

ATLAS_BASE="https://cloud.mongodb.com/api/atlas/v2"
AUTH=(-u "$ATLAS_PUBLIC_API_KEY:$ATLAS_PRIVATE_API_KEY" --digest)
HDR=(-H "Accept: application/vnd.atlas.2023-01-01+json" -H "Content-Type: application/json")

atlas() { curl -sS "${AUTH[@]}" "${HDR[@]}" "$@"; }

log() { echo "$@" >&2; }

echo "▶ Creating Atlas project: $SLUG" >&2
# Idempotent: first look for an existing project with this name
# (Atlas allows duplicate names, so we check before creating).
PROJECT_ID=$(atlas "$ATLAS_BASE/groups?itemsPerPage=500" | \
  jq -r ".results[] | select(.name == \"$SLUG\") | .id" | head -1)
if [ -z "$PROJECT_ID" ]; then
  PROJECT_ID=$(atlas -X POST "$ATLAS_BASE/groups" \
    -d "{\"name\":\"$SLUG\",\"orgId\":\"$ATLAS_ORG_ID\"}" | jq -r '.id // empty')
fi
if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "null" ]; then
  log "✗ Could not create or find Atlas project '$SLUG'"
  exit 1
fi
log "  Project ID: $PROJECT_ID"

echo "▶ Creating M0 cluster in Paris (EU_WEST_3)" >&2
# Idempotent: look for the cluster first, create it if missing.
CLUSTER_STATE=$(atlas "$ATLAS_BASE/groups/$PROJECT_ID/clusters/$CLUSTER_NAME" | jq -r '.stateName // empty')
if [ -z "$CLUSTER_STATE" ]; then
  atlas -X POST "$ATLAS_BASE/groups/$PROJECT_ID/clusters" -d '{
    "name": "'"$CLUSTER_NAME"'",
    "clusterType": "REPLICASET",
    "providerSettings": {
      "providerName": "TENANT",
      "backingProviderName": "AWS",
      "instanceSizeName": "M0",
      "regionName": "EU_WEST_3"
    }
  }' >/dev/null
  log "  Cluster creation submitted"
else
  log "  Cluster already exists (state: $CLUSTER_STATE)"
fi

echo "▶ Creating database user" >&2
# Idempotent: check if the user exists, create or update its password.
USER_CHECK=$(atlas "$ATLAS_BASE/groups/$PROJECT_ID/databaseUsers/admin/$DB_USER" \
  | jq -r '.username // empty')
if [ -z "$USER_CHECK" ]; then
  HTTP_CODE=$(atlas -o /tmp/create_user_resp.json -w "%{http_code}" -X POST "$ATLAS_BASE/groups/$PROJECT_ID/databaseUsers" -d '{
    "databaseName": "admin",
    "username": "'"$DB_USER"'",
    "password": "'"$DB_PASSWORD"'",
    "roles": [{ "roleName": "readWriteAnyDatabase", "databaseName": "admin" }]
  }')
  if [ "$HTTP_CODE" != "201" ]; then
    log "✗ Failed to create user (HTTP $HTTP_CODE): $(cat /tmp/create_user_resp.json)"
    exit 1
  fi
  log "  User $DB_USER created"
else
  HTTP_CODE=$(atlas -o /tmp/patch_user_resp.json -w "%{http_code}" -X PATCH "$ATLAS_BASE/groups/$PROJECT_ID/databaseUsers/admin/$DB_USER" \
    -d '{"password":"'"$DB_PASSWORD"'"}')
  if [ "$HTTP_CODE" != "200" ]; then
    log "✗ Failed to update user password (HTTP $HTTP_CODE): $(cat /tmp/patch_user_resp.json)"
    exit 1
  fi
  log "  User $DB_USER already existed — password rotated"
fi

echo "▶ Configuring Network Access" >&2
atlas -X POST "$ATLAS_BASE/groups/$PROJECT_ID/accessList" -d '[
  {"cidrBlock": "'"$SLEIPNIR_SERVER_IP"'/32", "comment": "Prod/staging server"}
]' >/dev/null 2>&1 || true

echo "▶ Waiting for cluster to be ready (stateName=IDLE)" >&2
# Provisioning takes ~3-7 min. Poll until IDLE.
for i in $(seq 1 60); do
  STATE=$(atlas "$ATLAS_BASE/groups/$PROJECT_ID/clusters/$CLUSTER_NAME" | jq -r '.stateName // empty')
  if [ "$STATE" = "IDLE" ]; then
    log "  Cluster ready after ~$((i * 15))s"
    break
  fi
  if [ "$i" = "60" ]; then
    log "✗ Cluster still not ready (last state: $STATE)"
    exit 1
  fi
  sleep 15
done

SRV=$(atlas "$ATLAS_BASE/groups/$PROJECT_ID/clusters/$CLUSTER_NAME" | \
  jq -r '.connectionStrings.standardSrv')

# Two databases on the same cluster: <slug> (prod) and <slug>_staging.
# The credentials must be in the URI (mongodb+srv://user:pass@host).
# DB_PASSWORD may contain URI special chars → percent-encode them.
PASS_URLENC=$(jq -rn --arg p "$DB_PASSWORD" '$p|@uri')

# Only these two lines go to stdout (captured into GITHUB_ENV).
SRV_HOST="${SRV#mongodb+srv://}"
PASS_URLENC=$(jq -rn --arg p "$DB_PASSWORD" '$p|@uri')

echo "MONGODB_URI_PROD=mongodb+srv://${DB_USER}:${PASS_URLENC}@${SRV_HOST}/${SLUG}?authSource=admin&retryWrites=true&w=majority"
echo "MONGODB_URI_STAGING=mongodb+srv://${DB_USER}:${PASS_URLENC}@${SRV_HOST}/${SLUG}_staging?authSource=admin&retryWrites=true&w=majority"
log "✓ Atlas ready: $SRV"