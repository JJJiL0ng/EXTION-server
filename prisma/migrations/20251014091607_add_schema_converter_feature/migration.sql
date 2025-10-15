-- CreateTable
CREATE TABLE "SchemaConverterWorkflow" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "SchemaConverterWorkflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceSheetVersion" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workflowId" TEXT NOT NULL,
    "parentId" TEXT,

    CONSTRAINT "SourceSheetVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TargetSheetVersion" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workflowId" TEXT NOT NULL,
    "parentId" TEXT,

    CONSTRAINT "TargetSheetVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowCode" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workflowId" TEXT NOT NULL,
    "parentId" TEXT,

    CONSTRAINT "WorkflowCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppliedConvertingSheet" (
    "id" TEXT NOT NULL,
    "resultData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workflowId" TEXT NOT NULL,
    "sourceSheetVersionId" TEXT NOT NULL,
    "targetSheetVersionId" TEXT NOT NULL,
    "workflowCodeId" TEXT NOT NULL,

    CONSTRAINT "AppliedConvertingSheet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SchemaConverterWorkflow_userId_idx" ON "SchemaConverterWorkflow"("userId");

-- CreateIndex
CREATE INDEX "SourceSheetVersion_workflowId_idx" ON "SourceSheetVersion"("workflowId");

-- CreateIndex
CREATE INDEX "SourceSheetVersion_parentId_idx" ON "SourceSheetVersion"("parentId");

-- CreateIndex
CREATE INDEX "TargetSheetVersion_workflowId_idx" ON "TargetSheetVersion"("workflowId");

-- CreateIndex
CREATE INDEX "TargetSheetVersion_parentId_idx" ON "TargetSheetVersion"("parentId");

-- CreateIndex
CREATE INDEX "WorkflowCode_workflowId_idx" ON "WorkflowCode"("workflowId");

-- CreateIndex
CREATE INDEX "WorkflowCode_parentId_idx" ON "WorkflowCode"("parentId");

-- CreateIndex
CREATE INDEX "AppliedConvertingSheet_workflowId_idx" ON "AppliedConvertingSheet"("workflowId");

-- CreateIndex
CREATE INDEX "AppliedConvertingSheet_sourceSheetVersionId_idx" ON "AppliedConvertingSheet"("sourceSheetVersionId");

-- CreateIndex
CREATE INDEX "AppliedConvertingSheet_targetSheetVersionId_idx" ON "AppliedConvertingSheet"("targetSheetVersionId");

-- CreateIndex
CREATE INDEX "AppliedConvertingSheet_workflowCodeId_idx" ON "AppliedConvertingSheet"("workflowCodeId");

-- CreateIndex
CREATE INDEX "AppliedConvertingSheet_createdAt_idx" ON "AppliedConvertingSheet"("createdAt");

-- AddForeignKey
ALTER TABLE "SchemaConverterWorkflow" ADD CONSTRAINT "SchemaConverterWorkflow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceSheetVersion" ADD CONSTRAINT "SourceSheetVersion_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "SchemaConverterWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceSheetVersion" ADD CONSTRAINT "SourceSheetVersion_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "SourceSheetVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TargetSheetVersion" ADD CONSTRAINT "TargetSheetVersion_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "SchemaConverterWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TargetSheetVersion" ADD CONSTRAINT "TargetSheetVersion_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "TargetSheetVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowCode" ADD CONSTRAINT "WorkflowCode_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "SchemaConverterWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowCode" ADD CONSTRAINT "WorkflowCode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "WorkflowCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppliedConvertingSheet" ADD CONSTRAINT "AppliedConvertingSheet_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "SchemaConverterWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppliedConvertingSheet" ADD CONSTRAINT "AppliedConvertingSheet_sourceSheetVersionId_fkey" FOREIGN KEY ("sourceSheetVersionId") REFERENCES "SourceSheetVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppliedConvertingSheet" ADD CONSTRAINT "AppliedConvertingSheet_targetSheetVersionId_fkey" FOREIGN KEY ("targetSheetVersionId") REFERENCES "TargetSheetVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppliedConvertingSheet" ADD CONSTRAINT "AppliedConvertingSheet_workflowCodeId_fkey" FOREIGN KEY ("workflowCodeId") REFERENCES "WorkflowCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
