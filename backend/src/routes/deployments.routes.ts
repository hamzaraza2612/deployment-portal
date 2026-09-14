import path from "path";
import { Router } from "express";
import type { DeploymentStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler, HttpError } from "../middleware/errorHandler";
import { requireAuth, requireRole } from "../middleware/auth";
import type { AuthTokenPayload } from "../middleware/auth";
import { canAccessEnvironment, serverEnvironmentFilter } from "../lib/access";
import {
  browseSchema,
  checkoutBranchSchema,
  createDeploymentSchema,
  fetchBranchesSchema,
} from "../validators/schemas";
import {
  assertPathAllowed,
  browseDirectory,
  checkoutBranch,
  cloneOrPullAndListBranches,
  runDeployment,
  targetGitDir,
} from "../services/deploy.service";

export const deploymentsRouter = Router();

deploymentsRouter.use(requireAuth);

const CAN_DEPLOY = ["ADMIN", "OPERATOR"] as const;

async function loadServerAndRepo(user: AuthTokenPayload, serverId: string, repositoryId: string) {
  const [server, repository] = await Promise.all([
    prisma.server.findUniqueOrThrow({ where: { id: serverId } }),
    prisma.repository.findUniqueOrThrow({ where: { id: repositoryId } }),
  ]);
  if (!canAccessEnvironment(user, server.environment)) {
    throw new HttpError(404, "Server not found");
  }
  return { server, repository };
}

async function loadAccessibleServer(user: AuthTokenPayload, serverId: string) {
  const server = await prisma.server.findUniqueOrThrow({ where: { id: serverId } });
  if (!canAccessEnvironment(user, server.environment)) {
    throw new HttpError(404, "Server not found");
  }
  return server;
}

deploymentsRouter.post(
  "/branches",
  requireRole(...CAN_DEPLOY),
  asyncHandler(async (req, res) => {
    const body = fetchBranchesSchema.parse(req.body);
    const { server, repository } = await loadServerAndRepo(req.user!, body.serverId, body.repositoryId);
    const { branches, gitDir } = await cloneOrPullAndListBranches(server, repository);
    res.json({ branches, gitDir });
  })
);

deploymentsRouter.post(
  "/checkout",
  requireRole(...CAN_DEPLOY),
  asyncHandler(async (req, res) => {
    const body = checkoutBranchSchema.parse(req.body);
    const { server, repository } = await loadServerAndRepo(req.user!, body.serverId, body.repositoryId);
    await checkoutBranch(server, repository, body.branch);
    res.json({ ok: true, gitDir: targetGitDir(server, repository) });
  })
);

deploymentsRouter.get(
  "/browse",
  requireRole(...CAN_DEPLOY),
  asyncHandler(async (req, res) => {
    const body = browseSchema.parse({ serverId: req.query.serverId, path: req.query.path });
    const server = await loadAccessibleServer(req.user!, body.serverId);
    const entries = await browseDirectory(server, body.path);
    res.json({ path: body.path, entries });
  })
);

deploymentsRouter.get(
  "/roots",
  requireRole(...CAN_DEPLOY),
  asyncHandler(async (req, res) => {
    const serverId = String(req.query.serverId ?? "");
    const repositoryId = String(req.query.repositoryId ?? "");
    if (!serverId) throw new HttpError(400, "serverId is required");
    const server = await loadAccessibleServer(req.user!, serverId);
    let gitDir: string | undefined;
    if (repositoryId) {
      const repository = await prisma.repository.findUniqueOrThrow({ where: { id: repositoryId } });
      gitDir = targetGitDir(server, repository);
    }
    res.json({ gitDir, basePaths: server.basePaths });
  })
);

deploymentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { status, serverId } = req.query;
    const validStatuses: DeploymentStatus[] = ["PENDING", "RUNNING", "SUCCESS", "FAILED"];
    const statusFilter =
      typeof status === "string" && validStatuses.includes(status as DeploymentStatus)
        ? (status as DeploymentStatus)
        : undefined;
    const deployments = await prisma.deployment.findMany({
      where: {
        status: statusFilter,
        serverId: typeof serverId === "string" ? serverId : undefined,
        server: serverEnvironmentFilter(req.user!),
      },
      orderBy: { startedAt: "desc" },
      take: 100,
      select: {
        id: true,
        branch: true,
        sourcePath: true,
        basePath: true,
        appName: true,
        appPath: true,
        backupName: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        server: { select: { id: true, name: true } },
        repository: { select: { id: true, name: true } },
        triggeredBy: { select: { id: true, name: true, email: true } },
      },
    });
    res.json(deployments);
  })
);

deploymentsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const deployment = await prisma.deployment.findUniqueOrThrow({
      where: { id: req.params.id },
      include: {
        server: { select: { id: true, name: true, host: true, environment: true } },
        repository: { select: { id: true, name: true, url: true } },
        triggeredBy: { select: { id: true, name: true, email: true } },
      },
    });
    if (!canAccessEnvironment(req.user!, deployment.server.environment)) {
      throw new HttpError(404, "Deployment not found");
    }
    res.json(deployment);
  })
);

deploymentsRouter.post(
  "/",
  requireRole(...CAN_DEPLOY),
  asyncHandler(async (req, res) => {
    const body = createDeploymentSchema.parse(req.body);
    const server = await loadAccessibleServer(req.user!, body.serverId);
    const repository = await prisma.repository.findUniqueOrThrow({ where: { id: body.repositoryId } });

    assertPathAllowed(server, body.sourcePath);
    if (!server.basePaths.includes(body.basePath)) {
      throw new HttpError(400, "basePath is not one of this server's configured deployment paths");
    }

    const appPath = path.posix.join(body.basePath, body.appName);
    const publishDir = path.posix.join(appPath, "publish");

    const deployment = await prisma.deployment.create({
      data: {
        serverId: server.id,
        repositoryId: repository.id,
        branch: body.branch,
        sourcePath: body.sourcePath,
        basePath: body.basePath,
        appName: body.appName,
        appPath,
        publishDir,
        backupName: body.backupName,
        status: "PENDING",
        triggeredById: req.user!.userId,
      },
    });

    // Fire and forget: the client polls GET /:id for live status/log.
    void runDeployment({ deploymentId: deployment.id });

    res.status(201).json(deployment);
  })
);
