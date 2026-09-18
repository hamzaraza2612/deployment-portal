import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  role: z.enum(["ADMIN", "OPERATOR", "VIEWER"]),
  allowedEnvironments: z.array(z.string().min(1)).default([]),
});

export const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(["ADMIN", "OPERATOR", "VIEWER"]).optional(),
  password: z.string().min(8).optional(),
  allowedEnvironments: z.array(z.string().min(1)).optional(),
});

export const serverSecretSchema = z.union([
  z.object({ authType: z.literal("PASSWORD"), password: z.string().min(1) }),
  z.object({
    authType: z.literal("PRIVATE_KEY"),
    privateKey: z.string().min(1),
    passphrase: z.string().optional(),
  }),
]);

export const createServerSchema = z.object({
  name: z.string().min(1),
  environment: z.string().min(1).default("Production"),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535).default(22),
  sshUser: z.string().min(1),
  gitBaseDir: z.string().min(1).default("/mnt/data/git-directory"),
  auditLogPath: z.string().min(1).default("/mnt/data/deployment_audit.log"),
  basePaths: z.array(z.string().min(1)).default([]),
  auth: serverSecretSchema,
});

export const updateServerSchema = z.object({
  name: z.string().min(1).optional(),
  environment: z.string().min(1).optional(),
  host: z.string().min(1).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  sshUser: z.string().min(1).optional(),
  gitBaseDir: z.string().min(1).optional(),
  auditLogPath: z.string().min(1).optional(),
  basePaths: z.array(z.string().min(1)).optional(),
  auth: serverSecretSchema.optional(),
});

export const createRepositorySchema = z.object({
  name: z.string().min(1),
  url: z.string().min(1),
  // Optional: when omitted, the backend looks up a saved GitCredential matching the
  // URL's host so a repo on an already-known host can be added without retyping them.
  username: z.string().min(1).optional(),
  secret: z.string().min(1).optional(),
});

export const updateRepositorySchema = z.object({
  name: z.string().min(1).optional(),
  url: z.string().min(1).optional(),
  username: z.string().min(1).optional(),
  secret: z.string().min(1).optional(),
});

export const fetchBranchesSchema = z.object({
  serverId: z.string().min(1),
  repositoryId: z.string().min(1),
});

export const checkoutBranchSchema = z.object({
  serverId: z.string().min(1),
  repositoryId: z.string().min(1),
  branch: z.string().min(1),
});

export const browseSchema = z.object({
  serverId: z.string().min(1),
  path: z.string().min(1),
});

export const createDeploymentSchema = z.object({
  serverId: z.string().min(1),
  repositoryId: z.string().min(1),
  branch: z.string().min(1),
  sourcePath: z.string().min(1),
  basePath: z.string().min(1),
  appName: z.string().min(1),
  backupName: z.string().optional(),
});

export const revertDeploymentSchema = z.object({
  backupName: z.string().optional(),
});

export const promoteDeploymentSchema = z.object({
  targetEnvironment: z.string().min(1),
});

export const deployPromotionSchema = z.object({
  targetServerId: z.string().min(1).optional(),
  basePath: z.string().min(1).optional(),
  appName: z.string().min(1).optional(),
});

export const createAppLinkSchema = z.object({
  environment: z.string().min(1),
  name: z.string().min(1),
  url: z.string().min(1),
  username: z.string().optional(),
  password: z.string().optional(),
  notes: z.string().optional(),
});

export const updateAppLinkSchema = z.object({
  environment: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  url: z.string().min(1).optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  notes: z.string().optional(),
});

const configFileAppSchema = {
  serverId: z.string().min(1),
  basePath: z.string().min(1),
  appName: z.string().min(1),
};

export const configFilesListSchema = z.object(configFileAppSchema);

export const configFileContentSchema = z.object({
  ...configFileAppSchema,
  relativePath: z.string().min(1),
});

export const saveConfigFileSchema = z.object({
  ...configFileAppSchema,
  relativePath: z.string().min(1),
  content: z.string(),
});

export const restoreConfigFileSchema = z.object({
  ...configFileAppSchema,
  relativePath: z.string().min(1),
  backupName: z.string().min(1),
});

export const restartComposeSchema = z.object(configFileAppSchema);

export const createGitCredentialSchema = z.object({
  host: z.string().min(1),
  username: z.string().min(1),
  secret: z.string().min(1),
});

export const updateGitCredentialSchema = z.object({
  username: z.string().min(1).optional(),
  secret: z.string().min(1).optional(),
});
