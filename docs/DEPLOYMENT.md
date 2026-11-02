# Stride — Deployment

## 1. Local development

Prerequisites: Node 22+, pnpm 10, Docker, Supabase CLI ≥ 2.100.

```bash
pnpm install
cp .env.example .env.local     # local defaults already filled in
pnpm db:start                  # Supabase on :55321 (API), :55322 (DB), :55323 (Studio), :55324 (Mailpit)
pnpm db:reset                  # migrations + demo seed
pnpm dev                       # http://localhost:3100 (uses .env.local)
pnpm dev:local                 # same, but forced onto the local Supabase stack
```

Sign in with a seeded demo user (password `DemoPass123`), e.g. `priya@northwind.example`
(Delivery Head + Admin). The login page lists the others in development builds.

Ports were moved off Supabase's defaults (543xx) to avoid clashing with other local stacks; see
`supabase/config.toml`.

## 2. Supabase (hosted) setup

1. Create a project at supabase.com. Choose the region closest to users.
2. **Auth → Providers → Email:** enable; turn **Confirm email ON** for production.
3. **Auth → URL configuration:** Site URL = your production URL; add `https://<domain>/auth/confirm`
   to redirect URLs.
4. **Auth → Policies:** minimum password length 10, require lowercase, uppercase and digits
   (matches `supabase/config.toml` and the sign-up form).
5. Email templates: change the confirmation link to
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/onboarding`.
6. **Configure a custom SMTP provider** (Project Settings → Authentication → SMTP). Supabase's
   built-in sender allows only a few emails per hour and is for testing. Stride sends sign-up
   confirmations, password resets and **invitation emails**, so bulk invitations need real SMTP; raise
   *Rate limits → emails per hour* afterwards.
7. Link and push migrations:
   ```bash
   supabase login
   supabase link --project-ref <project-ref>
   supabase db push            # applies supabase/migrations/* — does NOT run seed.sql
   ```
8. **Never run `supabase/seed.sql` against production.** It creates demo users with a known password.

## 3. Application hosting (Vercel or any Node host)

Environment variables:

| Variable | Value | Exposure |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` | public |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | project publishable (anon) key | public |
| `NEXT_PUBLIC_SITE_URL` | `https://stride-ces.vercel.app` | public |
| `ANTHROPIC_API_KEY` | Anthropic API key. Optional: only needed if an organization selects the Anthropic provider for AI agents (the built-in provider needs nothing) | **server-only secret** — never prefix with `NEXT_PUBLIC_` |
| `ANTHROPIC_BASE_URL` | Optional override of `https://api.anthropic.com` (proxy or test double) | server-only |
| `SUPABASE_SECRET_KEY` | The project's secret (service-role) key. **Required for automation (Phase 7)**: only the background worker and the "Process now" / "Sync now" buttons use it, and only to call a fixed set of `service_role` RPCs | **server-only secret** |
| `CRON_SECRET` | At least 16 random characters. The scheduler endpoint refuses every request without `Authorization: Bearer <this>`, and answers 503 while it is unset | **server-only secret** |
| `LOG_LEVEL` | `debug`, `info` (default), `warn` or `error` | server-only |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Optional. OTLP/HTTP collector URL; setting it turns tracing on (`OTEL_EXPORTER_OTLP_HEADERS` for auth, `OTEL_SERVICE_NAME` to rename, default `stride-ces`) | server-only |
| `RESEND_API_KEY`, `EMAIL_FROM` | Optional. Set both to send notification email through Resend; without them email is recorded as *simulated* | server-only |

The secret key is used for one purpose: the automation worker (`/api/cron/tick` and the two admin
buttons that run a worker pass). It is created only in `src/lib/supabase/service.ts`, never reaches
the browser, and the app reads no tenant table with it — see ADR-0012. Without it the app runs, but
nothing is delivered, reminded or synced. Build: `pnpm build`; start: `pnpm start` (port 3100, or set `PORT`/adjust the script).

Vercel: import the repo, **name the project `stride-ces`** (this gives `https://stride-ces.vercel.app`; if the
name is taken Vercel adds a suffix — use whatever URL it assigns everywhere below), framework preset
Next.js, set the variables above, deploy.

Then in Supabase → Authentication → URL Configuration set **Site URL** to `https://stride-ces.vercel.app`
and add `https://stride-ces.vercel.app/auth/confirm` to **Redirect URLs**. Confirmation emails link to
whichever host the user signed up on, but Supabase only honours hosts on that allow-list.

## 4. Replacing demo data

Production starts empty. The first user signs up, creates the organization on `/onboarding`
(becoming Organization Administrator + Delivery Head), invites colleagues from
**Administration → Members**, then creates clients, teams and projects. Demo organizations exist
only where `seed.sql` was run and are always marked `is_demo` with a banner.

To remove demo data from a local database: `pnpm db:reset` with an emptied seed file, or delete the
demo organizations (`delete from organizations where is_demo;`) and demo auth users.

## 5. CI

`.github/workflows/ci.yml` runs a production dependency audit (high and above), typecheck, lint,
unit tests, starts Supabase, runs pgTAP, checks that `database.types.ts` matches the migrations,
builds, and runs Playwright. Runs for the same ref cancel each other.

`.github/workflows/deploy-db.yml` applies migrations to production after CI passes on `main`. Create a
GitHub environment named `production`, add required reviewers, and give it the secrets
`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` and `SUPABASE_PROJECT_REF`. The job links the project,
prints the pending migrations, then applies them. It can also be started by hand
(`workflow_dispatch`). Preview databases per pull request need Supabase Branching (a paid feature);
until it is enabled, pull requests are tested against the local stack CI starts.

Monitoring: point an uptime check at `/api/health` (200 = up; 503 = Supabase Auth unreachable) and
alert on a stale scheduler heartbeat. See `docs/RUNBOOKS.md`.

## 6. Backups

Supabase Pro includes daily backups and optional point-in-time recovery (turn it on for production).
The restore drill, with a log table for recorded recovery times, is in `docs/RUNBOOKS.md`.

## 7. Auth emails

| Email | Sent when | Link lands on |
|---|---|---|
| Confirm sign-up | Someone signs up (hosted: email confirmation on) | `/auth/confirm` → `/onboarding` |
| Magic link | An admin invites someone, or resends an invitation | `/auth/callback` → `/welcome` (accept + set password) |
| Reset password | "Forgot password?" | `/auth/confirm` → `/reset-password` |

The default Supabase templates work as-is. Links point at the host the request came from, so make sure
every production host is listed under Authentication → URL Configuration → Redirect URLs
(e.g. `https://stride-ces.vercel.app/**`). Locally, all emails are captured by Mailpit at
http://127.0.0.1:55324.

## 8. Applying new migrations to the hosted project

Each release may add migrations (e.g. `20261027000100_phase1_gaps.sql`, `20261028000100_work_management.sql`, `20261029000100_workforce.sql`, `20261102000100_governance.sql`). Apply them before or with the
app deploy:

```bash
supabase db push
```


## Scheduler (Phase 7)

Automation needs something to call `GET|POST /api/cron/tick` with `Authorization: Bearer $CRON_SECRET`
about once a minute (every request is idempotent and safe to overlap). Pick one:

- **Vercel Cron** — add a `crons` entry for `/api/cron/tick` in `vercel.json` (`* * * * *` needs a paid plan; the
  free tier allows one run a day, which is too slow for webhooks and notifications). Vercel sends
  `Authorization: Bearer $CRON_SECRET` automatically when `CRON_SECRET` is set.
- **GitHub Actions** — a `schedule:` workflow that runs `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/tick`
  (GitHub's schedule can be several minutes late).
- **Supabase `pg_cron` + `pg_net`** — `select net.http_post(url := 'https://<host>/api/cron/tick', headers := jsonb_build_object('Authorization', 'Bearer <secret>'))` every minute.

The Scheduler page (Workflow Automation → Scheduler) shows the last tick and turns red after 15 quiet
minutes. Locally, the **Process now** button there runs one pass.

Outbound webhooks are refused if they resolve to a private address, but a hostname can change between
that check and the connection. If your host allows it, also restrict the web server's egress to the
public internet (no route to your VPC, the cloud metadata address or `localhost`).

New in Phase 7: migration `20261105000100_automation.sql` — **must be pushed to the hosted project**
(`supabase db push`).
