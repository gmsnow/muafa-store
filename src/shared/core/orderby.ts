/**
 * Deterministic ordering for skip/take pagination.
 *
 * Prisma findMany pagination (skip/take) is only stable when the sort key is
 * unique. Ordering by e.g. `createdAt` alone silently duplicates rows on one
 * page and drops them on the next when multiple records share the timestamp —
 * Postgres returns ties in an arbitrary order that can differ per query.
 *
 * Always pass the orderBy through this helper. Unless `id` is already part of
 * the sort, it appends `{ id: "desc" }` (id is unique in every model) so the
 * total order is fixed and each row appears on exactly one page.
 *
 * ```ts
 * db.sale.findMany({
 *   where,
 *   orderBy: withIdTiebreak({ saleDate: "desc" }),
 *   skip: (page - 1) * pageSize,
 *   take: pageSize,
 * });
 * ```
 */
export function withIdTiebreak<T extends Record<string, unknown>>(
  orderBy: T | T[],
): (T | { id: "desc" })[] {
  const list: (T | { id: "desc" })[] = Array.isArray(orderBy) ? [...orderBy] : [orderBy];
  if (!list.some((o) => "id" in o)) list.push({ id: "desc" });
  return list;
}