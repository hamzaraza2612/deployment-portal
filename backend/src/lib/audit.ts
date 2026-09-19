import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import type { AuthTokenPayload } from "../middleware/auth";

/**
 * Fire-and-forget: an audit write failing should never break or delay the action it's
 * recording, so callers don't await this — same spirit as the deploy pipeline's own
 * fire-and-forget `void runDeployment(...)` calls. name/email are snapshotted from the
 * caller's JWT (no extra lookup) so the log stays meaningful even after that user's
 * account is later deleted. `details` carries the structured before/after (see lib/diff.ts's
 * fieldChangeDetails/textDiffDetails) shown in the Audit Logs page's expandable row.
 */
export function recordAudit(
  user: AuthTokenPayload,
  action: string,
  summary: string,
  details?: Record<string, unknown>
): void {
  prisma.auditLog
    .create({
      data: {
        userId: user.userId,
        userName: user.name,
        userEmail: user.email,
        action,
        summary,
        details: details as Prisma.InputJsonValue | undefined,
      },
    })
    .catch((err: unknown) => {
      console.error("Failed to record audit log:", err);
    });
}
