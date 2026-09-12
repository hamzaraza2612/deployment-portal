import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  roleId: z.string().uuid(),
});

export const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  roleId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

export const createServerSchema = z.object({
  name: z.string().min(1),
  hostname: z.string().min(1),
  ipAddress: z.string().optional(),
  sshPort: z.number().int().positive().default(22),
  sshUser: z.string().min(1),
  credentialId: z.string().uuid().optional(),
});

export const createApplicationSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  repoUrl: z.string().url().optional(),
});

export const createEnvironmentSchema = z.object({
  name: z.string().min(1),
  applicationId: z.string().uuid(),
  serverId: z.string().uuid().optional(),
  credentialId: z.string().uuid().optional(),
  branch: z.string().optional(),
  deployPath: z.string().optional(),
});

export const createCredentialSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['SSH_KEY', 'PASSWORD', 'GIT_TOKEN']),
  value: z.string().min(1),
});
