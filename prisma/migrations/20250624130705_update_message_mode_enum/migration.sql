/*
  Warnings:

  - The values [ARTIFACT,DATAGENERATION,DATAFIX] on the enum `MessageMode` will be removed. If these variants are still used in the database, this will fail.
  - The values [ARTIFACT,DATA_FIX] on the enum `MessageType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "MessageMode_new" AS ENUM ('NORMAL', 'FORMULA', 'VISUALIZATION', 'DATA_GENERATION', 'DATA_FIX', 'DATA_EDIT', 'FUNCTION');
ALTER TABLE "Message" ALTER COLUMN "mode" TYPE "MessageMode_new" USING ("mode"::text::"MessageMode_new");
ALTER TYPE "MessageMode" RENAME TO "MessageMode_old";
ALTER TYPE "MessageMode_new" RENAME TO "MessageMode";
DROP TYPE "MessageMode_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "MessageType_new" AS ENUM ('TEXT', 'FILE_UPLOAD', 'FORMULA', 'VISUALIZATION', 'DATA_GENERATION', 'FUNCTION', 'DATA_EDIT');
ALTER TABLE "Message" ALTER COLUMN "type" TYPE "MessageType_new" USING ("type"::text::"MessageType_new");
ALTER TYPE "MessageType" RENAME TO "MessageType_old";
ALTER TYPE "MessageType_new" RENAME TO "MessageType";
DROP TYPE "MessageType_old";
COMMIT;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "metadata" JSONB;
