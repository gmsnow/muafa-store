import { NextResponse, type NextRequest } from "next/server";

/**
 * Cookie-expiry hop: used when a session LOOKS valid to the stateless edge
 * proxy (JWT signature OK) but fails DB validation (revoked/rotated/wiped).
 * Redirecting straight to /login would ping-pong with the proxy's
 * authed-users-leave-login rule; clearing the cookie first breaks any loop.
 */
export async function GET(request: NextRequest) {
  const next = request.nextUrl.searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const res = NextResponse.redirect(new URL(safeNext, request.url));
  res.cookies.delete("gs_session");
  return res;
}
