#!/usr/bin/env bash
# Share the beads (bd) Dolt database through a git *branch* instead of refs/dolt/data.
#
# Why: the cloud-session git proxy only accepts pushes to refs/heads/* (a push to
# refs/dolt/* gets HTTP 403), so the default `bd dolt push` can't work there.
# Dolt git remotes take the data ref as the remote parameter `git_ref`; we point it
# at refs/heads/$BEADS_DOLT_BRANCH (default beads-dolt). bd 1.3.2 has no flag for
# that and `bd bootstrap` only looks at refs/dolt/data, so this script sets the
# parameter itself and bootstraps fresh clones through a local bare mirror.
#
#   scripts/beads-sync.sh start   bootstrap or seed the database, then pull (SessionStart hook)
#   scripts/beads-sync.sh push    push local changes; on rejection pull, merge, retry (Stop hook)
#
# Never fails the session: problems are reported on stderr and the script exits 0
# from `start`. stdout stays clean because the SessionStart hook prints `bd prime` JSON.
set -uo pipefail
exec 1>&2

cmd="${1:-}"
BRANCH="${BEADS_DOLT_BRANCH:-beads-dolt}"
REF="refs/heads/$BRANCH"

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
cd "$ROOT" || exit 0
if ! command -v bd >/dev/null 2>&1; then
  echo "beads-sync: bd is not installed; skipping (see CLAUDE.md for the install line)"
  exit 0
fi
export BD_NON_INTERACTIVE=1

GITDIR="$(git rev-parse --absolute-git-dir)"
STATE="$GITDIR/beads-sync"
DB=".beads/embeddeddolt/ja"
REPO_STATE="$DB/.dolt/repo_state.json"
MANIFEST="$DB/.dolt/noms/manifest"
# The Dolt remote URL is sync.remote from .beads/config.yaml (git+ssh://…; the cloud
# proxy rewrites ssh GitHub URLs to https).
URL="$(sed -n 's/^[[:space:]]*remote:[[:space:]]*"\(.*\)"[[:space:]]*$/\1/p' .beads/config.yaml | head -1)"
[ -n "$URL" ] || URL="git+$(git remote get-url origin)"
mkdir -p "$STATE"
chmod 700 .beads 2>/dev/null

stamp() { cksum < "$MANIFEST" > "$STATE/stamp" 2>/dev/null; }

# Point the Dolt remote `origin` at the GitHub repo with git_ref = the sync branch.
set_ref() {
  node -e '
    const fs = require("fs");
    const [file, url, ref] = process.argv.slice(1);
    const s = JSON.parse(fs.readFileSync(file, "utf8"));
    s.remotes ??= {};
    const o = (s.remotes.origin ??= { name: "origin", fetch_specs: ["refs/heads/*:refs/remotes/origin/*"], params: {} });
    if (o.url === url && o.params?.git_ref === ref) process.exit(0);
    o.url = url;
    o.params = { ...(o.params ?? {}), git_ref: ref };
    fs.writeFileSync(file, JSON.stringify(s, null, 2) + "\n");
  ' "$REPO_STATE" "$URL" "$REF"
}

# `bd bootstrap` rewrites sync.remote in config.yaml; keep the committed file as it was.
bootstrap() {
  cp .beads/config.yaml "$STATE/config.yaml.bak"
  BD_SYNC_REMOTE="${1:-}" bd bootstrap --yes
  local rc=$?
  cp "$STATE/config.yaml.bak" .beads/config.yaml
  return $rc
}

# Retry a command up to 4 times.
retry() {
  local n=0
  until "$@"; do
    n=$((n + 1))
    [ "$n" -ge 4 ] && return 1
    sleep $((2 ** n))
  done
}

case "$cmd" in
start)
  remote_sha="$(retry git ls-remote origin "$REF" | cut -f1)"
  if [ ! -f "$REPO_STATE" ]; then
    if [ -n "$remote_sha" ]; then
      # Clone the shared history: mirror the branch into a local bare repo's
      # refs/dolt/data (where bootstrap looks; Dolt also needs one branch there).
      M="$STATE/mirror.git"
      rm -rf "$M" && git init -q --bare "$M"
      retry git -C "$M" fetch -q "$(git remote get-url origin)" "+$REF:refs/dolt/data" || {
        echo "beads-sync: could not fetch $REF"; exit 0; }
      git -C "$M" update-ref refs/heads/main refs/dolt/data
      bootstrap "git+file://$M" || { echo "beads-sync: bootstrap from $BRANCH failed"; exit 0; }
      rm -rf "$M"
    else
      # No shared history yet: start from the git-tracked JSONL; the push below seeds the branch.
      bootstrap || { echo "beads-sync: bootstrap from .beads/issues.jsonl failed"; exit 0; }
    fi
  fi
  set_ref || { echo "beads-sync: could not set the Dolt remote ref"; exit 0; }
  if [ -z "$remote_sha" ]; then
    echo "beads-sync: $BRANCH does not exist yet; seeding it from this database"
    retry bd dolt push || echo "beads-sync: seeding $BRANCH failed"
  elif ! retry bd dolt pull; then
    cat <<EOF
beads-sync: bd dolt pull failed. If it reports divergent histories, this database was
created separately from the shared one on $BRANCH. To adopt the shared one (issues only
in the local database are lost unless you re-file them):
  mv $DB $STATE/ja.local.\$(date +%s) && scripts/beads-sync.sh start
EOF
  fi
  stamp
  ;;
push)
  [ -f "$REPO_STATE" ] || exit 0
  # One push at a time (the Stop hook runs async); mkdir is atomic on macOS and Linux.
  mkdir "$STATE/lock" 2>/dev/null || exit 0
  trap 'rmdir "$STATE/lock"' EXIT
  [ "$(cksum < "$MANIFEST")" = "$(cat "$STATE/stamp" 2>/dev/null)" ] && exit 0
  set_ref || exit 1
  for _ in 1 2 3 4; do
    if bd dolt push; then stamp; exit 0; fi
    bd dolt pull || sleep 2
  done
  echo "beads-sync: bd dolt push to $BRANCH failed; run scripts/beads-sync.sh push to retry"
  exit 1
  ;;
*)
  echo "usage: scripts/beads-sync.sh start|push"
  exit 2
  ;;
esac
