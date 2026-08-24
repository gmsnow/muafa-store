import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  // pg does not understand Prisma's ?schema= convention — strip it and pass explicitly.
  const pgUrl = url.replace(/\?schema=[^&]*$/, "");
  const adapter = new PrismaPg(pgUrl, { schema: "public" });
  return new PrismaClient({ adapter, log: ["warn", "error"] });
}

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
