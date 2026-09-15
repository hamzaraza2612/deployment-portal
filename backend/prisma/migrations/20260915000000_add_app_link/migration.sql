-- CreateTable
CREATE TABLE "AppLink" (
    "id" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "username" TEXT,
    "password" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppLink_environment_idx" ON "AppLink"("environment");

