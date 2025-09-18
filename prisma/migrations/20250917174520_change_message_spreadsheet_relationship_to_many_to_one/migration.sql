/*
  Warnings:

  - You are about to drop the column `createdSpreadSheetVersionId` on the `Message` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_createdSpreadSheetVersionId_fkey";

-- DropIndex
DROP INDEX "Message_createdSpreadSheetVersionId_key";

-- AlterTable
ALTER TABLE "Message" DROP COLUMN "createdSpreadSheetVersionId",
ADD COLUMN     "spreadSheetVersionId" TEXT;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_spreadSheetVersionId_fkey" FOREIGN KEY ("spreadSheetVersionId") REFERENCES "SpreadSheetVersionData"("id") ON DELETE SET NULL ON UPDATE CASCADE;
