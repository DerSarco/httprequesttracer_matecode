#!/usr/bin/env bash

set -euo pipefail

# Usage:
#   scripts/apply-branch-protection.sh [owner/repo] [branch]
# Example:
#   scripts/apply-branch-protection.sh DerSarco/httprequesttracer_matecode master
#
# Note:
#   This call requires admin permissions and may require a public repo
#   (or an upgraded GitHub plan) depending on account settings.

OWNER_REPO="${1:-DerSarco/httprequesttracer_matecode}"
BRANCH="${2:-master}"
REQUIRED_CHECK="${REQUIRED_CHECK:-Frontend tests (Vitest)}"

tmp_json="$(mktemp)"
cleanup() {
  rm -f "$tmp_json"
}
trap cleanup EXIT

cat > "$tmp_json" <<EOF
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["$REQUIRED_CHECK"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": true,
    "required_approving_review_count": 1,
    "require_last_push_approval": false
  },
  "restrictions": null,
  "required_conversation_resolution": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_linear_history": false,
  "lock_branch": false,
  "allow_fork_syncing": true
}
EOF

gh api \
  --method PUT \
  "repos/$OWNER_REPO/branches/$BRANCH/protection" \
  -H "Accept: application/vnd.github+json" \
  --input "$tmp_json" >/dev/null

echo "Branch protection applied to $OWNER_REPO ($BRANCH)."
