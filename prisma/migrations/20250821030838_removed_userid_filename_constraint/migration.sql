/*
  Warnings:

  - A unique constraint covering the columns `[userId,id]` on the table `SpreadSheet` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "SpreadSheet_userId_fileName_key";

-- CreateIndex
CREATE UNIQUE INDEX "SpreadSheet_userId_id_key" ON "SpreadSheet"("userId", "id");
