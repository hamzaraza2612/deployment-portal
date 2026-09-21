import path from "path";
import { Router } from "express";
import type { Server } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { recordAudit } from "../lib/audit";
import { textDiffDetails } from "../lib/diff";
import { asyncHandler, HttpError } from "../middleware/errorHandler";
import { requireAuth, requireRole } from "../middleware/auth";
import type { AuthTokenPayload } from "../middleware/auth";
import { canAccessEnvironment } from "../lib/access";
import {
  configFileContentSchema,
  configFilesListSchema,
  restartComposeSchema,
  restoreConfigFileSchema,
  saveConfigFileSchema,
} from "../validators/schemas";
import {
  listConfigFileBackups,
  listConfigFiles,
  readConfigFile,
  restartComposeProject,
  restoreConfigFileBackup,
  writeConfigFile,
} from "../services/config.service";

export const configFilesRouter = Router();
configFilesRouter.use(requireAuth);
configFilesRouter.use(requireRole("ADMIN", "OPERATOR"));

async function loadAccessibleServer(user: AuthTokenPayload, serverId: string): Promise<Server> {
  const server = await prisma.server.findUniqueOrThrow({ where: { id: serverId } });
  if (!canAccessEnvironment(user, server.environment)) {
    throw new HttpError(404, "Server not found");
  }
  return server;
}

function resolveAppPath(server: Server, basePath: string, appName: string): string {
  if (!server.basePaths.includes(basePath)) {
    throw new HttpError(400, "basePath is not one of this server's configured deployment paths");
  }
  return path.posix.join(basePath, appName);
}

configFilesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = configFilesListSchema.parse({
      serverId: req.query.serverId,
      basePath: req.query.basePath,
      appName: req.query.appName,
    });
    const server = await loadAccessibleServer(req.user!, query.serverId);
    const appPath = resolveAppPath(server, query.basePath, query.appName);
    const files = await listConfigFiles(server, appPath);
    res.json(files);
  })
);

configFilesRouter.get(
  "/content",
  asyncHandler(async (req, res) => {
    const query = configFileContentSchema.parse({
      serverId: req.query.serverId,
      basePath: req.query.basePath,
      appName: req.query.appName,
      relativePath: req.query.relativePath,
    });
    const server = await loadAccessibleServer(req.user!, query.serverId);
    const appPath = resolveAppPath(server, query.basePath, query.appName);
    const content = await readConfigFile(server, appPath, query.relativePath);
    res.json({ content });
  })
);

configFilesRouter.put(
  "/content",
  asyncHandler(async (req, res) => {
    const body = saveConfigFileSchema.parse(req.body);
    const server = await loadAccessibleServer(req.user!, body.serverId);
    const appPath = resolveAppPath(server, body.basePath, body.appName);
    const result = await writeConfigFile(server, appPath, body.relativePath, body.content);
    recordAudit(
      req.user!,
      "config.save",
      `Saved ${body.relativePath} for ${body.appName} on ${server.name} (backup: ${result.backupName})`,
      {
        ...textDiffDetails(result.before, body.content),
        context: { serverId: server.id, appName: body.appName, relativePath: body.relativePath },
      }
    );
    res.json({ backupName: result.backupName });
  })
);

configFilesRouter.get(
  "/backups",
  asyncHandler(async (req, res) => {
    const query = configFileContentSchema.parse({
      serverId: req.query.serverId,
      basePath: req.query.basePath,
      appName: req.query.appName,
      relativePath: req.query.relativePath,
    });
    const server = await loadAccessibleServer(req.user!, query.serverId);
    const appPath = resolveAppPath(server, query.basePath, query.appName);
    const backups = await listConfigFileBackups(server, appPath, query.relativePath);
    res.json(backups);
  })
);

configFilesRouter.post(
  "/restore",
  asyncHandler(async (req, res) => {
    const body = restoreConfigFileSchema.parse(req.body);
    const server = await loadAccessibleServer(req.user!, body.serverId);
    const appPath = resolveAppPath(server, body.basePath, body.appName);
    const { before, after } = await restoreConfigFileBackup(server, appPath, body.relativePath, body.backupName);
    recordAudit(
      req.user!,
      "config.restore",
      `Restored ${body.relativePath} for ${body.appName} on ${server.name} from ${body.backupName}`,
      {
        ...textDiffDetails(before, after),
        context: { serverId: server.id, appName: body.appName, relativePath: body.relativePath },
      }
    );
    res.json({ ok: true });
  })
);

configFilesRouter.get(
  "/history",
  asyncHandler(async (req, res) => {
    const query = configFileContentSchema.parse({
      serverId: req.query.serverId,
      basePath: req.query.basePath,
      appName: req.query.appName,
      relativePath: req.query.relativePath,
    });
    const server = await loadAccessibleServer(req.user!, query.serverId);
    resolveAppPath(server, query.basePath, query.appName);
    const logs = await prisma.auditLog.findMany({
      where: {
        action: { in: ["config.save", "config.restore"] },
        AND: [
          { details: { path: ["context", "serverId"], equals: server.id } },
          { details: { path: ["context", "appName"], equals: query.appName } },
          { details: { path: ["context", "relativePath"], equals: query.relativePath } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json(logs);
  })
);

configFilesRouter.post(
  "/restart",
  asyncHandler(async (req, res) => {
    const body = restartComposeSchema.parse(req.body);
    const server = await loadAccessibleServer(req.user!, body.serverId);
    const appPath = resolveAppPath(server, body.basePath, body.appName);
    await restartComposeProject(server, appPath);
    res.json({ ok: true });
  })
);
