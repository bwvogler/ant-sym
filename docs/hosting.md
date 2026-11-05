# Hosting: Pages, PR previews and the Jev proxy

The app is a static build plus three API routes (`/api/health`, `/api/run`, `/api/jev`). In dev those routes are Vite middleware (`web/server/api.ts`) and the key comes from the shell. On GitHub Pages there is no server, so the routes run on a Cloudflare Worker (`web/worker/`) and the Pages builds call it.

| Build | URL | Jev |
|---|---|---|
| `main` | `https://bwvogler.github.io/ant-sym/` | through the Worker, once unlocked with the passphrase |
| each PR to `main` | `https://bwvogler.github.io/ant-sym/pr-preview/pr-<n>/` (linked in a sticky PR comment, removed on close) | same Worker, same passphrase (same origin, so one unlock covers every build) |
| any build made without `VITE_JEV_API` | — | off: the demo, ants on the local rule |

## What protects the key

The pages are public, so the Worker has three locks:

- **Passphrase.** Every call but `/api/health` needs the `x-jev-ants-pass` header to match the Worker secret `ACCESS_PASSPHRASE`. With no passphrase configured, nothing gets in. The page asks for it once and keeps it in that browser's `localStorage`. It is not the Jev key; the key never leaves the Worker.
- **Origin.** A browser request from any origin other than `ALLOWED_ORIGINS` (in `web/worker/wrangler.toml`: `https://bwvogler.github.io`) is refused. Curl can fake an origin, so this lock only keeps other websites out; the passphrase is the real one.
- **Daily cap.** `DAILY_CAP_USD` (default $2) bounds all runs in a UTC day. Each run starts with its spend cap cut to what the day has left, so the ledger's per-call reservations enforce the daily cap as strictly as the per-run one. The day's spend is kept in Durable Object storage and counted from real `usage.input_tokens`.

A leaked passphrase costs at most the daily cap per day. To revoke it, change the `JEV_ANTS_PASSPHRASE` secret and re-run the Pages workflow.

There is one ledger for everyone, held in a single Durable Object, so two browsers share one run: a Start in one ends the other's run. That fits a single-user app.

## One-time setup

1. **Pages source.** Settings → Pages → Build and deployment → Source: **Deploy from a branch**, branch **`gh-pages`**, folder **`/ (root)`**. The first run of `pages.yml` after this change creates the branch. Previews need branch deploys: the "GitHub Actions" source cannot hold more than one site.
2. **Cloudflare.** Create an account (the free plan is enough: Workers plus SQLite-backed Durable Objects). Then create an API token from the "Edit Cloudflare Workers" template, and note your account ID.
3. **Repository secrets** (Settings → Secrets and variables → Actions → Secrets):
   - `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
   - `JEV_API_KEY`: the TypeSafe key
   - `JEV_ANTS_PASSPHRASE`: a long random string, e.g. `openssl rand -base64 24`
4. **Deploy the Worker.** Run the Pages workflow (Actions → Pages → Run workflow). The `worker` job deploys it and uploads the two secrets. It is skipped while `CLOUDFLARE_API_TOKEN` is unset. Its log prints the Worker's URL, `https://jev-ants-api.<your-subdomain>.workers.dev`.
5. **Repository variable** (same page → Variables): `JEV_API_URL` = that URL. Then run the Pages workflow again so the build includes it. Until this variable is set, every Pages build stays the demo.

## Checking it

```sh
curl -s https://jev-ants-api.<sub>.workers.dev/api/health
# {"ok":true,"hasKey":true,"hosted":true,"authorized":false}
curl -s -H "x-jev-ants-pass: $PASS" https://jev-ants-api.<sub>.workers.dev/api/health
# … "authorized":true, "daily":{"day":…,"usd":…,"capUsd":2}
```

Locally, `wrangler dev` in `web/worker` with `--env-file` holding `JEV_API_KEY`, `ACCESS_PASSPHRASE` and `ALLOWED_ORIGINS=http://localhost:4173` runs the same Worker under workerd. A build with `BASE_PATH=/ant-sym/ VITE_JEV_API=http://localhost:8799`, served by `vite preview`, then behaves like Pages. Measured that way on 2026-11-05: a wrong passphrase was refused, the run's $0.10 cap was cut to the $0.02 daily cap, and 17 calls (18,152 tokens, $0.0008) all returned 200.

## Cost

Same lanes and per-question tokens as local play (CLAUDE.md, PRD §37, §39, §44.3). The proxy adds no tokens. Cloudflare's free plan allows 100,000 Worker requests a day. The measured game above made 17 calls in its first 12 s, when its cache is emptiest, and fewer as answers are cached. Each call counts once at the Worker and once at the Durable Object.
