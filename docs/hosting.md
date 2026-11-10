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
- **Daily cap.** The ledger's own daily budget (PR #42 review S8), set by `JEV_DAILY_USD` in `web/worker/wrangler.toml`: $2 a UTC day across every run. That is above the dev server's $0.10 default, because the hosted game is played from several devices. The ledger reserves each call's worst case against it, as it does against a run's cap. The day's reservations outlast the run that made them, so starting a new run does not free room held for calls still out (PR #66 review S1). The day's spend is counted from real `usage.input_tokens` and kept in Durable Object storage, so evicting or redeploying the Worker doesn't reset it.

A leaked passphrase costs at most the daily cap per day. One case slips past it: a call that gets no reply within 20 s. That call is cut off at its deadline and counted as costing nothing, though Jev may still bill it. Replies normally take well under a second. A stop never cuts a call that has been sent: the call runs to its reply or its deadline, and whatever Jev bills for it is counted against the day. (The dev server's 1.5 s grace before cutting a call would have been a way past the cap here.) The Worker also fixes the model at `jev-latest`, the one the ledger prices.

To revoke the passphrase, change the `JEV_ANTS_PASSPHRASE` secret and re-run the Pages workflow.

There is one ledger for everyone, held in a single Durable Object, so two browsers share one run: a start in one ends the other's run. That fits a single-user app.

Every build is on one origin (`bwvogler.github.io`), so in a browser `main` and every PR preview share one `localStorage`: the passphrase, the Jev answers cached in the page, and the game saves. One unlock covers them all, and answers a preview got from Jev are reused on `main`. On the other hand, a preview's autosave shows in `main`'s Continue list, and a preview whose words or legends differ caches its answers beside `main`'s. They are kept under their own context and don't overwrite main's. This is the owner's choice (PR #66 review D1, 2026-11-10): nobody else plays yet, so the mixing costs little. Revisit it when the site has players. The origin allowlist has the same reach: any Pages site on the `bwvogler` account may call the Worker, and the passphrase is what keeps a call out.

The reply functions the Worker shares with the dev server are in `web/server/replies.ts`, not `api.ts`. `api.ts` resolves its budget file's path from `import.meta.url` when it loads, and that throws in a Worker ("Invalid URL string"), so the Worker must never import it.

## One-time setup

1. **Pages source.** Settings → Pages → Build and deployment → Source: **Deploy from a branch**, branch **`gh-pages`**, folder **`/ (root)`**. The branch already exists once any PR preview has run, or once `pages.yml` has run on `main` (it pushes there whatever the source is set to). The dropdown lists only existing branches. Previews need branch deploys: the "GitHub Actions" source cannot hold more than one site.
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

Locally, `wrangler dev` in `web/worker` with `--env-file` holding `JEV_API_KEY`, `ACCESS_PASSPHRASE`, `ALLOWED_ORIGINS=http://localhost:4173` and optionally `JEV_DAILY_USD` runs the same Worker under workerd. A build with `BASE_PATH=/ant-sym/ VITE_JEV_API=http://localhost:8799`, served by `vite preview`, then behaves like Pages. Checked that way on 2026-11-10, after the merge with the one-world game, with `JEV_DAILY_USD=0.02`. A wrong passphrase was refused. Once unlocked, Jev started on its own at the first uncached situation: 5 calls, all 200, and $0.00033 counted against the day's $0.02.

## Cost

Same lanes and per-question tokens as local play (CLAUDE.md, PRD §37, §39, §44.3). The proxy adds no tokens. Cloudflare's free plan allows 100,000 Worker requests a day. The measured game above made 17 calls in its first 12 s, when its cache is emptiest, and fewer as answers are cached. Each call counts once at the Worker and once at the Durable Object.
