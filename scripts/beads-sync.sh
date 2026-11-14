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
#   scripts/beads-sync.sh start   bootstrap the database from the branch, then pull (SessionStart hook)
#   scripts/beads-sync.sh push    push local changes; on rejection pull, merge, retry (Stop hook)
#   scripts/beads-sync.sh seed    create the branch from this database (only when it doesn't exist)
#
# start and push never create the branch: a session that arrived first would otherwise
# publish whatever stale .beads/issues.jsonl its checkout had (happened 2026-11-02).
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
LOCK="$STATE/lock"
DBROOT=".beads/embeddeddolt"   # bd bootstrap treats any non-empty one as an existing database
DB="$DBROOT/ja"
REPO_STATE="$DB/.dolt/repo_state.json"
MANIFEST="$DB/.dolt/noms/manifest"   # changes on every Dolt commit, not on reads
mkdir -p "$STATE"
chmod 700 .beads 2>/dev/null

# `bd bootstrap` rewrites sync.remote in config.yaml to the temporary mirror; a run killed
# mid-bootstrap (hook timeout) leaves it there. Put the committed value back first.
if grep -q 'beads-sync/mirror.git' .beads/config.yaml 2>/dev/null && [ -f "$STATE/config.yaml.bak" ]; then
  cp "$STATE/config.yaml.bak" .beads/config.yaml
fi
# The Dolt remote URL is sync.remote from .beads/config.yaml (git+ssh://…; the cloud
# proxy rewrites ssh GitHub URLs to https).
URL="$(sed -n 's/^[[:space:]]*remote:[[:space:]]*"\(.*\)"[[:space:]]*$/\1/p' .beads/config.yaml | head -1)"
[ -n "$URL" ] || URL="git+$(git remote get-url origin)"

# One sync at a time: Stop runs push async, and SessionStart (start) also fires on
# resume, clear and compact. mkdir is atomic on macOS and Linux. Waits rather than
# skipping, so a write made while an earlier push runs still goes out; a lock whose
# process is gone (killed, OOM, container restart) is broken.
acquire_lock() {
  local waited=0 pid
  until mkdir "$LOCK" 2>/dev/null; do
    pid="$(cat "$LOCK/pid" 2>/dev/null)"
    if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
      echo "beads-sync: breaking a stale lock left by process $pid"
      rm -rf "$LOCK"
      continue
    fi
    if [ "$waited" -ge 180 ]; then
      echo "beads-sync: another sync (pid ${pid:-?}) has held $LOCK for 3 minutes; giving up"
      return 1
    fi
    sleep 1
    waited=$((waited + 1))
  done
  echo $$ > "$LOCK/pid"
  trap 'rm -rf "$LOCK"' EXIT
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

# Print the branch's SHA. Returns 0 if it exists, 2 if it doesn't, 1 if origin
# couldn't be reached (so a network blip is never mistaken for "no branch").
remote_branch() {
  local out rc n=0
  while :; do
    out="$(git ls-remote --exit-code origin "$REF")"; rc=$?
    [ "$rc" -eq 0 ] && { printf '%s\n' "$out" | cut -f1; return 0; }
    [ "$rc" -eq 2 ] && return 2
    n=$((n + 1))
    [ "$n" -ge 4 ] && return 1
    sleep $((2 ** n))
  done
}

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

# Clone the shared history: mirror the branch into a local bare repo's refs/dolt/data
# (where bootstrap looks; Dolt also needs one branch there).
bootstrap_from_branch() {
  local M="$STATE/mirror.git"
  rm -rf "$M" && git init -q --bare "$M"
  retry git -C "$M" fetch -q "$(git remote get-url origin)" "+$REF:refs/dolt/data" || {
    echo "beads-sync: could not fetch $REF"; return 1; }
  git -C "$M" update-ref refs/heads/main refs/dolt/data
  bootstrap "git+file://$M" || { echo "beads-sync: bootstrap from $BRANCH failed"; return 1; }
  rm -rf "$M"
  [ -f "$REPO_STATE" ] || { echo "beads-sync: bootstrap left no database at $DB"; return 1; }
}

# The local database has its own history (made by bd init or a JSONL import, not cloned
# from the branch), so it can never merge with the shared one. Adopt the shared one and
# replay the local issues on top: bd import upserts, skipping rows older than the shared copy.
adopt() {
  local ts backup aside
  ts="$(date +%s)"; backup="$STATE/local-$ts.jsonl"; aside="$STATE/embeddeddolt.local.$ts"
  echo "beads-sync: this database's history is separate from $BRANCH; adopting $BRANCH and replaying local issues on top"
  bd export --include-memories -o "$backup" || {
    echo "beads-sync: could not export the local database; left it as it is"; return 1; }
  mv "$DBROOT" "$aside" || {
    echo "beads-sync: could not move the local database aside; left it as it is"; return 1; }
  if ! bootstrap_from_branch; then
    rm -rf "$DBROOT"; mv "$aside" "$DBROOT"; echo "beads-sync: restored the local database"; return 1
  fi
  set_ref
  bd import "$backup" 2>&1 | grep -v -i permissions | tail -3
  bd dolt push 2>&1 | tail -1   # publish whatever the replay changed; a no-op otherwise
  echo "beads-sync: the old database is at $aside and its export at $backup"
}

# Pull with retries; adopt the shared history when the local one is unrelated.
pull_or_adopt() {
  local out n=0
  while :; do
    out="$(bd dolt pull 2>&1)" && { printf '%s\n' "$out" | tail -1; return 0; }
    case "$out" in *"no common ancestor"*) adopt; return $?;; esac
    n=$((n + 1))
    [ "$n" -ge 4 ] && { printf '%s\n' "$out"; return 1; }
    sleep $((2 ** n))
  done
}

case "$cmd" in
start|seed)
  acquire_lock || exit 0
  remote_sha="$(remote_branch)"; rs=$?
  if [ "$rs" -eq 1 ]; then
    echo "beads-sync: could not reach origin to check $BRANCH; not syncing this time"
    exit 0
  fi
  if [ ! -f "$REPO_STATE" ]; then
    # Leftovers without a Dolt repo in them make bd bootstrap report "already exists".
    if [ -d "$DBROOT" ]; then
      mv "$DBROOT" "$STATE/embeddeddolt.empty.$(date +%s)" || exit 0
    fi
    if [ "$rs" -eq 0 ]; then
      bootstrap_from_branch || exit 0
    else
      # No beads-dolt branch: bd bootstraps from a local .beads/issues.jsonl if one exists (it is no longer in git, ja-w7ef.1).
      bootstrap || { echo "beads-sync: bootstrap failed (no $BRANCH branch and no local .beads/issues.jsonl)"; exit 0; }
    fi
  fi
  set_ref || { echo "beads-sync: could not set the Dolt remote ref"; exit 0; }
  if [ "$rs" -eq 2 ] && [ "$cmd" = seed ]; then
    echo "beads-sync: seeding $BRANCH from this database"
    retry bd dolt push || echo "beads-sync: seeding $BRANCH failed"
  elif [ "$rs" -eq 2 ]; then
    echo "beads-sync: $BRANCH does not exist on origin; working locally. Run scripts/beads-sync.sh seed to create it."
  else
    [ "$cmd" = seed ] && echo "beads-sync: $BRANCH ($remote_sha) already exists; not seeding. Pulling instead."
    pull_or_adopt || echo "beads-sync: bd dolt pull from $BRANCH failed"
  fi
  # No stamp here: local commits a killed or failed push left behind must still go out,
  # so the next push compares against the last *pushed* state (one no-op push at worst).
  ;;
push)
  [ -f "$REPO_STATE" ] || exit 0
  acquire_lock || exit 1
  # The stamp is the manifest as it was *before* the last successful push, so a write that
  # lands during a push differs from it and goes out on the next pass of this loop.
  for _ in 1 2 3 4 5 6; do
    pre="$(cksum < "$MANIFEST")"
    [ "$pre" = "$(cat "$STATE/stamp" 2>/dev/null)" ] && exit 0
    remote_branch >/dev/null; rs=$?
    if [ "$rs" -eq 2 ]; then
      echo "beads-sync: $BRANCH does not exist on origin; not creating it (run scripts/beads-sync.sh seed)"
      exit 1
    elif [ "$rs" -ne 0 ]; then
      echo "beads-sync: could not reach origin; run scripts/beads-sync.sh push to retry"
      exit 1
    fi
    set_ref || exit 1
    if bd dolt push; then
      printf '%s\n' "$pre" > "$STATE/stamp"
    else
      pull_or_adopt || sleep 2
    fi
  done
  echo "beads-sync: bd dolt push to $BRANCH did not settle; run scripts/beads-sync.sh push to retry"
  exit 1
  ;;
*)
  echo "usage: scripts/beads-sync.sh start|push|seed"
  exit 2
  ;;
esac
