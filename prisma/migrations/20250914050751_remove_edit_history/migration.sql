/*
  Warnings:

  - You are about to drop the `EditHistory` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "EditHistory" DROP CONSTRAINT "EditHistory_spreadSheetId_fkey";

-- DropTable
DROP TABLE "EditHistory";

-- DropEnum
DROP TYPE "EditStatus";
