-- AlterTable
ALTER TABLE "WorkflowCode" ADD COLUMN     "generatedByChatId" TEXT;

-- CreateTable
CREATE TABLE "SchemaConverterChat" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchemaConverterChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchemaConverterMessage" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "SchemaConverterMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SchemaConverterChat_workflowId_key" ON "SchemaConverterChat"("workflowId");

-- CreateIndex
CREATE INDEX "SchemaConverterChat_workflowId_idx" ON "SchemaConverterChat"("workflowId");

-- CreateIndex
CREATE INDEX "SchemaConverterMessage_chatId_idx" ON "SchemaConverterMessage"("chatId");

-- CreateIndex
CREATE INDEX "SchemaConverterMessage_createdAt_idx" ON "SchemaConverterMessage"("createdAt");

-- CreateIndex
CREATE INDEX "WorkflowCode_generatedByChatId_idx" ON "WorkflowCode"("generatedByChatId");

-- AddForeignKey
ALTER TABLE "WorkflowCode" ADD CONSTRAINT "WorkflowCode_generatedByChatId_fkey" FOREIGN KEY ("generatedByChatId") REFERENCES "SchemaConverterChat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchemaConverterChat" ADD CONSTRAINT "SchemaConverterChat_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "SchemaConverterWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchemaConverterMessage" ADD CONSTRAINT "SchemaConverterMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "SchemaConverterChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
