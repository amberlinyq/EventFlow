-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'DEAD_LETTER');

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "metadata" JSONB,
    "status" "EventStatus" NOT NULL DEFAULT 'PENDING',
    "processedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "events_status_idx" ON "events"("status");

-- CreateIndex
CREATE INDEX "events_eventType_idx" ON "events"("eventType");

-- CreateIndex
CREATE INDEX "events_createdAt_idx" ON "events"("createdAt");
