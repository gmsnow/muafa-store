-- Performance indexes (see schema.prisma @@index changes in the same commit).
-- Only additive/redundant-index DDL — no table or column changes.

-- Sale: invoiceNumber already has a UNIQUE constraint; explicit index was pure write overhead.
DROP INDEX IF EXISTS "sales_invoiceNumber_idx";

-- Sale: dashboards/reports filter status IN (...) + saleDate range; listSales filters cashier + sorts by date.
DROP INDEX IF EXISTS "sales_status_idx";
CREATE INDEX "sales_status_saleDate_idx" ON "sales"("status", "saleDate");

DROP INDEX IF EXISTS "sales_cashierId_idx";
CREATE INDEX "sales_cashierId_saleDate_idx" ON "sales"("cashierId", "saleDate");

-- Notification: bell query orders isRead ASC, createdAt DESC.
DROP INDEX IF EXISTS "notifications_isRead_createdAt_idx";
CREATE INDEX "notifications_isRead_createdAt_idx" ON "notifications"("isRead", "createdAt" DESC);

-- Product: hot catalog pattern WHERE deletedAt IS NULL ORDER BY createdAt DESC
CREATE INDEX "products_deletedAt_createdAt_idx" ON "products"("deletedAt", "createdAt" DESC);

-- ProductBatch: FEFO consumption WHERE productId = ? AND quantity > 0 ORDER BY expiryDate, createdAt.
-- Single-column productId index is covered by this composite's left prefix.
DROP INDEX IF EXISTS "product_batches_productId_idx";
CREATE INDEX "product_batches_productId_expiryDate_createdAt_idx" ON "product_batches"("productId", "expiryDate", "createdAt");

-- CustomerTransaction: month-filtered listings without a customerId prefix.
CREATE INDEX "customer_transactions_createdAt_idx" ON "customer_transactions"("createdAt");
