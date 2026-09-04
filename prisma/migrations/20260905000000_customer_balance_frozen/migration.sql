-- Freeze customer balance: blocks adding new debt (DEBT/ADJUSTMENT) while enabled.
ALTER TABLE "customers" ADD COLUMN "balanceFrozen" BOOLEAN NOT NULL DEFAULT false;