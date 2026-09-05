CREATE TABLE "SafeDemoBatch" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "requestId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "casesEvaluated" INTEGER NOT NULL DEFAULT 0,
  "actionsExecuted" INTEGER NOT NULL DEFAULT 0,
  "confirmedRecoveryCount" INTEGER NOT NULL DEFAULT 0,
  "confirmedRecoveryAmount" INTEGER NOT NULL DEFAULT 0,
  "declinedOrUnresolved" INTEGER NOT NULL DEFAULT 0,
  "blockedByPolicy" INTEGER NOT NULL DEFAULT 0,
  "unsafeActionsPrevented" INTEGER NOT NULL DEFAULT 0,
  "requiresApproval" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" DATETIME
);

CREATE UNIQUE INDEX "SafeDemoBatch_requestId_key" ON "SafeDemoBatch"("requestId");

CREATE TABLE "SafeDemoBatchCase" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "batchId" TEXT NOT NULL,
  "recoveryCaseId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "result" TEXT NOT NULL DEFAULT 'PENDING',
  "recoveredAmount" INTEGER NOT NULL DEFAULT 0,
  "detail" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "SafeDemoBatchCase_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "SafeDemoBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SafeDemoBatchCase_batchId_recoveryCaseId_key" ON "SafeDemoBatchCase"("batchId", "recoveryCaseId");
CREATE INDEX "SafeDemoBatchCase_recoveryCaseId_idx" ON "SafeDemoBatchCase"("recoveryCaseId");
