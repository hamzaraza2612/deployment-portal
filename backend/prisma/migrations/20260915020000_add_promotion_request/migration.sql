-- CreateEnum
CREATE TYPE "PromotionStatus" AS ENUM ('PENDING', 'DEPLOYED', 'CANCELLED');

-- CreateTable
CREATE TABLE "PromotionRequest" (
    "id" TEXT NOT NULL,
    "sourceDeploymentId" TEXT NOT NULL,
    "targetEnvironment" TEXT NOT NULL,
    "targetServerId" TEXT,
    "targetBasePath" TEXT,
    "targetAppName" TEXT,
    "status" "PromotionStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "resultDeploymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromotionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PromotionRequest_resultDeploymentId_key" ON "PromotionRequest"("resultDeploymentId");

-- CreateIndex
CREATE INDEX "PromotionRequest_targetEnvironment_idx" ON "PromotionRequest"("targetEnvironment");

-- CreateIndex
CREATE INDEX "PromotionRequest_status_idx" ON "PromotionRequest"("status");

-- AddForeignKey
ALTER TABLE "PromotionRequest" ADD CONSTRAINT "PromotionRequest_sourceDeploymentId_fkey" FOREIGN KEY ("sourceDeploymentId") REFERENCES "Deployment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRequest" ADD CONSTRAINT "PromotionRequest_targetServerId_fkey" FOREIGN KEY ("targetServerId") REFERENCES "Server"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRequest" ADD CONSTRAINT "PromotionRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRequest" ADD CONSTRAINT "PromotionRequest_resultDeploymentId_fkey" FOREIGN KEY ("resultDeploymentId") REFERENCES "Deployment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

