/*
  Warnings:

  - You are about to drop the column `fileSize` on the `SpreadSheet` table. All the data in the column will be lost.
  - You are about to drop the column `version` on the `SpreadSheet` table. All the data in the column will be lost.
  - You are about to drop the `SpreadSheetData` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "SpreadSheetData" DROP CONSTRAINT "SpreadSheetData_spreadSheetId_fkey";

-- AlterTable
ALTER TABLE "SpreadSheet" DROP COLUMN "fileSize",
DROP COLUMN "version",
ADD COLUMN     "editLockVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "latestVersion" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "chatId" DROP NOT NULL;

-- DropTable
DROP TABLE "SpreadSheetData";

-- CreateTable
CREATE TABLE "SpreadSheetVersionData" (
    "id" TEXT NOT NULL,
    "spreadSheetId" TEXT NOT NULL,
    "spreadSheetVersionNumber" INTEGER NOT NULL,
    "name" TEXT,
    "data" JSONB NOT NULL,
    "sheetCount" INTEGER NOT NULL DEFAULT 1,
    "fileSize" INTEGER,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpreadSheetVersionData_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SpreadSheetVersionData_savedAt_idx" ON "SpreadSheetVersionData"("savedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SpreadSheetVersionData_spreadSheetId_spreadSheetVersionNumb_key" ON "SpreadSheetVersionData"("spreadSheetId", "spreadSheetVersionNumber");

-- AddForeignKey
ALTER TABLE "SpreadSheetVersionData" ADD CONSTRAINT "SpreadSheetVersionData_spreadSheetId_fkey" FOREIGN KEY ("spreadSheetId") REFERENCES "SpreadSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
