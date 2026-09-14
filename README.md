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

- **Admin** — manage servers, repositories, and users; can also deploy.
- **Operator** — can trigger deployments and test server connections, but
  cannot manage servers/repositories/users.
- **Viewer** — read-only: dashboard, server/repository lists, deployment
  history.

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
