/*
  Warnings:

  - Added the required column `chatId` to the `SpreadSheet` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "SpreadSheet" ADD COLUMN     "chatId" TEXT NOT NULL;
