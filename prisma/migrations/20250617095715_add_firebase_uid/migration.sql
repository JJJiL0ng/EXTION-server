-- CreateEnum
CREATE TYPE "ChatStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'DELETED');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'EXTION_AI', 'SYSTEM');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'FILE_UPLOAD', 'FORMULA', 'ARTIFACT', 'DATA_GENERATION', 'DATA_FIX', 'FUNCTION');

-- CreateEnum
CREATE TYPE "MessageMode" AS ENUM ('NORMAL', 'FORMULA', 'ARTIFACT', 'DATAGENERATION', 'DATAFIX', 'FUNCTION');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "firebaseUid" TEXT,
    "email" TEXT,
    "displayName" TEXT NOT NULL,
    "photoURL" TEXT,
    "isGuest" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveAt" TIMESTAMP(3) NOT NULL,
    "preferences" JSONB,
    "statistics" JSONB,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SheetMetaData" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalFileName" TEXT,
    "fileSize" INTEGER,
    "fileType" TEXT,
    "activeSheetIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "SheetMetaData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SheetTableData" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sheetMetaDataId" TEXT NOT NULL,

    CONSTRAINT "SheetTableData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chat" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "status" "ChatStatus" NOT NULL DEFAULT 'ACTIVE',
    "analytics" JSONB,
    "userId" TEXT NOT NULL,
    "sheetMetaDataId" TEXT,

    CONSTRAINT "Chat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "role" "MessageRole" NOT NULL,
    "type" "MessageType" NOT NULL,
    "mode" "MessageMode",
    "sheetContext" JSONB,
    "formulaData" JSONB,
    "artifactData" JSONB,
    "dataChangeInfo" JSONB,
    "fileUploadInfo" JSONB,
    "chatId" TEXT NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_firebaseUid_key" ON "User"("firebaseUid");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "SheetTableData_sheetMetaDataId_index_key" ON "SheetTableData"("sheetMetaDataId", "index");

-- CreateIndex
CREATE UNIQUE INDEX "SheetTableData_sheetMetaDataId_name_key" ON "SheetTableData"("sheetMetaDataId", "name");

-- AddForeignKey
ALTER TABLE "SheetMetaData" ADD CONSTRAINT "SheetMetaData_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SheetTableData" ADD CONSTRAINT "SheetTableData_sheetMetaDataId_fkey" FOREIGN KEY ("sheetMetaDataId") REFERENCES "SheetMetaData"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_sheetMetaDataId_fkey" FOREIGN KEY ("sheetMetaDataId") REFERENCES "SheetMetaData"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
