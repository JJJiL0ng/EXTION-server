/*
  Warnings:

  - You are about to drop the column `compressedData` on the `SpreadSheetData` table. All the data in the column will be lost.
  - You are about to drop the column `compressedSize` on the `SpreadSheetData` table. All the data in the column will be lost.
  - You are about to drop the column `dataHash` on the `SpreadSheetData` table. All the data in the column will be lost.
  - You are about to drop the column `originalSize` on the `SpreadSheetData` table. All the data in the column will be lost.
  - You are about to drop the column `version` on the `SpreadSheetData` table. All the data in the column will be lost.
  - You are about to drop the `DeltaRecord` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `GPTCache` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ParsedRemainder` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ParsedSheet` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `data` to the `SpreadSheetData` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "DeltaRecord" DROP CONSTRAINT "DeltaRecord_editHistoryId_fkey";

-- DropForeignKey
ALTER TABLE "ParsedRemainder" DROP CONSTRAINT "ParsedRemainder_sourceDataId_fkey";

-- DropForeignKey
ALTER TABLE "ParsedRemainder" DROP CONSTRAINT "ParsedRemainder_spreadSheetId_fkey";

-- DropForeignKey
ALTER TABLE "ParsedSheet" DROP CONSTRAINT "ParsedSheet_sourceDataId_fkey";

-- DropForeignKey
ALTER TABLE "ParsedSheet" DROP CONSTRAINT "ParsedSheet_spreadSheetId_fkey";

-- DropIndex
DROP INDEX "SpreadSheetData_dataHash_idx";

-- AlterTable
ALTER TABLE "SpreadSheetData" DROP COLUMN "compressedData",
DROP COLUMN "compressedSize",
DROP COLUMN "dataHash",
DROP COLUMN "originalSize",
DROP COLUMN "version",
ADD COLUMN     "data" JSONB NOT NULL;

-- DropTable
DROP TABLE "DeltaRecord";

-- DropTable
DROP TABLE "GPTCache";

-- DropTable
DROP TABLE "ParsedRemainder";

-- DropTable
DROP TABLE "ParsedSheet";

-- DropEnum
DROP TYPE "DeltaAction";
