export type Role = "ADMIN" | "OPERATOR" | "VIEWER";
export type AuthType = "PASSWORD" | "PRIVATE_KEY";
export type DeploymentStatus = "PENDING" | "RUNNING" | "SUCCESS" | "FAILED";

export interface CurrentUser {
  userId: string;
  email: string;
  name: string;
  role: Role;
}

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: string;
}

export interface ServerRecord {
  id: string;
  name: string;
  environment: string;
  host: string;
  port: number;
  sshUser: string;
  authType: AuthType;
  gitBaseDir: string;
  auditLogPath: string;
  basePaths: string[];
  createdAt: string;
  updatedAt: string;
}

export type ContainerState = "running" | "exited" | "paused" | "restarting" | "created" | "dead" | string;

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  state: ContainerState;
  ports: string;
  composeProject?: string;
  composeService?: string;
}

export interface RepositoryRecord {
  id: string;
  name: string;
  url: string;
  username: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeploymentListItem {
  id: string;
  branch: string;
  sourcePath: string;
  basePath: string;
  appName: string;
  appPath: string;
  backupName: string | null;
  status: DeploymentStatus;
  startedAt: string;
  finishedAt: string | null;
  server: { id: string; name: string };
  repository: { id: string; name: string };
  triggeredBy: { id: string; name: string; email: string };
}

export interface DeploymentDetail extends Omit<DeploymentListItem, "server" | "repository"> {
  publishDir: string;
  backupPath: string | null;
  log: string;
  errorMessage: string | null;
  server: { id: string; name: string; host: string };
  repository: { id: string; name: string; url: string };
}

export interface DashboardSummary {
  serverCount: number;
  repositoryCount: number;
  userCount: number;
  deploymentCounts: Record<DeploymentStatus, number>;
  totalDeployments: number;
  recentDeployments: Array<{
    id: string;
    branch: string;
    appName: string;
    status: DeploymentStatus;
    startedAt: string;
    finishedAt: string | null;
    server: { name: string };
    triggeredBy: { name: string };
  }>;
}
