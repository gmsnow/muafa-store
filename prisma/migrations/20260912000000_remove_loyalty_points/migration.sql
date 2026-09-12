-- DropForeignKey
ALTER TABLE "loyalty_transactions" DROP CONSTRAINT "loyalty_transactions_customerId_fkey";

-- DropIndex
DROP INDEX "loyalty_transactions_customerId_createdAt_idx";

-- DropTable
DROP TABLE "loyalty_transactions";

-- DropEnum
DROP TYPE "loyalty_transaction_type";

-- AlterTable
ALTER TABLE "customers" DROP COLUMN "loyaltyPoints";

-- AlterTable
ALTER TABLE "sales"
DROP COLUMN "loyaltyPointsEarned",
DROP COLUMN "loyaltyPointsRedeemed";

-- AlterTable
ALTER TABLE "system_settings"
DROP COLUMN "enableLoyalty",
DROP COLUMN "loyaltyEarnPerSpent",
DROP COLUMN "loyaltyPointValue";