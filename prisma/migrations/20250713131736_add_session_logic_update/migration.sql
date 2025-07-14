/*
  Warnings:

  - You are about to drop the column `allTableDataJson` on the `AllTableJson` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[userId,fileName,chatId]` on the table `SpreadSheetMetaData` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `compressedData` to the `AllTableJson` table without a default value. This is not possible if the table is not empty.
  - Added the required column `dataHash` to the `AllTableJson` table without a default value. This is not possible if the table is not empty.
  - Added the required column `dataSize` to the `AllTableJson` table without a default value. This is not possible if the table is not empty.
  - Added the required column `originalSize` to the `AllTableJson` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'SAVING', 'SAVED', 'ERROR', 'EXPIRED');

-- AlterTable
ALTER TABLE "AllTableJson" DROP COLUMN "allTableDataJson",
ADD COLUMN     "compressedData" BYTEA NOT NULL,
ADD COLUMN     "dataHash" TEXT NOT NULL,
ADD COLUMN     "dataSize" INTEGER NOT NULL,
ADD COLUMN     "originalSize" INTEGER NOT NULL,
ADD COLUMN     "sheetCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "version" TEXT NOT NULL DEFAULT '18.1.4';

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "sessionId" TEXT;

-- AlterTable
ALTER TABLE "SpreadSheetMetaData" ALTER COLUMN "chatId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "EditSession" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "spreadSheetMetaDataId" TEXT NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 0,
    "lastActivity" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EditSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionDelta" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "deltaData" JSONB NOT NULL,
    "sequenceNo" INTEGER NOT NULL,
    "applied" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionDelta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EditSession_sessionId_key" ON "EditSession"("sessionId");

-- CreateIndex
CREATE INDEX "EditSession_userId_status_idx" ON "EditSession"("userId", "status");

-- CreateIndex
CREATE INDEX "EditSession_spreadSheetMetaDataId_status_idx" ON "EditSession"("spreadSheetMetaDataId", "status");

-- CreateIndex
CREATE INDEX "EditSession_lastActivity_idx" ON "EditSession"("lastActivity");

-- CreateIndex
CREATE INDEX "SessionDelta_sessionId_applied_idx" ON "SessionDelta"("sessionId", "applied");

-- CreateIndex
CREATE INDEX "SessionDelta_createdAt_idx" ON "SessionDelta"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SessionDelta_sessionId_sequenceNo_key" ON "SessionDelta"("sessionId", "sequenceNo");

-- CreateIndex
CREATE INDEX "AllTableJson_dataHash_idx" ON "AllTableJson"("dataHash");

-- CreateIndex
CREATE INDEX "AllTableJson_version_idx" ON "AllTableJson"("version");

-- CreateIndex
CREATE INDEX "AllTableJson_updatedAt_idx" ON "AllTableJson"("updatedAt");

-- CreateIndex
CREATE INDEX "Message_sessionId_idx" ON "Message"("sessionId");

-- CreateIndex
CREATE INDEX "SpreadSheetMetaData_userId_updatedAt_idx" ON "SpreadSheetMetaData"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SpreadSheetMetaData_userId_fileName_chatId_key" ON "SpreadSheetMetaData"("userId", "fileName", "chatId");

-- AddForeignKey
ALTER TABLE "EditSession" ADD CONSTRAINT "EditSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditSession" ADD CONSTRAINT "EditSession_spreadSheetMetaDataId_fkey" FOREIGN KEY ("spreadSheetMetaDataId") REFERENCES "SpreadSheetMetaData"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionDelta" ADD CONSTRAINT "SessionDelta_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "EditSession"("sessionId") ON DELETE CASCADE ON UPDATE CASCADE;
