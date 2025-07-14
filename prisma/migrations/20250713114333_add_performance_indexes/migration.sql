-- CreateIndex
CREATE INDEX "Chat_userId_status_updatedAt_idx" ON "Chat"("userId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "Message_chatId_timestamp_idx" ON "Message"("chatId", "timestamp");

-- CreateIndex
CREATE INDEX "SheetMetaData_userId_fileName_createdAt_idx" ON "SheetMetaData"("userId", "fileName", "createdAt");

-- CreateIndex
CREATE INDEX "SpreadSheetMetaData_userId_fileName_chatId_idx" ON "SpreadSheetMetaData"("userId", "fileName", "chatId");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");
