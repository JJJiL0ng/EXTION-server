-- AlterTable
ALTER TABLE "Chat" ADD COLUMN     "status" "ChatStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "title" TEXT;
