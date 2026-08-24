// Mint a valid gs_session cookie for HTTP smoke tests: npx tsx scripts/mint-session.ts [username]
import "dotenv/config";
import { randomUUID, createHash } from "crypto";
import { SignJWT } from "jose";
import { db } from "../src/shared/db";

async function main() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET missing");
  const username = process.argv[2] ?? "superadmin";
  const user = await db.user.findFirstOrThrow({ where: { username } });
  const sid = randomUUID();
  await db.session.create({
    data: {
      userId: user.id,
      tokenHash: createHash("sha256").update(sid).digest("hex"),
      expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
    },
  });
  const token = await new SignJWT({ sid })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 8 * 60 * 60)
    .sign(new TextEncoder().encode(secret));
  console.log(token);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
