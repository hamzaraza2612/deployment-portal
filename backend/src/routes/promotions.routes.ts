import path from "path";
import { Router } from "express";
import type { PromotionStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler, HttpError } from "../middleware/errorHandler";
import { requireAuth, requireRole } from "../middleware/auth";
import { accessibleEnvironments, canAccessEnvironment } from "../lib/access";
import { deployPromotionSchema } from "../validators/schemas";
import {
  checkoutBranch,
  cloneOrPullAndListBranches,
  computeTargetSourcePath,
  runDeployment,
} from "../services/deploy.service";

export const promotionsRouter = Router();

promotionsRouter.use(requireAuth);

const CAN_DEPLOY = ["ADMIN", "OPERATOR"] as const;

const LIST_SELECT = {
  id: true,
  targetEnvironment: true,
  targetServerId: true,
  targetBasePath: true,
  targetAppName: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  requestedBy: { select: { id: true, name: true, email: true } },
  targetServer: { select: { id: true, name: true } },
  sourceDeployment: {
    select: {
      id: true,
      appName: true,
      branch: true,
      basePath: true,
      startedAt: true,
      server: { select: { id: true, name: true, environment: true } },
    },
  },
  resultDeployment: { select: { id: true, status: true } },
} as const;

promotionsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { status } = req.query;
    const validStatuses: PromotionStatus[] = ["PENDING", "DEPLOYED", "CANCELLED"];
    const statusFilter =
      typeof status === "string" && validStatuses.includes(status as PromotionStatus)
        ? (status as PromotionStatus)
        : undefined;

    const envs = accessibleEnvironments(req.user!);
    const requests = await prisma.promotionRequest.findMany({
      where: {
        status: statusFilter,
        targetEnvironment: envs === "all" ? undefined : { in: envs },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: LIST_SELECT,
    });
    res.json(requests);
  })
);

promotionsRouter.post(
  "/:id/deploy",
  requireRole(...CAN_DEPLOY),
  asyncHandler(async (req, res) => {
    const body = deployPromotionSchema.parse(req.body);
    const request = await prisma.promotionRequest.findUniqueOrThrow({
      where: { id: req.params.id },
      include: {
        sourceDeployment: { include: { server: true, repository: true } },
      },
    });

    if (!canAccessEnvironment(req.user!, request.targetEnvironment)) {
      throw new HttpError(404, "Promotion request not found");
    }
    if (request.status !== "PENDING") {
      throw new HttpError(400, `This request is already ${request.status.toLowerCase()}`);
    }

    const targetServerId = body.targetServerId ?? request.targetServerId;
    const basePath = body.basePath ?? request.targetBasePath;
    const appName = body.appName ?? request.targetAppName;
    if (!targetServerId || !basePath || !appName) {
      throw new HttpError(400, "targetServerId, basePath, and appName are required to deploy this request");
    }

    const targetServer = await prisma.server.findUniqueOrThrow({ where: { id: targetServerId } });
    if (!canAccessEnvironment(req.user!, targetServer.environment)) {
      throw new HttpError(404, "Server not found");
    }
    if (targetServer.environment !== request.targetEnvironment) {
      throw new HttpError(400, "That server isn't in this request's target environment");
    }
    if (!targetServer.basePaths.includes(basePath)) {
      throw new HttpError(400, "basePath is not one of the target server's configured deployment paths");
    }

    const { sourceDeployment } = request;
    const { server: sourceServer, repository } = sourceDeployment;

    // Make sure the branch exists and is up to date on the target server before deploying it there.
    await cloneOrPullAndListBranches(targetServer, repository);
    await checkoutBranch(targetServer, repository, sourceDeployment.branch);

    const sourcePath = computeTargetSourcePath(
      sourceServer,
      targetServer,
      repository,
      sourceDeployment.sourcePath
    );
    const appPath = path.posix.join(basePath, appName);
    const publishDir = path.posix.join(appPath, "publish");

    const deployment = await prisma.deployment.create({
      data: {
        serverId: targetServer.id,
        repositoryId: repository.id,
        branch: sourceDeployment.branch,
        sourcePath,
        basePath,
        appName,
        appPath,
        publishDir,
        status: "PENDING",
        triggeredById: req.user!.userId,
      },
    });

    await prisma.promotionRequest.update({
      where: { id: request.id },
      data: {
        status: "DEPLOYED",
        targetServerId: targetServer.id,
        targetBasePath: basePath,
        targetAppName: appName,
        resultDeploymentId: deployment.id,
      },
    });

    // Fire and forget: the client polls GET /deployments/:id for live status/log, same as a normal deploy.
    void runDeployment({ deploymentId: deployment.id });

    res.status(201).json(deployment);
  })
);

promotionsRouter.post(
  "/:id/cancel",
  requireRole(...CAN_DEPLOY),
  asyncHandler(async (req, res) => {
    const request = await prisma.promotionRequest.findUniqueOrThrow({ where: { id: req.params.id } });
    if (!canAccessEnvironment(req.user!, request.targetEnvironment)) {
      throw new HttpError(404, "Promotion request not found");
    }
    if (request.status !== "PENDING") {
      throw new HttpError(400, `This request is already ${request.status.toLowerCase()}`);
    }
    const updated = await prisma.promotionRequest.update({
      where: { id: request.id },
      data: { status: "CANCELLED" },
    });
    res.json(updated);
  })
);
