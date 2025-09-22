/*
  Warnings:

  - You are about to drop the column `spreadSheetVersionId` on the `Message` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_spreadSheetVersionId_fkey";

-- AlterTable
ALTER TABLE "ChatSessionBranch" ADD COLUMN     "spreadSheetVersionId" TEXT;

-- AlterTable
ALTER TABLE "Message" DROP COLUMN "spreadSheetVersionId";

-- CreateIndex
CREATE INDEX "ChatSession_chatId_idx" ON "ChatSession"("chatId");

-- CreateIndex
CREATE INDEX "ChatSessionBranch_chatSessionId_idx" ON "ChatSessionBranch"("chatSessionId");

-- CreateIndex
CREATE INDEX "ChatSessionBranch_spreadSheetVersionId_idx" ON "ChatSessionBranch"("spreadSheetVersionId");

-- AddForeignKey
ALTER TABLE "ChatSessionBranch" ADD CONSTRAINT "ChatSessionBranch_spreadSheetVersionId_fkey" FOREIGN KEY ("spreadSheetVersionId") REFERENCES "SpreadSheetVersionData"("id") ON DELETE SET NULL ON UPDATE CASCADE;
