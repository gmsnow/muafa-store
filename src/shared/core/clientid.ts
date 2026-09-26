// Idempotency keys are `crypto.randomUUID()` at every client. A tombstone that
// stores anything else (a truncated prefix, a hand-typed snippet) silently
// defeats the exact-match DELETED_KEY guard and lets a stale offline replay
// resurrect the removed row (observed live: "f2f5ee4f" vs the full UUID). Fail
// loudly at seal-write time instead of writing a seal that can never match.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidClientId(key: string): boolean {
  return UUID_RE.test(key);
}

export function assertValidClientId(key: string): void {
  if (!isValidClientId(key)) {
    throw new Error(
      `Refusing to tombstone malformed idempotency key "${key}" (must be a full UUID)`,
    );
  }
}