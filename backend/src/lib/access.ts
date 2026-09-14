import type { AuthTokenPayload } from "../middleware/auth";

/** ADMIN always has full access; everyone else is limited to their assigned environment tags. */
export function accessibleEnvironments(user: AuthTokenPayload): string[] | "all" {
  return user.role === "ADMIN" ? "all" : user.allowedEnvironments;
}

export function canAccessEnvironment(user: AuthTokenPayload, environment: string): boolean {
  if (user.role === "ADMIN") return true;
  return user.allowedEnvironments.includes(environment);
}

/** Prisma `where` fragment for filtering a Server (or a relation to one) by the user's access. */
export function serverEnvironmentFilter(user: AuthTokenPayload): { environment?: { in: string[] } } {
  const envs = accessibleEnvironments(user);
  return envs === "all" ? {} : { environment: { in: envs } };
}
