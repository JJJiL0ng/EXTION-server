-- AlterTable
ALTER TABLE "SourceSheetVersion" ADD COLUMN     "sourceSheetRange" JSONB;

-- AlterTable
ALTER TABLE "TargetSheetVersion" ADD COLUMN     "targetSheetRange" JSONB;
