export type Role = "ADMIN" | "OPERATOR" | "VIEWER";
export type AuthType = "PASSWORD" | "PRIVATE_KEY";
export type DeploymentStatus = "PENDING" | "RUNNING" | "SUCCESS" | "FAILED";

export interface CurrentUser {
  userId: string;
  email: string;
  name: string;
  role: Role;
  allowedEnvironments: string[];
}

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  role: Role;
  allowedEnvironments: string[];
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

export interface ContainerStats {
  id: string;
  name: string;
  cpuPercent: string;
  memUsage: string;
  memPercent: string;
  netIO: string;
  blockIO: string;
}

export interface SystemStats {
  cpuPercent: number | null;
  memTotalMb: number | null;
  memUsedMb: number | null;
  memAvailableMb: number | null;
  diskTotalKb: number | null;
  diskUsedKb: number | null;
  diskAvailKb: number | null;
}

export interface VmServiceStatus {
  name: string;
  running: boolean;
  method: "systemd" | "port" | "process" | "none";
  cpuPercent: number | null;
  memKb: number | null;
}

export interface AppLinkRecord {
  id: string;
  environment: string;
  name: string;
  url: string;
  username: string | null;
  password: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
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
  isRevert: boolean;
  revertedFromId: string | null;
  promotionRequestAsResult: { id: string } | null;
  server: { id: string; name: string };
  repository: { id: string; name: string };
  triggeredBy: { id: string; name: string; email: string };
}

export interface DeploymentDetail extends Omit<DeploymentListItem, "server" | "repository" | "promotionRequestAsResult"> {
  publishDir: string;
  backupPath: string | null;
  log: string;
  errorMessage: string | null;
  server: { id: string; name: string; host: string };
  repository: { id: string; name: string; url: string };
  revertedFrom: { id: string; appName: string; branch: string; startedAt: string } | null;
  promotionRequestAsResult: {
    id: string;
    sourceDeployment: {
      id: string;
      appName: string;
      branch: string;
      startedAt: string;
      server: { id: string; name: string; environment: string };
    };
  } | null;
}

export type PromotionStatus = "PENDING" | "DEPLOYED" | "CANCELLED";

export interface PromotionRequestListItem {
  id: string;
  targetEnvironment: string;
  targetServerId: string | null;
  targetBasePath: string | null;
  targetAppName: string | null;
  status: PromotionStatus;
  createdAt: string;
  updatedAt: string;
  requestedBy: { id: string; name: string; email: string };
  targetServer: { id: string; name: string } | null;
  sourceDeployment: {
    id: string;
    appName: string;
    branch: string;
    basePath: string;
    startedAt: string;
    server: { id: string; name: string; environment: string };
  };
  resultDeployment: { id: string; status: DeploymentStatus } | null;
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
