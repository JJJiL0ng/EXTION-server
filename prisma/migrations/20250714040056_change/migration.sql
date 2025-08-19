/*
  Warnings:

  - The values [EXTION_AI] on the enum `MessageRole` will be removed. If these variants are still used in the database, this will fail.
  - The values [FILE_UPLOAD,FORMULA,VISUALIZATION,DATA_GENERATION,FUNCTION,DATA_EDIT] on the enum `MessageType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `analytics` on the `Chat` table. All the data in the column will be lost.
  - You are about to drop the column `sheetMetaDataId` on the `Chat` table. All the data in the column will be lost.
  - You are about to drop the column `artifactData` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the column `dataChangeInfo` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the column `fileUploadInfo` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the column `formulaData` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the column `mode` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the column `sessionId` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the column `timestamp` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the `AllTableJson` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `EditSession` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SessionDelta` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SheetMetaData` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SheetTableData` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SpreadSheetMetaData` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "SpreadSheetStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'DELETED');

-- CreateEnum
CREATE TYPE "EditStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ERROR');

-- CreateEnum
CREATE TYPE "DeltaAction" AS ENUM ('SET_CELL_VALUE', 'SET_CELL_FORMULA', 'SET_CELL_STYLE', 'DELETE_CELLS', 'INSERT_ROWS', 'DELETE_ROWS', 'INSERT_COLUMNS', 'DELETE_COLUMNS', 'ADD_SHEET', 'DELETE_SHEET', 'RENAME_SHEET');

-- AlterEnum
BEGIN;
CREATE TYPE "MessageRole_new" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');
ALTER TABLE "Message" ALTER COLUMN "role" TYPE "MessageRole_new" USING ("role"::text::"MessageRole_new");
ALTER TYPE "MessageRole" RENAME TO "MessageRole_old";
ALTER TYPE "MessageRole_new" RENAME TO "MessageRole";
DROP TYPE "MessageRole_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "MessageType_new" AS ENUM ('TEXT', 'ANALYSIS', 'SUGGESTION', 'ERROR');
ALTER TABLE "Message" ALTER COLUMN "type" TYPE "MessageType_new" USING ("type"::text::"MessageType_new");
ALTER TYPE "MessageType" RENAME TO "MessageType_old";
ALTER TYPE "MessageType_new" RENAME TO "MessageType";
DROP TYPE "MessageType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "AllTableJson" DROP CONSTRAINT "AllTableJson_spreadSheetMetaDataId_fkey";

-- DropForeignKey
ALTER TABLE "Chat" DROP CONSTRAINT "Chat_sheetMetaDataId_fkey";

-- DropForeignKey
ALTER TABLE "EditSession" DROP CONSTRAINT "EditSession_spreadSheetMetaDataId_fkey";

-- DropForeignKey
ALTER TABLE "EditSession" DROP CONSTRAINT "EditSession_userId_fkey";

-- DropForeignKey
ALTER TABLE "SessionDelta" DROP CONSTRAINT "SessionDelta_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "SheetMetaData" DROP CONSTRAINT "SheetMetaData_userId_fkey";

-- DropForeignKey
ALTER TABLE "SheetTableData" DROP CONSTRAINT "SheetTableData_sheetMetaDataId_fkey";

-- DropForeignKey
ALTER TABLE "SpreadSheetMetaData" DROP CONSTRAINT "SpreadSheetMetaData_chatId_fkey";

-- DropForeignKey
ALTER TABLE "SpreadSheetMetaData" DROP CONSTRAINT "SpreadSheetMetaData_userId_fkey";

-- DropIndex
DROP INDEX "Message_chatId_timestamp_idx";

-- DropIndex
DROP INDEX "Message_sessionId_idx";

-- AlterTable
ALTER TABLE "Chat" DROP COLUMN "analytics",
DROP COLUMN "sheetMetaDataId",
ADD COLUMN     "spreadSheetId" TEXT;

-- AlterTable
ALTER TABLE "Message" DROP COLUMN "artifactData",
DROP COLUMN "dataChangeInfo",
DROP COLUMN "fileUploadInfo",
DROP COLUMN "formulaData",
DROP COLUMN "mode",
DROP COLUMN "sessionId",
DROP COLUMN "timestamp",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "type" SET DEFAULT 'TEXT';

-- DropTable
DROP TABLE "AllTableJson";

-- DropTable
DROP TABLE "EditSession";

-- DropTable
DROP TABLE "SessionDelta";

-- DropTable
DROP TABLE "SheetMetaData";

-- DropTable
DROP TABLE "SheetTableData";

-- DropTable
DROP TABLE "SpreadSheetMetaData";

-- DropEnum
DROP TYPE "MessageMode";

-- DropEnum
DROP TYPE "SessionStatus";

-- CreateTable
CREATE TABLE "SpreadSheet" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastOpened" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "SpreadSheetStatus" NOT NULL DEFAULT 'ACTIVE',
    "userId" TEXT NOT NULL,

    CONSTRAINT "SpreadSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpreadSheetData" (
    "id" TEXT NOT NULL,
    "spreadSheetId" TEXT NOT NULL,
    "compressedData" BYTEA NOT NULL,
    "dataHash" TEXT NOT NULL,
    "originalSize" INTEGER NOT NULL,
    "compressedSize" INTEGER NOT NULL,
    "sheetCount" INTEGER NOT NULL DEFAULT 1,
    "version" TEXT NOT NULL DEFAULT '18.1.4',
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpreadSheetData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EditHistory" (
    "id" TEXT NOT NULL,
    "spreadSheetId" TEXT NOT NULL,
    "sessionStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sessionEnd" TIMESTAMP(3),
    "deltaCount" INTEGER NOT NULL DEFAULT 0,
    "status" "EditStatus" NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB,

    CONSTRAINT "EditHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeltaRecord" (
    "id" TEXT NOT NULL,
    "editHistoryId" TEXT NOT NULL,
    "deltaData" JSONB NOT NULL,
    "sequenceNo" INTEGER NOT NULL,
    "action" "DeltaAction" NOT NULL,
    "sheetName" TEXT,
    "cellRange" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeltaRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GPTCache" (
    "id" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "dataHash" TEXT NOT NULL,
    "questionHash" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "tokenCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "hitCount" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "GPTCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SpreadSheet_userId_updatedAt_idx" ON "SpreadSheet"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "SpreadSheet_userId_lastOpened_idx" ON "SpreadSheet"("userId", "lastOpened");

-- CreateIndex
CREATE UNIQUE INDEX "SpreadSheet_userId_fileName_key" ON "SpreadSheet"("userId", "fileName");

-- CreateIndex
CREATE UNIQUE INDEX "SpreadSheetData_spreadSheetId_key" ON "SpreadSheetData"("spreadSheetId");

-- CreateIndex
CREATE INDEX "SpreadSheetData_dataHash_idx" ON "SpreadSheetData"("dataHash");

-- CreateIndex
CREATE INDEX "SpreadSheetData_savedAt_idx" ON "SpreadSheetData"("savedAt");

-- CreateIndex
CREATE INDEX "EditHistory_spreadSheetId_sessionStart_idx" ON "EditHistory"("spreadSheetId", "sessionStart");

-- CreateIndex
CREATE INDEX "EditHistory_status_idx" ON "EditHistory"("status");

-- CreateIndex
CREATE INDEX "DeltaRecord_editHistoryId_createdAt_idx" ON "DeltaRecord"("editHistoryId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeltaRecord_editHistoryId_sequenceNo_key" ON "DeltaRecord"("editHistoryId", "sequenceNo");

-- CreateIndex
CREATE UNIQUE INDEX "GPTCache_cacheKey_key" ON "GPTCache"("cacheKey");

-- CreateIndex
CREATE INDEX "GPTCache_dataHash_idx" ON "GPTCache"("dataHash");

-- CreateIndex
CREATE INDEX "GPTCache_expiresAt_idx" ON "GPTCache"("expiresAt");

-- CreateIndex
CREATE INDEX "Chat_spreadSheetId_updatedAt_idx" ON "Chat"("spreadSheetId", "updatedAt");

-- CreateIndex
CREATE INDEX "Message_chatId_createdAt_idx" ON "Message"("chatId", "createdAt");

-- AddForeignKey
ALTER TABLE "SpreadSheet" ADD CONSTRAINT "SpreadSheet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpreadSheetData" ADD CONSTRAINT "SpreadSheetData_spreadSheetId_fkey" FOREIGN KEY ("spreadSheetId") REFERENCES "SpreadSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditHistory" ADD CONSTRAINT "EditHistory_spreadSheetId_fkey" FOREIGN KEY ("spreadSheetId") REFERENCES "SpreadSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeltaRecord" ADD CONSTRAINT "DeltaRecord_editHistoryId_fkey" FOREIGN KEY ("editHistoryId") REFERENCES "EditHistory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_spreadSheetId_fkey" FOREIGN KEY ("spreadSheetId") REFERENCES "SpreadSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
