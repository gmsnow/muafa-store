-- Transaction note image attachment: stores the Supabase Storage object path only.
ALTER TABLE "customer_transactions" ADD COLUMN "imagePath" TEXT;