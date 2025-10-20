/*
  Warnings:

  - You are about to drop the column `description` on the `WorkflowCode` table. All the data in the column will be lost.
  - Added the required column `mappingScript` to the `WorkflowCode` table without a default value. This is not possible if the table is not empty.
  - Added the required column `mappingSuggestion` to the `WorkflowCode` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "WorkflowCode" DROP COLUMN "description",
ADD COLUMN     "mappingScript" JSONB NOT NULL,
ADD COLUMN     "mappingSuggestion" TEXT NOT NULL;
