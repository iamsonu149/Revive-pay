-- CreateTable
CREATE TABLE "RecoveryAnalysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recoveryCaseId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "source" TEXT,
    "model" TEXT,
    "requestedModel" TEXT,
    "promptVersion" TEXT NOT NULL,
    "evidenceFingerprint" TEXT NOT NULL,
    "evidenceJson" TEXT NOT NULL,
    "analysisJson" TEXT,
    "policyJson" TEXT,
    "fallbackReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "RecoveryAnalysis_recoveryCaseId_fkey" FOREIGN KEY ("recoveryCaseId") REFERENCES "RecoveryCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AnalysisBudget" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'merchant',
    "windowStart" DATETIME NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 0
);

-- CreateIndex
CREATE UNIQUE INDEX "RecoveryAnalysis_requestId_key" ON "RecoveryAnalysis"("requestId");

-- CreateIndex
CREATE INDEX "RecoveryAnalysis_recoveryCaseId_createdAt_idx" ON "RecoveryAnalysis"("recoveryCaseId", "createdAt");
