-- AlterTable
ALTER TABLE "User" ADD COLUMN     "allowedEnvironments" TEXT[] DEFAULT ARRAY[]::TEXT[];

