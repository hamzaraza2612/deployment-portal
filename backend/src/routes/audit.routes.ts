import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth, requireRole } from "../middleware/auth";

export const auditRouter = Router();

auditRouter.use(requireAuth, requireRole("ADMIN"));

auditRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const logs = await prisma.auditLog.findMany({
      where: search
        ? {
            OR: [
              { summary: { contains: search, mode: "insensitive" } },
              { action: { contains: search, mode: "insensitive" } },
              { userName: { contains: search, mode: "insensitive" } },
              { userEmail: { contains: search, mode: "insensitive" } },
            ],
          }
        : undefined,
      orderBy: { createdAt: "desc" },
      take: 300,
    });
    res.json(logs);
  })
);
