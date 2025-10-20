-- AlterTable
ALTER TABLE "SourceSheetVersion" ADD COLUMN     "mappingSheetName" TEXT,
ADD COLUMN     "parsedData" JSONB;

-- AlterTable
ALTER TABLE "TargetSheetVersion" ADD COLUMN     "mappingSheetName" TEXT,
ADD COLUMN     "parsedData" JSONB;
