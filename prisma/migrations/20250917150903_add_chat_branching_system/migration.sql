/*
  Warnings:

  - You are about to drop the column `createdAt` on the `Chat` table. All the data in the column will be lost.
  - You are about to drop the column `messageCount` on the `Chat` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `Chat` table. All the data in the column will be lost.
  - You are about to drop the column `title` on the `Chat` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Chat` table. All the data in the column will be lost.
  - You are about to drop the column `chatId` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the column `chatId` on the `SpreadSheet` table. All the data in the column will be lost.
  - You are about to drop the column `latestVersion` on the `SpreadSheet` table. All the data in the column will be lost.
  - You are about to drop the column `fileSize` on the `SpreadSheetVersionData` table. All the data in the column will be lost.
  - You are about to drop the column `sheetCount` on the `SpreadSheetVersionData` table. All the data in the column will be lost.
  - You are about to drop the column `spreadSheetVersionNumber` on the `SpreadSheetVersionData` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[spreadSheetId]` on the table `Chat` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[createdSpreadSheetVersionId]` on the table `Message` will be added. If there are existing duplicate values, this will fail.
  - Made the column `spreadSheetId` on table `Chat` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `chatSessionBranchId` to the `Message` table without a default value. This is not possible if the table is not empty.
  - Added the required column `authorId` to the `SpreadSheetVersionData` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_chatId_fkey";

-- DropIndex
DROP INDEX "Chat_spreadSheetId_updatedAt_idx";

-- DropIndex
DROP INDEX "Chat_userId_status_updatedAt_idx";

-- DropIndex
DROP INDEX "Message_aiChatRes_idx";

-- DropIndex
DROP INDEX "Message_chatId_createdAt_idx";

-- DropIndex
DROP INDEX "SpreadSheet_userId_id_key";

-- DropIndex
DROP INDEX "SpreadSheet_userId_lastOpened_idx";

-- DropIndex
DROP INDEX "SpreadSheet_userId_updatedAt_idx";

-- DropIndex
DROP INDEX "SpreadSheetVersionData_savedAt_idx";

-- DropIndex
DROP INDEX "SpreadSheetVersionData_spreadSheetId_spreadSheetVersionNumb_key";

-- DropIndex
DROP INDEX "User_createdAt_idx";

-- AlterTable
ALTER TABLE "Chat" DROP COLUMN "createdAt",
DROP COLUMN "messageCount",
DROP COLUMN "status",
DROP COLUMN "title",
DROP COLUMN "updatedAt",
ADD COLUMN     "latestChatSessionId" TEXT,
ALTER COLUMN "spreadSheetId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Message" DROP COLUMN "chatId",
ADD COLUMN     "chatSessionBranchId" TEXT NOT NULL,
ADD COLUMN     "createdSpreadSheetVersionId" TEXT;

-- AlterTable
ALTER TABLE "SpreadSheet" DROP COLUMN "chatId",
DROP COLUMN "latestVersion",
ADD COLUMN     "headVersionId" TEXT;

-- AlterTable
ALTER TABLE "SpreadSheetVersionData" DROP COLUMN "fileSize",
DROP COLUMN "sheetCount",
DROP COLUMN "spreadSheetVersionNumber",
ADD COLUMN     "authorId" TEXT NOT NULL,
ADD COLUMN     "parentId" TEXT;

-- CreateTable
CREATE TABLE "ChatSession" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chatId" TEXT NOT NULL,
    "latestBranchId" TEXT,
    "parentSessionId" TEXT,
    "forkedFromSpreadSheetVersionId" TEXT,

    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatSessionBranch" (
    "id" TEXT NOT NULL,
    "chatSessionId" TEXT NOT NULL,
    "parentBranchId" TEXT,

    CONSTRAINT "ChatSessionBranch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Chat_spreadSheetId_key" ON "Chat"("spreadSheetId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_createdSpreadSheetVersionId_key" ON "Message"("createdSpreadSheetVersionId");

-- AddForeignKey
ALTER TABLE "SpreadSheetVersionData" ADD CONSTRAINT "SpreadSheetVersionData_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSessionBranch" ADD CONSTRAINT "ChatSessionBranch_chatSessionId_fkey" FOREIGN KEY ("chatSessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_chatSessionBranchId_fkey" FOREIGN KEY ("chatSessionBranchId") REFERENCES "ChatSessionBranch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_createdSpreadSheetVersionId_fkey" FOREIGN KEY ("createdSpreadSheetVersionId") REFERENCES "SpreadSheetVersionData"("id") ON DELETE SET NULL ON UPDATE CASCADE;
