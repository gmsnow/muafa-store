import "server-only";
import { db } from "@/shared/db";
import { money } from "@/shared/core/money";

export interface SearchResults {
  products: { id: string; name: string; nameAr: string | null; sku: string; stock: number }[];
  customers: { id: string; code: string; name: string; balance: number }[];
  suppliers: { id: string; code: string; name: string }[];
  invoices: { id: string; invoiceNumber: string; total: number; customerName: string | null }[];
}

/** Cross-domain lookup for the top-bar command palette (top 5 per group). */
export async function globalSearch(q: string): Promise<SearchResults> {
  const term = q.trim();
  if (term.length < 2) {
    return { products: [], customers: [], suppliers: [], invoices: [] };
  }

  const [products, customers, suppliers, invoices] = await Promise.all([
    db.product.findMany({
      where: {
        deletedAt: null,
        OR: [
          { name: { contains: term, mode: "insensitive" } },
          { nameAr: { contains: term } },
          { sku: { contains: term, mode: "insensitive" } },
          { barcode: { equals: term } },
        ],
      },
      select: { id: true, name: true, nameAr: true, sku: true, inventory: { select: { quantity: true } } },
      take: 5,
      orderBy: { name: "asc" },
    }),
    db.customer.findMany({
      where: {
        deletedAt: null,
        OR: [
          { name: { contains: term, mode: "insensitive" } },
          { nameAr: { contains: term } },
          { code: { contains: term, mode: "insensitive" } },
          { phone: { contains: term } },
        ],
      },
      select: { id: true, code: true, name: true, nameAr: true, balance: true },
      take: 5,
      orderBy: { name: "asc" },
    }),
    db.supplier.findMany({
      where: {
        deletedAt: null,
        OR: [
          { name: { contains: term, mode: "insensitive" } },
          { nameAr: { contains: term } },
          { code: { contains: term, mode: "insensitive" } },
        ],
      },
      select: { id: true, code: true, name: true },
      take: 5,
      orderBy: { name: "asc" },
    }),
    db.sale.findMany({
      where: {
        status: { not: "CANCELLED" },
        invoiceNumber: { startsWith: term, mode: "insensitive" },
      },
      select: { id: true, invoiceNumber: true, total: true, customer: { select: { name: true } } },
      take: 5,
      orderBy: { saleDate: "desc" },
    }),
  ]);

  return {
    products: products.map((p) => ({
      id: p.id, name: p.name, nameAr: p.nameAr, sku: p.sku,
      stock: Number(p.inventory?.quantity ?? 0),
    })),
    customers: customers.map((c) => ({
      id: c.id, code: c.code, name: c.nameAr && c.name ? `${c.name} — ${c.nameAr}` : c.name,
      balance: Number(c.balance),
    })),
    suppliers,
    invoices: invoices.map((s) => ({
      id: s.id, invoiceNumber: s.invoiceNumber, customerName: s.customer?.name ?? null,
      total: money(s.total).toNumber(),
    })),
  };
}
