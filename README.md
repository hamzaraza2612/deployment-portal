# DevOps Portal

A centralized web dashboard for the interactive `deploy.sh` script: instead of
SSHing into each environment and running the script by hand, this portal
drives the same steps — clone/pull, branch checkout, source directory
selection, backup, `rsync` deploy, and `docker compose` restart — remotely
over SSH from one place, for every environment/server you manage.

## How it maps to the original script

| Script step | Portal equivalent |
| --- | --- |
| Enter Git URL / user / token once | **Repositories** page (stored, encrypted) |
| Clone or pull | Step 1 of the **Deploy** wizard (`POST /deployments/branches`) |
| Branch selection | Step 2 of the wizard (`POST /deployments/checkout`) |
| Select source directory (interactive folder browser) | Step 3 — remote file browser rooted at the repo checkout |
| Select deployment base path + app | Step 4 — pick from the server's configured base paths, then the app folder |
| Backup current build | Done automatically on deploy, with an optional custom name |
| `rsync` deploy (excluding `appsettings*.json`, `*securesettings*.json`, `config.json`) | Done automatically on deploy |
| `docker compose down && up -d` | Done automatically on deploy |
| Append to `deployment_audit.log` | Done automatically on deploy (remote file) + stored in the portal's database as deployment history |
| Repeat for another server/app | Every environment is a **Server** record — pick a different one and go through the wizard again |

Each environment/server you deploy to is registered once (host, SSH
credentials, git base dir, base deployment paths, audit log path) and the
portal SSHes into it for every step, so servers never need the script
installed locally.

## Environments

Every server carries a free-text **environment** tag (Dev, Staging,
Production, …), set when you add or edit it under **Servers**. The
**Environments** page groups servers by that tag — click an environment to
see every server in it, and for each one, the docker containers running
there (`docker ps -a`, read live over the same SSH connection used for
deploys), with Start / Stop / Restart / Recreate actions.

**Recreate is destructive.** It reads the container's own `docker compose`
labels to find its project directory, then runs `docker compose down -v`
followed by `docker compose up -d` there — every service in that compose
project is stopped and their volumes (databases, any persistent data) are
permanently deleted before being brought back up fresh. It acts on the
whole project, not just the clicked container. The confirm dialog spells
this out before anything runs. Containers not started via compose can be
started/stopped/restarted but not recreated.

Each server's card also shows a running vs. stopped container count next
to its name, and a search box filters that server's containers. Live
resource usage lives on the separate **Monitoring** page instead of
cluttering this one — see below.

A **Logs** button per container opens `docker logs --tail N --timestamps`
in its own full-page tab (`/environments/:serverId/containers/:id/logs`),
not a small popup — auto-refreshing every 3 seconds, with a selectable
tail length and a text filter over the displayed lines. Press **Enter**
in the search box (or click "Mark now") to drop a divider at that point
in the log, based on each line's own `--timestamps` prefix rather than
text position — so it stays correctly placed even though every refresh
re-fetches the whole tail window instead of appending. Anything logged
after you hit Enter shows up below the divider, making it easy to see
what's new since you started watching.

The **Deploy** wizard's branch and application pickers are searchable
(type to filter, matched against the full list fetched from the server)
rather than long plain dropdowns.

## Monitoring

**Admin only** — a single page under one **Monitoring** nav item, split
into two tabs so it doesn't need two sidebar entries:

- **Docker Stats** — every container's live **CPU%, memory usage/limit,
  and network/block I/O** (`docker stats --no-stream`, refreshed every 3
  seconds), grouped by environment — databases (Redis, Postgres, MSSQL,
  Mongo, …), caches, and application containers alike, whatever is
  running under Docker on that server. Read-only (no start/stop/recreate
  — those stay on **Environments**).
- **Server Monitoring** — host-level **CPU, RAM, and disk usage** per
  server (`vmstat`/`free`/`df` over SSH, refreshed every 10 seconds),
  grouped by environment, plus auto-detected **common services that
  often run directly on the VM rather than in Docker** — Redis,
  PostgreSQL, MSSQL, MongoDB, and Docker itself — with no per-server
  configuration needed. Each is checked in order (a likely systemd unit
  name, then its well-known port, then a process-name pattern), so it's
  found whether or not it's managed by systemd or named unusually.
  Detected services show CPU% and memory (`ps` on the resolved PID) when
  a PID is available; undetected ones just show "Not found" rather than
  blocking anything. This is deliberately a lightweight up/down +
  resource check — no credentials are stored and no actual
  connection/ping is made to the service.

Both tabs are Admin-only, enforced both by hiding the nav item and by
the API routes themselves requiring the Admin role, not just a hidden
button — non-admin users (devs, QA) still see container state on
**Environments**, just not host- or container-level resource metrics.
Alerting on any of this (thresholds, notify on a container going down)
is planned but not built yet.

## Links

A self-service directory of **application URLs and login credentials**,
grouped by environment — for when a developer or QA tester just needs the
URL and password for one of many apps without asking around. Each entry
(name, URL, optional username/password/notes) is tagged with an
environment the same way a Server is; a Dev-only user only ever sees Dev
entries, QA only QA, and so on, enforced the same way as everything else
(server-side, not just hidden in the UI). Passwords are encrypted at rest
(AES-256-GCM) but — unlike SSH/git credentials, which the API never
returns — are decrypted and sent to any user who has access to that
environment, since the point of this page is exactly that: self-service
lookup. Only Admins can add/edit/delete entries; everyone with access to
an environment can view its entries, reveal/hide each password, and copy
it.

## Reverting a deployment

Every **successful** deployment in **History** (or its detail page) gets a
**"Revert to this"** button — for rolling an app back to how it looked at
that point, without going through the full wizard. Reverting:

1. Backs up whatever is *currently* published (so the revert itself isn't a
   dead end — you can revert a revert).
2. Empties the publish folder and restores it to exactly match the target
   deployment's own backup (`rsync -av --delete`, a clean mirror rather than
   a merge/overwrite — files that existed in a later deploy but not in the
   backup are removed, not left behind).
3. Restarts the container the same way a normal deploy does.

A revert shows up in **History** as its own entry (tagged "↩ revert", linking
back to the deployment it restored) rather than mutating the original row, so
the audit trail stays intact. Only successful deployments can be reverted to
— a failed one may not have completed its backup step — and only Admins/
Operators can trigger it, with a confirmation dialog spelling out exactly
what will happen first.

## Promotions (sending a build to another environment)

When a build has been deployed and verified on one environment, a developer
can **send it on** to another environment (Dev → QA, QA → UAT, and so on —
this isn't hardcoded to any one pair) without redoing the deploy wizard by
hand on the target server.

1. On a **successful** deployment's detail page, an Admin/Operator picks a
   target environment and clicks **Send**. This creates a **promotion
   request** — visible on the new **Promotions** page to anyone with access
   to that target environment, with a pending-count badge in the sidebar.
   Sending is opt-in per deployment; nothing is promoted automatically.
2. On the **Promotions** page, an Admin/Operator for the target environment
   picks the target server, deployment path, and application (auto-suggested
   when a same-named app exists, but always editable — app names aren't
   assumed to line up across every environment) and clicks **Deploy**.
3. This re-runs the **same deploy pipeline** used everywhere else in the
   portal: git checkout of the exact branch that was deployed on the source
   environment, on the target server's own clone of the repo, then the usual
   rsync-and-restart — including the same excludes (`appsettings*.json`,
   `*securesettings*.json`, `config.json`), so the target environment's own
   config and secrets are left untouched. The result is a normal new
   **History** entry (tagged "→ promoted", linking back to the source
   deployment), not a special-cased one.
4. A pending request can also be **cancelled**. Sending a newer deployment of
   the same app to the same target environment automatically supersedes
   (cancels) any older pending request for it, so the Promotions list never
   holds two stale asks for the same thing.

The existing manual **Deploy** wizard is unaffected — Promotions is a purely
additive shortcut for the common "same build, next environment" case.

## Config files

`appsettings*.json`, `*securesettings*.json` and `config.json` are the exact
files the deploy pipeline's rsync always **excludes** (see above) — they live
only on the target server and survive every deploy untouched, which is
exactly why they used to require SSHing in by hand to edit. The **Config
Files** page (Admin/Operator only) lets you edit them from the portal
instead:

1. Pick an environment → server → deployment base path → application, the
   same picker used by Deploy and Promotions.
2. The portal lists every file under that app's `publish` folder matching
   those same three patterns — nothing else is ever listed or editable, and
   the match is recomputed fresh on every single read/write/restore call, so
   a request can never reach outside that exact set.
3. Opening a file shows its raw content in an editor; `.json` files are
   validated (client-side live, and again server-side before saving) so a
   malformed save is rejected with a parse error instead of breaking the
   app.
4. **Save** always backs up the current version first — into
   `Backups/ConfigBackup_<timestamp>/<file>` on the same server, next to
   deployment backups but named distinctly — before writing the new content
   atomically (write to a temp file, then rename). If the backup step fails,
   nothing is overwritten. After a successful save you're asked whether to
   restart the app's container now (`docker compose restart`) so the change
   takes effect, or leave it for later.
5. Every file has a **Version history** — every backup ever taken of it,
   newest first — with a one-click **Restore this version** button. A
   restore backs up whatever's currently live before replacing it, so
   restoring is itself undoable the same way. Right below it, an **Edit
   history** section lists every recorded save/restore of that exact
   file — who, when, and a "View detail" toggle for the full line-by-line
   diff — so anyone with access to Config Files can see a file's history
   without needing the Admin-only Audit Logs page.

Nothing here is stored in the database — the server stays the single source
of truth for these files, exactly like the rest of the portal; the portal is
only ever a controlled window into it. Backups are never automatically
pruned. Only files that already exist can be edited (not created) in this
first version.

## Stopped-container alert

A bell icon in the top bar, visible on every page, polls every 20 seconds
for any container that isn't running across every environment/server you
have access to — a server the portal can't currently reach over SSH is
skipped rather than shown as an error, since this is a best-effort status
check, not a deploy-critical one. A badge shows the total count; opening it
lists which server and which container, grouped by server, with a link to
**Environments** to act on it.

## Architecture

- **backend/** — Node.js + Express + TypeScript, Prisma/PostgreSQL for
  storage, `ssh2` for remote command execution. JWT (httpOnly cookie) auth,
  bcrypt password hashing, AES-256-GCM encryption for stored SSH
  passwords/private keys and git credentials.
- **frontend/** — React + Vite + TypeScript. No UI framework — a small
  custom design system. Login, dashboard, servers/repositories/users admin
  pages, the deployment wizard, and history/audit log views.
- **docker-compose.yml** — brings up Postgres, the API, and an
  nginx-served frontend (which proxies `/api` to the backend). Database
  migrations and the initial admin user are applied automatically on
  backend startup.

## Roles

- **Admin** — manage servers, repositories, and users; can also deploy; sees
  every environment; the only role that can see **Monitoring**, **Git
  Credentials**, and **Audit Logs**.
- **Operator** — can trigger deployments and test server connections, but
  cannot manage servers/repositories/users.
- **Viewer** — read-only: dashboard, server/repository lists, deployment
  history.

Operators and Viewers only see what's inside the environment(s) they're
assigned under **Users** — their dashboard, server list, the Environments
page, deploy wizard, and deployment history are all scoped to it, and the
API enforces the same scoping server-side (not just hidden in the UI). A
user with no environment assigned sees nothing until an Admin grants
access. Repositories (git credentials) aren't environment-scoped — every
authenticated user who can deploy sees the full repository list, since a
repo isn't tied to one environment.

## Git credentials

Adding a repository normally asks for a git username/token for its host.
Under **Git Credentials** (Admin-only) you can instead save one
username/token per git host once — the next time a repository is added on
that host, leave the username/token fields blank and the portal resolves
them from the saved credential automatically. The repository still gets
its own encrypted copy of the credential at creation time, so deleting or
rotating a saved credential later never breaks a repository that already
used it; it only affects repositories added afterwards.

## Audit logs

Every mutating action in the portal — creating/editing/deleting servers,
repositories, users, links, and git credentials; every deployment,
revert, and promotion; container start/stop/restart/recreate; and every
config file save/restore — is recorded to an **Audit Logs** page
(Admin-only), showing who did it (name + email, snapshotted at the time
of the action so the record survives that user later being deleted),
when, and a human-readable summary of what happened. The list is
searchable across the user, action type, and summary.

Edits carry a **"View detail"** button with the actual before/after:
editing a server, user, repository, git credential, or link shows a
field-by-field table of what changed (old value → new value; passwords
and secrets are only ever flagged as changed, never shown), and saving or
restoring a config file shows a full line-by-line diff of the file
content (red = removed, green = added) — directly answering "who edited
what, where, when, and exactly what changed." Config file edits also show
this same history — who saved/restored it and what changed — directly
under **Version history** on the Config Files page itself, scoped to
just that one file, so anyone who can edit config files can see its
history without needing the Admin-only Audit Logs page.

Audit log rows live in Postgres (the `AuditLog` table, same database as
everything else) and are kept forever — there's no automatic expiry or
pruning. The Audit Logs page only ever shows the most recent 300, but
every row stays in the database indefinitely unless someone deletes it
directly. See "Persistent storage" below for where that data physically
lives on disk.

## Persistent storage

Everything the portal knows — servers, repositories, users, deployment
history, promotions, git credentials, and audit logs — lives in one
Postgres database, and that database's data directory is bind-mounted to
`./data/postgres` on the host running `docker compose` (see
`docker-compose.yml`), not a named Docker volume. That distinction
matters: `docker compose down -v` removes named volumes but leaves a
bind-mounted host directory alone, so tearing down and rebuilding the
portal's own containers (or any accidental `-v`) never wipes its data —
only an explicit `rm -rf ./data/postgres` would. There's no separate
storage path or retention window for audit logs specifically; they're
just rows in that same database, kept indefinitely.

## Running it

1. Copy `.env.example` to `.env` and fill in real values — in particular
   `JWT_SECRET`, `ENCRYPTION_KEY`, and the seeded `ADMIN_EMAIL` /
   `ADMIN_PASSWORD`.
2. `docker compose up -d --build` — Postgres data lives in `./data/postgres`
   on the host (a bind mount, not a named Docker volume), so it survives a
   `docker compose down -v` — only the app's own container/volumes get torn
   down, never the portal's own database (servers, deployment history,
   audit logs, everything).
3. Open `http://localhost:8080`, log in with the seeded admin account.
4. Add your environments under **Servers** (host, SSH user, auth method,
   `gitBaseDir`, `auditLogPath`, and the deployment base paths — e.g. what
   used to be `BASE_APP_DIR` / `BASE_APP_DIR8` in the script).
5. Add your git repository under **Repositories**.
6. Go to **Deploy** and walk through the wizard.

### Local development (without Docker)

```bash
# Backend
cd backend
npm install
npx prisma migrate deploy   # requires DATABASE_URL pointing at a running Postgres
npm run seed                # seeds the admin user from ADMIN_EMAIL/ADMIN_PASSWORD
npm run dev                 # http://localhost:4000

# Frontend
cd frontend
npm install
npm run dev                 # http://localhost:5173, proxies /api to :4000
```

## Security notes

- SSH passwords/private keys and git credentials are encrypted at rest
  (AES-256-GCM) using `ENCRYPTION_KEY`; rotate it by re-saving each
  server/repository (secrets are re-encrypted on every save).
- Every path the wizard browses or deploys to is checked against the
  server's configured `gitBaseDir` and `basePaths` — the portal refuses to
  browse or deploy outside those directories.
- Only Admins and Operators can trigger deployments; the confirmation step
  in the wizard shows the exact source/target paths before anything runs.
- Set `COOKIE_SECURE=true` once the portal is served over HTTPS.
- Deleting a server or user that still has deployment/promotion history
  attached is blocked with a clear error instead of failing with a raw
  database foreign-key error — deployment and audit history are never
  silently destroyed as a side effect of an unrelated delete. For a
  server added by mistake that already picked up real history, an Admin
  can **force-delete** it (a second, explicit confirmation) — this
  permanently deletes that server's deployment/promotion records along
  with it. Its audit log entries are never affected either way: they
  don't have a foreign key to Server at all, so they survive regardless
  of whether the server delete was blocked, plain, or forced.
