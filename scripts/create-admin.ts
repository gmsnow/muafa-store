// One-off: create or reset a user in whatever database DATABASE_URL points to.
// Usage:
//   $env:DATABASE_URL = "<connection string>"
//   npx tsx scripts/create-admin.ts                      # admin / admin
//   npx tsx scripts/create-admin.ts <username> <password>
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const [username = "admin", password = "admin"] = process.argv.slice(2);

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Run:  $env:DATABASE_URL = \"<connection string>\"");
  process.exit(1);
}
if (password.length < 8) {
  console.warn(`⚠ Weak password (${password.length} chars) — fine for local testing, risky on a public URL.`);
}

const db = new PrismaClient({
  adapter: new PrismaPg(process.env.DATABASE_URL, { schema: "public" }),
});

async function main() {
  let role = await db.role.findUnique({ where: { name: "SUPER_ADMIN" } });
  const { PERMISSIONS } = await import("../src/shared/auth/rbac");

  // Ensure every permission row exists (empty on a freshly migrated DB).
  await db.permission.createMany({
    data: PERMISSIONS.map((p) => ({ key: p.key, description: p.description, group: p.group })),
    skipDuplicates: true,
  });

  if (!role) {
    role = await db.role.create({ data: { name: "SUPER_ADMIN", isSystem: true } });
  }
  // Grant all permissions idempotently.
  await db.rolePermission.createMany({
    data: PERMISSIONS.map((p) => ({ roleId: role!.id, permissionKey: p.key })),
    skipDuplicates: true,
  });

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await db.user.upsert({
    where: { username },
    update: {
      passwordHash,
      status: "ACTIVE",
      failedLoginAttempts: 0,
      lockedUntil: null,
      deletedAt: null,
    },
    create: {
      username,
      email: null,
      passwordHash,
      fullName: username,
      fullNameAr: null,
      roleId: role.id,
      status: "ACTIVE",
    },
  });

  console.log(`✓ User ready — login with "${user.username}" / "${password}"`);
}

main()
  .then(async () => { await db.$disconnect(); process.exit(0); })
  .catch(async (err) => { console.error(err); await db.$disconnect(); process.exit(1); });
