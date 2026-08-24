import "server-only";
import { db } from "@/shared/db";
import { money } from "@/shared/core/money";

export interface SearchResults {
  products: { id: string; name: string; nameAr: string | null; sku: string; stock: number }[];
  customers: { id: string; code: string; name: string; balance: number }[];
  suppliers: { id: string; code: string; name: string }[];
  invoices: { id: string; invoiceNumber: string; total: number; customerName: string | null }[];
  purchases: { id: string; purchaseNumber: string; total: number; supplierName: string }[];
  purchaseOrders: { id: string; poNumber: string; supplierName: string }[];
  expenses: { id: string; expenseNumber: string; amount: number; description: string | null }[];
  users: { id: string; username: string; fullName: string }[];
}

const EMPTY: SearchResults = {
  products: [], customers: [], suppliers: [], invoices: [],
  purchases: [], purchaseOrders: [], expenses: [], users: [],
};

/** Cross-domain lookup for the top-bar command palette (top 5 per group). */
export async function globalSearch(q: string): Promise<SearchResults> {
  const term = q.trim();
  if (term.length < 2) return EMPTY;

  const [
    products, customers, suppliers, invoices,
    purchases, purchaseOrders, expenses, users,
  ] = await Promise.all([
    db.product.findMany({
      where: {
        deletedAt: null,
        OR: [
          { name: { contains: term, mode: "insensitive" } },
          { nameAr: { contains: term } },
          { sku: { contains: term, mode: "insensitive" } },
          { barcode: { contains: term } },
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
          { company: { contains: term, mode: "insensitive" } },
          { phone: { contains: term } },
        ],
      },
      select: { id: true, code: true, name: true },
      take: 5,
      orderBy: { name: "asc" },
    }),
    // Sales match by invoice number, customer, or notes.
    db.sale.findMany({
      where: {
        status: { not: "CANCELLED" },
        OR: [
          { invoiceNumber: { startsWith: term, mode: "insensitive" } },
          { customer: { is: { OR: [
            { name: { contains: term, mode: "insensitive" } },
            { nameAr: { contains: term } },
            { phone: { contains: term } },
          ] } } },
          { notes: { contains: term, mode: "insensitive" } },
        ],
      },
      select: { id: true, invoiceNumber: true, total: true, customer: { select: { name: true } } },
      take: 5,
      orderBy: { saleDate: "desc" },
    }),
    db.purchase.findMany({
      where: {
        OR: [
          { purchaseNumber: { startsWith: term, mode: "insensitive" } },
          { supplier: { is: { OR: [
            { name: { contains: term, mode: "insensitive" } },
            { nameAr: { contains: term } },
            { company: { contains: term, mode: "insensitive" } },
            { phone: { contains: term } },
          ] } } },
          { notes: { contains: term, mode: "insensitive" } },
        ],
      },
      select: {
        id: true, purchaseNumber: true, total: true,
        supplier: { select: { name: true, nameAr: true } },
      },
      take: 5,
      orderBy: { date: "desc" },
    }),
    db.purchaseOrder.findMany({
      where: {
        OR: [
          { poNumber: { startsWith: term, mode: "insensitive" } },
          { supplier: { is: { OR: [
            { name: { contains: term, mode: "insensitive" } },
            { nameAr: { contains: term } },
            { company: { contains: term, mode: "insensitive" } },
          ] } } },
          { notes: { contains: term, mode: "insensitive" } },
        ],
      },
      select: { id: true, poNumber: true, supplier: { select: { name: true, nameAr: true } } },
      take: 5,
      orderBy: { orderDate: "desc" },
    }),
    db.expense.findMany({
      where: {
        OR: [
          { expenseNumber: { startsWith: term, mode: "insensitive" } },
          { description: { contains: term, mode: "insensitive" } },
          { notes: { contains: term, mode: "insensitive" } },
        ],
      },
      select: { id: true, expenseNumber: true, amount: true, description: true },
      take: 5,
      orderBy: { expenseDate: "desc" },
    }),
    db.user.findMany({
      where: {
        deletedAt: null,
        OR: [
          { username: { contains: term, mode: "insensitive" } },
          { fullName: { contains: term, mode: "insensitive" } },
          { fullNameAr: { contains: term } },
          { phone: { contains: term } },
        ],
      },
      select: { id: true, username: true, fullName: true, fullNameAr: true },
      take: 5,
      orderBy: { username: "asc" },
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
    purchases: purchases.map((p) => ({
      id: p.id, purchaseNumber: p.purchaseNumber,
      supplierName: p.supplier?.nameAr || p.supplier?.name || "",
      total: money(p.total).toNumber(),
    })),
    purchaseOrders: purchaseOrders.map((p) => ({
      id: p.id, poNumber: p.poNumber,
      supplierName: p.supplier?.nameAr || p.supplier?.name || "",
    })),
    expenses: expenses.map((e) => ({
      id: e.id, expenseNumber: e.expenseNumber,
      amount: money(e.amount).toNumber(), description: e.description,
    })),
    users: users.map((u) => ({
      id: u.id, username: u.username,
      fullName: u.fullNameAr && u.fullName ? `${u.fullName} — ${u.fullNameAr}` : u.fullName,
    })),
  };
}
