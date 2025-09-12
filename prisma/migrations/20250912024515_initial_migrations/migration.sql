-- CreateEnum
CREATE TYPE "SpreadSheetStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'DELETED');

-- CreateEnum
CREATE TYPE "EditStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ERROR');

-- CreateEnum
CREATE TYPE "ChatStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'DELETED');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'ANALYSIS', 'SUGGESTION', 'ERROR');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
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
CREATE TABLE "SpreadSheet" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastOpened" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "SpreadSheetStatus" NOT NULL DEFAULT 'ACTIVE',
    "userId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,

    CONSTRAINT "SpreadSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpreadSheetData" (
    "id" TEXT NOT NULL,
    "spreadSheetId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "sheetCount" INTEGER NOT NULL DEFAULT 1,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpreadSheetData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EditHistory" (
    "id" TEXT NOT NULL,
    "spreadSheetId" TEXT NOT NULL,
    "sessionStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sessionEnd" TIMESTAMP(3),
    "deltaCount" INTEGER NOT NULL DEFAULT 0,
    "status" "EditStatus" NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB,

    CONSTRAINT "EditHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chat" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "status" "ChatStatus" NOT NULL DEFAULT 'ACTIVE',
    "spreadSheetId" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Chat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "role" "MessageRole" NOT NULL,
    "type" "MessageType" NOT NULL DEFAULT 'TEXT',
    "aiChatRes" JSONB,
    "chatId" TEXT NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE INDEX "SpreadSheet_userId_updatedAt_idx" ON "SpreadSheet"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "SpreadSheet_userId_lastOpened_idx" ON "SpreadSheet"("userId", "lastOpened");

-- CreateIndex
CREATE UNIQUE INDEX "SpreadSheet_userId_id_key" ON "SpreadSheet"("userId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "SpreadSheetData_spreadSheetId_key" ON "SpreadSheetData"("spreadSheetId");

-- CreateIndex
CREATE INDEX "SpreadSheetData_savedAt_idx" ON "SpreadSheetData"("savedAt");

-- CreateIndex
CREATE INDEX "EditHistory_spreadSheetId_sessionStart_idx" ON "EditHistory"("spreadSheetId", "sessionStart");

-- CreateIndex
CREATE INDEX "EditHistory_status_idx" ON "EditHistory"("status");

-- CreateIndex
CREATE INDEX "Chat_userId_status_updatedAt_idx" ON "Chat"("userId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "Chat_spreadSheetId_updatedAt_idx" ON "Chat"("spreadSheetId", "updatedAt");

-- CreateIndex
CREATE INDEX "Message_chatId_createdAt_idx" ON "Message"("chatId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_aiChatRes_idx" ON "Message" USING GIN ("aiChatRes");

-- AddForeignKey
ALTER TABLE "SpreadSheet" ADD CONSTRAINT "SpreadSheet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpreadSheetData" ADD CONSTRAINT "SpreadSheetData_spreadSheetId_fkey" FOREIGN KEY ("spreadSheetId") REFERENCES "SpreadSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditHistory" ADD CONSTRAINT "EditHistory_spreadSheetId_fkey" FOREIGN KEY ("spreadSheetId") REFERENCES "SpreadSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_spreadSheetId_fkey" FOREIGN KEY ("spreadSheetId") REFERENCES "SpreadSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
