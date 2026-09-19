import { Router } from "express";
import { prisma } from "../lib/prisma";
import { decrypt, encrypt } from "../lib/crypto";
import { recordAudit } from "../lib/audit";
import { fieldChangeDetails } from "../lib/diff";
import { asyncHandler, HttpError } from "../middleware/errorHandler";
import { requireAuth, requireRole } from "../middleware/auth";
import { canAccessEnvironment, environmentFilter } from "../lib/access";
import { createAppLinkSchema, updateAppLinkSchema } from "../validators/schemas";

export const linksRouter = Router();

linksRouter.use(requireAuth);

function toClientShape<T extends { password: string | null }>(link: T) {
  return { ...link, password: link.password ? decrypt(link.password) : null };
}

linksRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const links = await prisma.appLink.findMany({
      where: environmentFilter(req.user!),
      orderBy: [{ environment: "asc" }, { name: "asc" }],
    });
    res.json(links.map(toClientShape));
  })
);

linksRouter.post(
  "/",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const body = createAppLinkSchema.parse(req.body);
    const link = await prisma.appLink.create({
      data: {
        environment: body.environment,
        name: body.name,
        url: body.url,
        username: body.username,
        password: body.password ? encrypt(body.password) : null,
        notes: body.notes,
      },
    });
    recordAudit(req.user!, "link.create", `Added link ${link.name} (${link.environment})`);
    res.status(201).json(toClientShape(link));
  })
);

linksRouter.patch(
  "/:id",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const body = updateAppLinkSchema.parse(req.body);
    const existing = await prisma.appLink.findUniqueOrThrow({
      where: { id: req.params.id },
      select: { environment: true, name: true, url: true, username: true, notes: true },
    });
    const data: Record<string, unknown> = {
      environment: body.environment,
      name: body.name,
      url: body.url,
      username: body.username,
      notes: body.notes,
    };
    if (body.password !== undefined) {
      data.password = body.password ? encrypt(body.password) : null;
    }
    Object.keys(data).forEach((key) => data[key] === undefined && delete data[key]);

    const link = await prisma.appLink.update({ where: { id: req.params.id }, data });
    const changes = fieldChangeDetails(existing, data, ["environment", "name", "url", "username", "notes"]);
    const details =
      data.password !== undefined
        ? {
            kind: "fields",
            changes: {
              ...(changes?.changes as object),
              password: { from: "(hidden)", to: data.password ? "updated" : "cleared" },
            },
          }
        : changes;
    recordAudit(req.user!, "link.update", `Updated link ${link.name} (${link.environment})`, details);
    res.json(toClientShape(link));
  })
);

linksRouter.delete(
  "/:id",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const link = await prisma.appLink.delete({ where: { id: req.params.id } });
    recordAudit(req.user!, "link.delete", `Deleted link ${link.name} (${link.environment})`);
    res.status(204).end();
  })
);

// Defense in depth: even though the list endpoint is already filtered, make sure a
// non-admin can't fetch a single link outside their environment by guessing its id.
linksRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const link = await prisma.appLink.findUniqueOrThrow({ where: { id: req.params.id } });
    if (!canAccessEnvironment(req.user!, link.environment)) {
      throw new HttpError(404, "Link not found");
    }
    res.json(toClientShape(link));
  })
);
