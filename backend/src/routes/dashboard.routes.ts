import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { serverEnvironmentFilter } from "../lib/access";

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

dashboardRouter.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const serverFilter = serverEnvironmentFilter(req.user!);
    const [serverCount, repositoryCount, userCount, deploymentCounts, recentDeployments] =
      await Promise.all([
        prisma.server.count({ where: serverFilter }),
        prisma.repository.count(),
        prisma.user.count(),
        prisma.deployment.groupBy({ by: ["status"], _count: true, where: { server: serverFilter } }),
        prisma.deployment.findMany({
          where: { server: serverFilter },
          orderBy: { startedAt: "desc" },
          take: 8,
          select: {
            id: true,
            branch: true,
            appName: true,
            status: true,
            startedAt: true,
            finishedAt: true,
            server: { select: { name: true } },
            triggeredBy: { select: { name: true } },
          },
        }),
      ]);

    const counts: Record<string, number> = { PENDING: 0, RUNNING: 0, SUCCESS: 0, FAILED: 0 };
    for (const row of deploymentCounts) {
      counts[row.status] = row._count;
    }

    res.json({
      serverCount,
      repositoryCount,
      userCount,
      deploymentCounts: counts,
      totalDeployments: Object.values(counts).reduce((a, b) => a + b, 0),
      recentDeployments,
    });
  })
);
