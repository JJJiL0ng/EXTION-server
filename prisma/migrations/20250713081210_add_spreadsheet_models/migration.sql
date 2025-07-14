-- CreateTable
CREATE TABLE "SpreadSheetMetaData" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,

    CONSTRAINT "SpreadSheetMetaData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllTableJson" (
    "id" TEXT NOT NULL,
    "spreadSheetMetaDataId" TEXT NOT NULL,
    "allTableDataJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AllTableJson_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AllTableJson_spreadSheetMetaDataId_key" ON "AllTableJson"("spreadSheetMetaDataId");

-- AddForeignKey
ALTER TABLE "SpreadSheetMetaData" ADD CONSTRAINT "SpreadSheetMetaData_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpreadSheetMetaData" ADD CONSTRAINT "SpreadSheetMetaData_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllTableJson" ADD CONSTRAINT "AllTableJson_spreadSheetMetaDataId_fkey" FOREIGN KEY ("spreadSheetMetaDataId") REFERENCES "SpreadSheetMetaData"("id") ON DELETE CASCADE ON UPDATE CASCADE;
