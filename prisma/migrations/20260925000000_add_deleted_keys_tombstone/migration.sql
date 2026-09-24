-- Tombstone for idempotency keys whose ledger row was deliberately removed.
-- When a customer transaction is deleted (duplicate purge, manual delete,
-- clear-account) its clientId is recorded here so an offline outbox replay or
-- mobile resubmit carrying that same key is recognized as the removed operation
-- and dropped — it must never resurrect the deleted row.
CREATE TABLE "deleted_keys" (
    "clientId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    CONSTRAINT "deleted_keys_pkey" PRIMARY KEY ("clientId")
);