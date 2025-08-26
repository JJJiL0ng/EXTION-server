-- CreateTable
CREATE TABLE "ParsedSheet" (
    "id" TEXT NOT NULL,
    "spreadSheetId" TEXT NOT NULL,
    "sourceDataId" TEXT,
    "sheetName" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "dataHash" TEXT NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParsedSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParsedRemainder" (
    "id" TEXT NOT NULL,
    "spreadSheetId" TEXT NOT NULL,
    "sourceDataId" TEXT,
    "content" JSONB NOT NULL,
    "dataHash" TEXT NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParsedRemainder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ParsedSheet_spreadSheetId_savedAt_idx" ON "ParsedSheet"("spreadSheetId", "savedAt");

-- CreateIndex
CREATE INDEX "ParsedSheet_sourceDataId_idx" ON "ParsedSheet"("sourceDataId");

-- CreateIndex
CREATE UNIQUE INDEX "ParsedSheet_spreadSheetId_sheetName_dataHash_key" ON "ParsedSheet"("spreadSheetId", "sheetName", "dataHash");

-- CreateIndex
CREATE INDEX "ParsedRemainder_spreadSheetId_savedAt_idx" ON "ParsedRemainder"("spreadSheetId", "savedAt");

-- CreateIndex
CREATE INDEX "ParsedRemainder_sourceDataId_idx" ON "ParsedRemainder"("sourceDataId");

-- AddForeignKey
ALTER TABLE "ParsedSheet" ADD CONSTRAINT "ParsedSheet_spreadSheetId_fkey" FOREIGN KEY ("spreadSheetId") REFERENCES "SpreadSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParsedSheet" ADD CONSTRAINT "ParsedSheet_sourceDataId_fkey" FOREIGN KEY ("sourceDataId") REFERENCES "SpreadSheetData"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParsedRemainder" ADD CONSTRAINT "ParsedRemainder_spreadSheetId_fkey" FOREIGN KEY ("spreadSheetId") REFERENCES "SpreadSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParsedRemainder" ADD CONSTRAINT "ParsedRemainder_sourceDataId_fkey" FOREIGN KEY ("sourceDataId") REFERENCES "SpreadSheetData"("id") ON DELETE SET NULL ON UPDATE CASCADE;
