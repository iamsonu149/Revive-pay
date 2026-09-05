-- Add provider identity to subscriptions and payment attempts.
ALTER TABLE "Subscription" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'mock';
ALTER TABLE "Subscription" ADD COLUMN "providerSubscriptionId" TEXT;
ALTER TABLE "PaymentAttempt" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'mock';
ALTER TABLE "PaymentAttempt" ADD COLUMN "providerPaymentId" TEXT;
ALTER TABLE "PaymentAttempt" ADD COLUMN "providerOrderId" TEXT;

-- Persist provider outcome metadata on the already-unique recovery execution.
ALTER TABLE "RecoveryExecution" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'mock';
ALTER TABLE "RecoveryExecution" ADD COLUMN "providerStatus" TEXT;
ALTER TABLE "RecoveryExecution" ADD COLUMN "recoveryUrl" TEXT;
ALTER TABLE "RecoveryExecution" ADD COLUMN "lastErrorCode" TEXT;

-- Store only bounded metadata and a payload fingerprint, never raw webhook bodies.
CREATE TABLE "ProviderWebhookEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT,
    "eventType" TEXT NOT NULL,
    "signatureValid" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "recoveryCaseId" TEXT,
    "errorCode" TEXT,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" DATETIME,
    CONSTRAINT "ProviderWebhookEvent_recoveryCaseId_fkey" FOREIGN KEY ("recoveryCaseId") REFERENCES "RecoveryCase" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Subscription_provider_providerSubscriptionId_key" ON "Subscription"("provider", "providerSubscriptionId");
CREATE UNIQUE INDEX "PaymentAttempt_provider_providerPaymentId_key" ON "PaymentAttempt"("provider", "providerPaymentId");
CREATE INDEX "RecoveryExecution_provider_providerReference_idx" ON "RecoveryExecution"("provider", "providerReference");
CREATE INDEX "ProviderWebhookEvent_provider_providerEventId_idx" ON "ProviderWebhookEvent"("provider", "providerEventId");
CREATE INDEX "ProviderWebhookEvent_recoveryCaseId_receivedAt_idx" ON "ProviderWebhookEvent"("recoveryCaseId", "receivedAt");
