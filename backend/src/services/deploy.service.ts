import path from "path";
import { prisma } from "../lib/prisma";
import { decrypt } from "../lib/crypto";
import { execScript, shQuote, withSSHConnection, execCommand } from "../lib/ssh";
import type { ServerConnectionInfo } from "../lib/ssh";
import { HttpError } from "../middleware/errorHandler";
import type { Repository, Server } from "@prisma/client";

export function toConnectionInfo(server: Server): ServerConnectionInfo {
  return {
    host: server.host,
    port: server.port,
    sshUser: server.sshUser,
    authType: server.authType,
    secret: server.secret,
    label: server.name,
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** e.g. "14-Sep-2026_14-30-05" — human-readable, still unique to the second for same-day repeat deploys. */
export function formatBackupTimestamp(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = MONTHS[date.getMonth()];
  const year = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${day}-${month}-${year}_${hh}-${mm}-${ss}`;
}

export function repoNameFromUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  const base = trimmed.substring(trimmed.lastIndexOf("/") + 1);
  return base.endsWith(".git") ? base.slice(0, -4) : base;
}

function buildAuthGitUrl(repository: Pick<Repository, "url" | "username" | "secret">): string {
  const secret = decrypt(repository.secret);
  const stripped = repository.url.replace(/^https:\/\//, "");
  return `https://${encodeURIComponent(repository.username)}:${encodeURIComponent(secret)}@${stripped}`;
}

export function targetGitDir(server: Server, repository: Repository): string {
  return path.posix.join(server.gitBaseDir, repoNameFromUrl(repository.url));
}

/**
 * Promotion (Strategy A: re-run the same recipe on the target server rather than
 * copying built files) needs the equivalent of a deployment's sourcePath on a
 * different server — same relative location inside that repo's checkout, just
 * rooted under the target server's own gitBaseDir instead of the source's.
 */
export function computeTargetSourcePath(
  sourceServer: Server,
  targetServer: Server,
  repository: Repository,
  sourceSourcePath: string
): string {
  const sourceGitDir = path.posix.normalize(targetGitDir(sourceServer, repository));
  const normalizedSource = path.posix.normalize(sourceSourcePath);
  const isUnderGitDir =
    normalizedSource === sourceGitDir || normalizedSource.startsWith(sourceGitDir.replace(/\/+$/, "") + "/");
  if (!isUnderGitDir) {
    throw new HttpError(
      400,
      "This deployment's source wasn't from a git checkout, so it can't be promoted automatically."
    );
  }
  const relative = normalizedSource.slice(sourceGitDir.length);
  return path.posix.join(targetGitDir(targetServer, repository), relative);
}

/** Every path browsed or used for a deployment must live under the server's git dir or one of its declared base paths. */
export function assertPathAllowed(server: Server, targetPath: string) {
  const normalized = path.posix.normalize(targetPath);
  const roots = [server.gitBaseDir, ...server.basePaths];
  const allowed = roots.some(
    (root) => normalized === root || normalized.startsWith(root.replace(/\/+$/, "") + "/")
  );
  if (!allowed) {
    throw new HttpError(400, `Path ${targetPath} is outside the server's allowed directories`);
  }
}

export async function cloneOrPullAndListBranches(
  server: Server,
  repository: Repository
): Promise<{ branches: string[]; gitDir: string }> {
  const gitDir = targetGitDir(server, repository);
  const authUrl = buildAuthGitUrl(repository);
  const info = toConnectionInfo(server);

  const script = `
set -e
mkdir -p ${shQuote(server.gitBaseDir)}
git config --global --add safe.directory ${shQuote(gitDir)} 2>/dev/null || true
if [ -d ${shQuote(gitDir)}/.git ]; then
  cd ${shQuote(gitDir)}
  git fetch origin
else
  git clone ${shQuote(authUrl)} ${shQuote(gitDir)}
  cd ${shQuote(gitDir)}
fi
git branch -r | grep -v HEAD | sed 's/origin\\///' | sed 's/^ *//g'
`.trim();

  const result = await execScript(info, script);
  if (result.code !== 0) {
    throw new HttpError(502, `Git clone/fetch failed: ${result.stderr || result.stdout}`);
  }
  const branches = result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return { branches, gitDir };
}

export async function checkoutBranch(
  server: Server,
  repository: Repository,
  branch: string
): Promise<void> {
  const gitDir = targetGitDir(server, repository);
  const info = toConnectionInfo(server);
  const script = `
set -e
cd ${shQuote(gitDir)}
git checkout ${shQuote(branch)}
git pull origin ${shQuote(branch)}
`.trim();
  const result = await execScript(info, script);
  if (result.code !== 0) {
    throw new HttpError(502, `Branch checkout failed: ${result.stderr || result.stdout}`);
  }
}

export interface BrowseEntry {
  name: string;
}

export async function browseDirectory(server: Server, dirPath: string): Promise<BrowseEntry[]> {
  assertPathAllowed(server, dirPath);
  const info = toConnectionInfo(server);
  const result = await execCommandOnServer(
    info,
    `find ${shQuote(dirPath)} -mindepth 1 -maxdepth 1 -type d -printf "%f\\n" 2>/dev/null | sort`
  );
  if (result.code !== 0 && result.stderr) {
    throw new HttpError(502, `Unable to list directory: ${result.stderr}`);
  }
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((name) => ({ name }));
}

export async function execCommandOnServer(info: ServerConnectionInfo, command: string) {
  return withSSHConnection(info, (conn) => execCommand(conn, command));
}

interface RunDeploymentArgs {
  deploymentId: string;
}

/** Runs the actual multi-step deployment on the remote server, mirroring the original bash script's steps 5-9. */
export async function runDeployment({ deploymentId }: RunDeploymentArgs): Promise<void> {
  const deployment = await prisma.deployment.findUniqueOrThrow({
    where: { id: deploymentId },
    include: { server: true, repository: true },
  });

  const { server, repository } = deployment;
  const info = toConnectionInfo(server);

  await prisma.deployment.update({
    where: { id: deploymentId },
    data: { status: "RUNNING" },
  });

  let fullLog = "";
  let lastFlush = Date.now();

  const appendLog = async (text: string) => {
    fullLog += text;
    if (Date.now() - lastFlush > 400) {
      lastFlush = Date.now();
      const toWrite = fullLog;
      await prisma.deployment
        .update({ where: { id: deploymentId }, data: { log: toWrite } })
        .catch(() => undefined);
    }
  };

  const backupName =
    deployment.backupName && deployment.backupName.trim().length > 0
      ? deployment.backupName.trim().replace(/\s+/g, "_")
      : `Backup_${formatBackupTimestamp(new Date())}`;

  const backupDir = path.posix.join(deployment.appPath, "Backups", backupName);

  const script = `
set -e
echo "===> Fixing permissions on ${deployment.appPath}"
chown -R root:techbeyapps ${shQuote(deployment.appPath)} 2>/dev/null || echo "(skipped chown: not permitted or group missing)"
find ${shQuote(deployment.appPath)} -type d -exec chmod 2775 {} \\; 2>/dev/null || true
find ${shQuote(deployment.appPath)} -type f -exec chmod 664 {} \\; 2>/dev/null || true

echo "===> Backing up current build to ${backupDir}"
mkdir -p ${shQuote(backupDir)}
if [ -d ${shQuote(deployment.publishDir)} ]; then
  cp -r ${shQuote(deployment.publishDir)}/* ${shQuote(backupDir)}/ 2>/dev/null || echo "(nothing to back up yet)"
fi

echo "===> Deploying new build from ${deployment.sourcePath}"
mkdir -p ${shQuote(deployment.publishDir)}
rsync -av \\
  --exclude='appsettings*.json' \\
  --exclude='*securesettings*.json' \\
  --exclude='config.json' \\
  ${shQuote(deployment.sourcePath)}/ ${shQuote(deployment.publishDir)}/

echo "===> Restarting container in ${deployment.appPath}"
cd ${shQuote(deployment.appPath)}
docker compose down
docker compose up -d

echo "===> Writing audit log entry"
{
  echo "===== $(date '+%Y-%m-%d %H:%M:%S') ====="
  echo "Git URL           : ${repository.url}"
  echo "Branch            : ${deployment.branch}"
  echo "Source            : ${deployment.sourcePath}"
  echo "Deployment Base   : ${deployment.basePath}"
  echo "App               : ${deployment.appName}"
  echo "App Path          : ${deployment.appPath}"
  echo "Backup            : ${backupDir}"
  echo "======================================="
} >> ${shQuote(server.auditLogPath)} 2>/dev/null || true

echo "===> Deployment completed successfully"
`.trim();

  try {
    const result = await execScript(info, script, (chunk) => {
      void appendLog(chunk);
    });

    await prisma.deployment.update({
      where: { id: deploymentId },
      data: {
        log: fullLog,
        backupName,
        backupPath: backupDir,
        status: result.code === 0 ? "SUCCESS" : "FAILED",
        errorMessage: result.code === 0 ? null : `Remote script exited with code ${result.code}`,
        finishedAt: new Date(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: {
        log: fullLog + `\n[ERROR] ${message}\n`,
        status: "FAILED",
        errorMessage: message,
        finishedAt: new Date(),
      },
    });
  }
}

interface RunRevertArgs {
  deploymentId: string;
}

/**
 * Runs a revert: backs up whatever is currently published (so the revert itself
 * can be undone), then restores the publish folder to exactly match the target
 * deployment's backup — `rsync --delete` makes publish/ a clean mirror of the
 * backup instead of merging the two, per how this was asked to behave — and
 * restarts the container the same way a normal deploy does.
 */
export async function runRevert({ deploymentId }: RunRevertArgs): Promise<void> {
  const deployment = await prisma.deployment.findUniqueOrThrow({
    where: { id: deploymentId },
    include: { server: true, repository: true, revertedFrom: true },
  });

  const { server, repository, revertedFrom: target } = deployment;
  const info = toConnectionInfo(server);

  await prisma.deployment.update({
    where: { id: deploymentId },
    data: { status: "RUNNING" },
  });

  let fullLog = "";
  let lastFlush = Date.now();

  const appendLog = async (text: string) => {
    fullLog += text;
    if (Date.now() - lastFlush > 400) {
      lastFlush = Date.now();
      const toWrite = fullLog;
      await prisma.deployment
        .update({ where: { id: deploymentId }, data: { log: toWrite } })
        .catch(() => undefined);
    }
  };

  if (!target || !target.backupPath) {
    const message = "The deployment being reverted to has no backup to restore from.";
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: { status: "FAILED", errorMessage: message, log: message, finishedAt: new Date() },
    });
    return;
  }

  const backupName =
    deployment.backupName && deployment.backupName.trim().length > 0
      ? deployment.backupName.trim().replace(/\s+/g, "_")
      : `PreRevert_${formatBackupTimestamp(new Date())}`;

  const backupDir = path.posix.join(deployment.appPath, "Backups", backupName);

  const script = `
set -e
echo "===> Backing up current build (before revert) to ${backupDir}"
mkdir -p ${shQuote(backupDir)}
if [ -d ${shQuote(deployment.publishDir)} ]; then
  cp -r ${shQuote(deployment.publishDir)}/* ${shQuote(backupDir)}/ 2>/dev/null || echo "(nothing to back up yet)"
fi

echo "===> Restoring publish folder from backup: ${target.backupPath}"
mkdir -p ${shQuote(deployment.publishDir)}
rsync -av --delete ${shQuote(target.backupPath)}/ ${shQuote(deployment.publishDir)}/

echo "===> Restarting container in ${deployment.appPath}"
cd ${shQuote(deployment.appPath)}
docker compose down
docker compose up -d

echo "===> Writing audit log entry"
{
  echo "===== $(date '+%Y-%m-%d %H:%M:%S') ====="
  echo "Action            : REVERT"
  echo "Reverted to       : deployment ${target.id} (backup: ${target.backupPath})"
  echo "Git URL           : ${repository.url}"
  echo "Branch            : ${deployment.branch}"
  echo "Deployment Base   : ${deployment.basePath}"
  echo "App               : ${deployment.appName}"
  echo "App Path          : ${deployment.appPath}"
  echo "Pre-revert backup : ${backupDir}"
  echo "======================================="
} >> ${shQuote(server.auditLogPath)} 2>/dev/null || true

echo "===> Revert completed successfully"
`.trim();

  try {
    const result = await execScript(info, script, (chunk) => {
      void appendLog(chunk);
    });

    await prisma.deployment.update({
      where: { id: deploymentId },
      data: {
        log: fullLog,
        backupName,
        backupPath: backupDir,
        status: result.code === 0 ? "SUCCESS" : "FAILED",
        errorMessage: result.code === 0 ? null : `Remote script exited with code ${result.code}`,
        finishedAt: new Date(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: {
        log: fullLog + `\n[ERROR] ${message}\n`,
        status: "FAILED",
        errorMessage: message,
        finishedAt: new Date(),
      },
    });
  }
}
