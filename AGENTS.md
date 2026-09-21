<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Pagination ordering (stability rule)

Any Prisma `skip`/`take` pagination must use a **unique** total ordering, otherwise identical rows appear on multiple pages and others are dropped (sort-key ties like equal `createdAt` make the DB return rows in arbitrary order).

- Always wrap the `orderBy` of a paginated `findMany` in `withIdTiebreak(...)` from `src/shared/core/orderby.ts` (appends `{ id: "desc" }`).
- For `groupBy` pagination (no `id` available), tiebreak on a grouped column, e.g. `orderBy: [{ _max: { createdAt: "desc" } }, { customerId: "asc" }]`.
- Do NOT remove the `id` tiebreaker to "optimize" an index — correctness first, and unique `createdAt` is not guaranteed for any table.
