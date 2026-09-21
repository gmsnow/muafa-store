-- Idempotent offline replay: client-generated key so a retried (at-least-once)
-- outbox flush never records a duplicate customer txn or sale.
ALTER TABLE "customer_transactions" ADD COLUMN "clientId" TEXT;
CREATE UNIQUE INDEX "customer_transactions_clientId_key" ON "customer_transactions"("clientId");

ALTER TABLE "sales" ADD COLUMN "clientId" TEXT;
CREATE UNIQUE INDEX "sales_clientId_key" ON "sales"("clientId");