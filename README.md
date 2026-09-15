# Deployment Portal

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
resource usage lives on two separate pages instead of cluttering this
one — see **Docker Stats** and **Server Monitoring** below.

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

## Docker Stats

A dedicated, environment-grouped page showing **every container's live
CPU%, memory usage/limit, and network/block I/O** (`docker stats
--no-stream`, refreshed every 3 seconds) — databases (Redis, Postgres,
MSSQL, Mongo, …), caches, and application containers alike, whatever is
running under Docker on that server. Open to every role with access to
that environment; this page is read-only (no start/stop/recreate — those
stay on **Environments**). Alerting on these values (thresholds, notify
on a container going down) is planned but not built yet.

## Server Monitoring

Host-level **CPU, RAM, and disk usage** per server (`vmstat`/`free`/`df`
over SSH, refreshed every 10 seconds), grouped by environment — **Admin
only**, enforced both by hiding the nav item and by the API route itself
requiring the Admin role, not just a hidden button. This used to live
inline on the Environments page; it's now separate so non-admin users
(devs, QA) don't see host resource details they don't need, while still
seeing container state on Environments and container-level metrics on
Docker Stats. Alerting here is planned for later too.

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
  every environment.
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

## Running it

1. Copy `.env.example` to `.env` and fill in real values — in particular
   `JWT_SECRET`, `ENCRYPTION_KEY`, and the seeded `ADMIN_EMAIL` /
   `ADMIN_PASSWORD`.
2. `docker compose up -d --build`
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
