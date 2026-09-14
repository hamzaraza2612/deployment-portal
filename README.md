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

**Live metrics and logs** are built into the same table: CPU%, memory
usage/limit, and network I/O per container (`docker stats --no-stream`,
refreshed every 3 seconds while the page is open — a lightweight
current-state view, not historical graphs), and a **Logs** button per
container opens its `docker logs --tail N --timestamps` output in a modal
that also auto-refreshes every 3 seconds, with a selectable tail length.
All of this reads over the same on-demand SSH connection used everywhere
else in the portal — no separate metrics/logging stack (Prometheus,
Grafana, etc.) is required.

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
