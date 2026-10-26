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
| `NEXT_PUBLIC_SITE_URL` | `https://stride.vercel.app` | public |

The service-role / secret key is **not** needed by the app and must not be configured on the web
host. Build: `pnpm build`; start: `pnpm start` (port 3100, or set `PORT`/adjust the script).

Vercel: import the repo, **name the project `stride`** (this gives `https://stride.vercel.app`; if the
name is taken Vercel adds a suffix — use whatever URL it assigns everywhere below), framework preset
Next.js, set the variables above, deploy.

Then in Supabase → Authentication → URL Configuration set **Site URL** to `https://stride.vercel.app`
and add `https://stride.vercel.app/auth/confirm` to **Redirect URLs**. Confirmation emails link to
whichever host the user signed up on, but Supabase only honours hosts on that allow-list.

## 4. Replacing demo data

Production starts empty. The first user signs up, creates the organization on `/onboarding`
(becoming Organization Administrator + Delivery Head), invites colleagues from
**Administration → Members**, then creates clients, teams and projects. Demo organizations exist
only where `seed.sql` was run and are always marked `is_demo` with a banner.

To remove demo data from a local database: `pnpm db:reset` with an emptied seed file, or delete the
demo organizations (`delete from organizations where is_demo;`) and demo auth users.

## 5. CI

`.github/workflows/ci.yml` runs typecheck, lint, unit tests, starts Supabase, runs pgTAP, builds,
and runs Playwright. Database migrations to production should be applied from CI on merge to `main`
with `supabase db push` using a `SUPABASE_ACCESS_TOKEN` secret (not yet wired — Phase 8).

## 6. Backups

Supabase Pro includes daily backups and optional point-in-time recovery. Restore drills and runbooks
are Phase 8 deliverables.

## 7. Auth emails

| Email | Sent when | Link lands on |
|---|---|---|
| Confirm sign-up | Someone signs up (hosted: email confirmation on) | `/auth/confirm` → `/onboarding` |
| Magic link | An admin invites someone, or resends an invitation | `/auth/callback` → `/welcome` (accept + set password) |
| Reset password | "Forgot password?" | `/auth/confirm` → `/reset-password` |

The default Supabase templates work as-is. Links point at the host the request came from, so make sure
every production host is listed under Authentication → URL Configuration → Redirect URLs
(e.g. `https://stride.vercel.app/**`). Locally, all emails are captured by Mailpit at
http://127.0.0.1:55324.

## 8. Applying new migrations to the hosted project

Each release may add migrations (e.g. `20261027000100_phase1_gaps.sql`, `20261028000100_work_management.sql`). Apply them before or with the
app deploy:

```bash
supabase db push
```
