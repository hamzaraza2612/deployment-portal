import { prisma } from "./prisma";
import type { AuthTokenPayload } from "../middleware/auth";

/**
 * Fire-and-forget: an audit write failing should never break or delay the action it's
 * recording, so callers don't await this — same spirit as the deploy pipeline's own
 * fire-and-forget `void runDeployment(...)` calls. name/email are snapshotted from the
 * caller's JWT (no extra lookup) so the log stays meaningful even after that user's
 * account is later deleted.
 */
export function recordAudit(user: AuthTokenPayload, action: string, summary: string): void {
  prisma.auditLog
    .create({ data: { userId: user.userId, userName: user.name, userEmail: user.email, action, summary } })
    .catch((err: unknown) => {
      console.error("Failed to record audit log:", err);
    });
}
