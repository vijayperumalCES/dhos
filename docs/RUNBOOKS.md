# Stride — Runbooks

Operational procedures for the hosted deployment (Vercel + Supabase). Each one says how you know it
is needed, what to do, and how to confirm it worked. Replace `<ref>` with the Supabase project ref.

Where to look first: `GET /api/health` (is the app up, does Supabase Auth answer), the host's log
stream (one JSON object per line; filter on `"level":"error"`), and **Automation → Scheduler** (is
the worker alive).

## 1. The app is down or erroring

**Signs:** uptime monitor on `/api/health` fails; `status` is `degraded` (HTTP 503) with
`"database":"unreachable"`; users report blank pages.

1. `curl -s https://<host>/api/health`. `degraded` means Supabase Auth did not answer within 2.5 s:
   check the Supabase status page and the project's dashboard (paused? out of connections?).
2. If health is `ok` but pages fail, search logs for `unhandled request error`. Each line carries
   `path`, `routePath`, `digest` and the error message. A cluster after a deploy is a bad release:
   promote the previous deployment in Vercel (**Deployments → … → Promote to production**).
3. A new migration that the code needs but the database lacks (or the reverse) shows as
   `unexpected database error` with codes `42P01` (missing table) or `42883` (missing function). Apply
   pending migrations (section 6) or roll the app back to the release that matches the schema.

**Confirm:** `/api/health` returns 200 and the error rate in logs returns to zero.

## 2. Notifications, webhooks or email stopped

**Signs:** **Automation → Scheduler** shows a *stale* heartbeat; the bell never changes; deliveries
stay *pending*; the outbox count on **Automation → Events** keeps growing.

1. Is the scheduler calling? Check the caller (Vercel Cron, GitHub Actions schedule, pg_cron) for
   failures. Test by hand:
   ```bash
   curl -i -X POST https://<host>/api/cron/tick -H "Authorization: Bearer $CRON_SECRET"
   ```
   - `401`: the caller has the wrong secret. `503`: `CRON_SECRET` (16+ characters) or
     `SUPABASE_SECRET_KEY` is missing on the web host.
   - `200` with a non-empty `errors` array: read the stage name (`events`, `webhooks`, `emails`,
     `jobs`). Logs show the same text as `scheduler tick finished with stage errors`.
2. If the tick works by hand but not on schedule, fix the schedule. A tick is safe to repeat; every
   step claims rows with `SKIP LOCKED`.
3. Events that keep failing back off and eventually stay unprocessed; look for rows in
   `outbox_events` with a high `attempts` and a `last_error`. Fix the cause, then the next tick
   retries them.

**Confirm:** the heartbeat on the Scheduler page is fresh (under two minutes old).

## 3. A webhook endpoint is failing

**Signs:** deliveries in **Automation → Deliveries** are *failed* or *dead*; an endpoint shows
*disabled* (it auto-disables after 10 consecutive failures).

1. Open the delivery: the status code and short error are recorded (never the body or the secret).
2. `blocked address` or `not https`: the URL failed the outbound guard. Use a public https URL.
3. Timeouts or 5xx: the receiver is down. When it is back, re-enable the endpoint (this resets its
   failure count), then **Retry** the dead deliveries. Retries back off 1 min, 5 min, 30 min, 2 h,
   12 h, then the delivery is `dead`.
4. Suspected leaked secret: **Rotate secret** on the endpoint, then give the new value to the
   receiver. The old one stops verifying immediately; the new one is shown once.

## 4. Secret rotation

| Secret | Where it lives | Rotate by | Effect |
|---|---|---|---|
| `CRON_SECRET` | web host env, scheduler config | set a new 16+ character value in both, redeploy | the old value gets 401 at once |
| `SUPABASE_SECRET_KEY` | web host env | Supabase → Project settings → API keys: create a new secret key, set it, redeploy, delete the old one | worker and admin "run now" use the new key |
| `RESEND_API_KEY` | web host env | Resend dashboard, then set and redeploy | email falls back to *simulated* while it is unset |
| `ANTHROPIC_API_KEY` | web host env | Anthropic console, then set and redeploy | agents on the Anthropic provider fail until updated; the built-in provider is unaffected |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` | GitHub `production` environment secrets | regenerate in Supabase, update the secrets | the next database deploy uses them |
| Webhook endpoint secrets | database, per endpoint | **Rotate secret** in the UI | see section 3 |

After any rotation, call `/api/health` and run one manual tick.

## 5. Backup and restore drill

Supabase Pro keeps daily backups; point-in-time recovery is a paid add-on and should be on for
production. **Do the drill in a scratch project, never in production**, at least once a quarter and
after major schema changes.

1. Dashboard → Database → Backups: note the newest backup time (or choose a PITR timestamp).
2. Restore it into a *new* project (Dashboard → Restore to new project), or take a logical dump:
   ```bash
   supabase db dump --linked -f backup.sql           # schema
   supabase db dump --linked --data-only -f data.sql # data
   ```
3. Point a build of the app at the restored project (`NEXT_PUBLIC_SUPABASE_*`) and check:
   - sign-in works and the organization switcher lists organizations;
   - a project, its work items and the audit log are present;
   - `select count(*) from audit_log` is not lower than the source at the backup time;
   - pending migrations apply cleanly (`supabase db push --linked --dry-run` is empty or lists only
     newer files).
4. Write down the elapsed time from "start restore" to "sign-in works" — that is your measured
   recovery time. Record it in the drill log below.
5. Delete the scratch project.

| Date | Source | Method | Recovery time | Result | By |
|---|---|---|---|---|---|
| _none yet_ | | | | | |

What is *not* in a database backup: Supabase Auth settings, SMTP config, Vercel env vars and the
GitHub secrets. Keep those in the team password manager so a rebuilt project can be reconfigured.

## 6. Applying and rolling back migrations

**Apply.** Merging to `main` runs CI; when CI passes, `.github/workflows/deploy-db.yml` waits for a
reviewer on the `production` environment, prints the pending list (`db push --dry-run`) and applies
it. Manual equivalent:
```bash
supabase link --project-ref <ref>
supabase db push --linked --dry-run
supabase db push --linked
```
Deploy the migration **before** the code that needs it. Migrations here add objects and are written
to be safe for the previous release to run against; keep it that way (no drops or renames in the same
release as the code that stops using the old name).

**Roll back.** Migrations are forward-only. To undo one, write a new migration that reverses it,
test it with `supabase db reset` locally, and ship it the same way. For data damage rather than a
schema mistake, use the restore drill in section 5 against a new project and copy the affected rows
back; do not restore over production.

## 7. Suspected tenant data exposure

Treat as an incident immediately.

1. Contain: if one feature is leaking, suspend the affected organization's access or take the app
   offline (Vercel → pause deployment) before investigating.
2. Preserve: do not delete anything. The audit log is append-only and is never purged by retention.
3. Scope: find which table and which policy. `supabase/tests/database` holds a cross-tenant test per
   module; reproduce with a failing pgTAP test first.
4. Fix with a migration, deploy, rotate `SUPABASE_SECRET_KEY` if privileged access is in doubt.
5. Notify affected customers according to the contract and law that apply to them.

## 8. Someone is locked out by required MFA

**Signs:** a person can sign in but is sent to `/mfa` and cannot produce a code (lost phone), or the
`/mfa` page says it could not load authenticator settings.

1. Could not load settings: TOTP MFA is not enabled on the Supabase project. Enable it under
   Authentication → Multi-Factor.
2. Lost authenticator: confirm who the person is out of band. In Supabase → Authentication → Users, open
   the user and remove their MFA factor. At the next sign-in they enrol a new one at `/mfa`.
3. Nobody in the organization can get in (every administrator lost their factor): an operator with
   database access can switch the requirement off, then restore it once an administrator has re-enrolled:
   ```sql
   update organization_settings set require_mfa = false where organization_id = '<org id>';
   ```
   The settings audit trigger records the change with no actor, so write down who ran it and why in the
   incident notes.

## 9. Privileged role requests are stuck

With dual approval on, a request needs a *different* administrator. If only one administrator is
active (the other left or was suspended), requests cannot be approved. Reactivate or appoint a second
administrator directly in the database as an operator, or switch the control off (audited) and
re-enable it afterwards. Requests expire after 7 days and can be cancelled by their requester.

## 10. Retention and legal hold

The `retention` scheduler job deletes processed outbox events and finished webhook deliveries older
than 30 days, and read notifications and job logs older than 90 days. The audit log is never purged.
To check it ran: **Automation → Scheduler → retention → last run**. Windows (7 to 3650 days) and the
legal hold are set under **Administration → Security**. While a hold is in force the job runs but
deletes nothing; lift the hold to resume deletion.

## 11. A project report did not arrive

Open the project → **Delivery metrics** → *Sent reports* (needs permission to publish for the project).
`Waiting to send` means the tick has not run or failed: check **Automation → Scheduler** for the
heartbeat and the `reports` errors. `Not sent (no mail provider)` means `RESEND_API_KEY` or `EMAIL_FROM`
is not set. `Failed` shows the provider's last error after three attempts; fix it, then set the run's
`status` back to `pending` and `attempts` to 0 as an operator, or wait for the next period. No row at
all: the project is not planning, active or on hold, has no recipients, or that report is switched off;
the `metrics_reports` job (hourly) must have run since the period ended. Recipients already delivered to
are never emailed twice for the same report.
