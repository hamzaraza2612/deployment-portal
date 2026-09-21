import path from "path";
import type { Server } from "@prisma/client";
import { HttpError } from "../middleware/errorHandler";
import { execScript, shQuote } from "../lib/ssh";
import {
  assertPathAllowed,
  execCommandOnServer,
  formatBackupTimestamp,
  toConnectionInfo,
} from "./deploy.service";

/**
 * Same set of filenames the deploy pipeline's rsync excludes (deploy.service.ts) — files that
 * live only on the target server and survive every deploy untouched. This is deliberately the
 * exact same set: whatever a deploy leaves alone is what's safe to hand-edit here, no more.
 * Config files can live in any subfolder under publish (not just the root), so this searches
 * the whole tree — but never inside anything that looks like a backup folder someone made
 * inside publish (matched case-insensitively by name: "Backup", "Backups", "Backup 18-8-2025",
 * any variant), since those aren't real app config, they're leftover copies.
 */
const CONFIG_FILE_MATCH = `\\( -name 'appsettings*.json' -o -name '*securesettings*.json' -o -name 'config.json' \\) -not -ipath '*/backup*/*'`;

export interface ConfigFileEntry {
  relativePath: string;
  size: number;
  modifiedAt: string;
}

export interface ConfigFileBackupEntry {
  backupName: string;
  modifiedAt: string;
}

function publishDirFor(appPath: string): string {
  return path.posix.join(appPath, "publish");
}

export async function listConfigFiles(server: Server, appPath: string): Promise<ConfigFileEntry[]> {
  const publishDir = publishDirFor(appPath);
  assertPathAllowed(server, publishDir);
  const info = toConnectionInfo(server);
  const command = `find ${shQuote(publishDir)} -type f ${CONFIG_FILE_MATCH} -printf '%P\\t%s\\t%T@\\n' 2>/dev/null | sort`;
  const result = await execCommandOnServer(info, command);
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [relativePath, size, mtime] = line.split("\t");
      return {
        relativePath,
        size: Number(size) || 0,
        modifiedAt: new Date(Number(mtime) * 1000).toISOString(),
      };
    });
}

/**
 * Re-derives the current matched-file list and requires relativePath to be in it — the only
 * check any read/write/backup/restore call trusts. Never trust a path handed up by the client.
 */
async function assertConfigFileExists(server: Server, appPath: string, relativePath: string): Promise<string> {
  const normalizedRel = path.posix.normalize(relativePath);
  if (normalizedRel.startsWith("..") || path.posix.isAbsolute(normalizedRel)) {
    throw new HttpError(400, "Invalid file path");
  }
  const matches = await listConfigFiles(server, appPath);
  if (!matches.some((m) => m.relativePath === normalizedRel)) {
    throw new HttpError(404, "That file isn't one of this app's editable config files");
  }
  return path.posix.join(publishDirFor(appPath), normalizedRel);
}

export async function readConfigFile(server: Server, appPath: string, relativePath: string): Promise<string> {
  const filePath = await assertConfigFileExists(server, appPath, relativePath);
  const info = toConnectionInfo(server);
  const result = await execCommandOnServer(info, `base64 ${shQuote(filePath)}`);
  if (result.code !== 0) {
    throw new HttpError(502, `Unable to read file: ${result.stderr || result.stdout}`);
  }
  return Buffer.from(result.stdout.replace(/\s+/g, ""), "base64").toString("utf8");
}

export async function writeConfigFile(
  server: Server,
  appPath: string,
  relativePath: string,
  content: string
): Promise<{ backupName: string; before: string }> {
  const filePath = await assertConfigFileExists(server, appPath, relativePath);
  const normalizedRel = path.posix.normalize(relativePath);

  // Strict JSON.parse isn't authoritative here — some of these files parse fine for whatever
  // reads them on the server (lenient parser, BOM, trailing comma, etc.) despite failing a
  // strict check, so this is surfaced to the editor as a warning only (see the /content route),
  // never blocks the write itself. The file is saved exactly as given, byte for byte.

  const info = toConnectionInfo(server);
  const before = await readConfigFile(server, appPath, relativePath);

  const backupName = `ConfigBackup_${formatBackupTimestamp(new Date())}`;
  const backupFile = path.posix.join(appPath, "Backups", backupName, normalizedRel);
  // base64 sidesteps every shell-quoting/escaping concern for arbitrary file content.
  const encoded = Buffer.from(content, "utf8").toString("base64");

  const script = `
set -e
TARGET=${shQuote(filePath)}
if [ -f "$TARGET" ]; then
  mkdir -p ${shQuote(path.posix.dirname(backupFile))}
  cp "$TARGET" ${shQuote(backupFile)}
fi
printf '%s' ${shQuote(encoded)} | base64 -d > "$TARGET.tmp"
mv "$TARGET.tmp" "$TARGET"
`.trim();

  const result = await execScript(info, script);
  if (result.code !== 0) {
    throw new HttpError(502, `Failed to save file: ${result.stderr || result.stdout}`);
  }
  return { backupName, before };
}

export async function listConfigFileBackups(
  server: Server,
  appPath: string,
  relativePath: string
): Promise<ConfigFileBackupEntry[]> {
  await assertConfigFileExists(server, appPath, relativePath);
  const normalizedRel = path.posix.normalize(relativePath);
  const backupsRoot = path.posix.join(appPath, "Backups");
  const info = toConnectionInfo(server);
  // Listed in full and filtered in Node rather than building a shell glob out of relativePath.
  const command = `find ${shQuote(backupsRoot)} -type f -printf '%P\\t%T@\\n' 2>/dev/null`;
  const result = await execCommandOnServer(info, command);
  const suffix = "/" + normalizedRel;

  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [relPath, mtime] = line.split("\t");
      return { relPath, modifiedAt: new Date(Number(mtime) * 1000).toISOString() };
    })
    .filter(({ relPath }) => relPath.startsWith("ConfigBackup_") && relPath.endsWith(suffix))
    .map(({ relPath, modifiedAt }) => ({
      backupName: relPath.slice(0, relPath.length - suffix.length),
      modifiedAt,
    }))
    .sort((a, b) => b.backupName.localeCompare(a.backupName));
}

export async function restoreConfigFileBackup(
  server: Server,
  appPath: string,
  relativePath: string,
  backupName: string
): Promise<{ before: string; after: string }> {
  if (!/^ConfigBackup_[A-Za-z0-9_-]+$/.test(backupName)) {
    throw new HttpError(400, "Invalid backup name");
  }
  const filePath = await assertConfigFileExists(server, appPath, relativePath);
  const normalizedRel = path.posix.normalize(relativePath);
  const backupSource = path.posix.join(appPath, "Backups", backupName, normalizedRel);
  const info = toConnectionInfo(server);

  const checkResult = await execCommandOnServer(info, `test -f ${shQuote(backupSource)} && echo yes || echo no`);
  if (!checkResult.stdout.includes("yes")) {
    throw new HttpError(404, "That backup version was not found");
  }

  const before = await readConfigFile(server, appPath, relativePath);
  const afterResult = await execCommandOnServer(info, `base64 ${shQuote(backupSource)}`);
  if (afterResult.code !== 0) {
    throw new HttpError(502, `Unable to read backup file: ${afterResult.stderr || afterResult.stdout}`);
  }
  const after = Buffer.from(afterResult.stdout.replace(/\s+/g, ""), "base64").toString("utf8");

  // Restoring is itself reversible: whatever is live right now gets backed up before being replaced.
  const safetyBackupName = `ConfigBackup_${formatBackupTimestamp(new Date())}`;
  const safetyBackupFile = path.posix.join(appPath, "Backups", safetyBackupName, normalizedRel);

  const script = `
set -e
TARGET=${shQuote(filePath)}
if [ -f "$TARGET" ]; then
  mkdir -p ${shQuote(path.posix.dirname(safetyBackupFile))}
  cp "$TARGET" ${shQuote(safetyBackupFile)}
fi
cp ${shQuote(backupSource)} "$TARGET"
`.trim();

  const result = await execScript(info, script);
  if (result.code !== 0) {
    throw new HttpError(502, `Failed to restore file: ${result.stderr || result.stdout}`);
  }
  return { before, after };
}

export async function restartComposeProject(server: Server, appPath: string): Promise<void> {
  assertPathAllowed(server, appPath);
  const info = toConnectionInfo(server);
  const script = `
set -e
cd ${shQuote(appPath)}
docker compose restart
`.trim();
  const result = await execScript(info, script);
  if (result.code !== 0) {
    throw new HttpError(502, `Failed to restart container: ${result.stderr || result.stdout}`);
  }
}
