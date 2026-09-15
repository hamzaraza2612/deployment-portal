-- AlterTable
ALTER TABLE "Deployment" ADD COLUMN     "isRevert" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "revertedFromId" TEXT;

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_revertedFromId_fkey" FOREIGN KEY ("revertedFromId") REFERENCES "Deployment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

