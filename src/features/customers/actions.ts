"use server";

import { guard, ok } from "@/shared/core/api-response";
import { requirePermission } from "@/features/auth/session";
import {
  saveCustomer, softDeleteCustomer, getCustomerForEdit,
  listGroups, saveGroup, deleteGroup,
  recordCustomerTxn, listCustomerTransactions, getStatement,
  adjustLoyalty, deleteCustomerTxnsByMonth,
} from "./service";

export async function saveCustomerAction(id: string | null, raw: unknown) {
  return guard(async () => {
    if (id) await requirePermission("customers.update");
    else await requirePermission("customers.create");
    const c = await saveCustomer(id, raw);
    return ok({ id: c.id, code: c.code });
  });
}

export async function customerEditAction(id: string) {
  return guard(async () => {
    await requirePermission("customers.view");
    const c = await getCustomerForEdit(id);
    return ok({
      id: c.id, name: c.name, nameAr: c.nameAr, phone: c.phone, email: c.email,
      address: c.address, groupId: c.groupId ?? "", creditLimit: String(c.creditLimit),
      notes: c.notes,
    });
  });
}

export async function deleteCustomerAction(id: string) {
  return guard(async () => {
    await requirePermission("customers.update");
    await softDeleteCustomer(id);
    return ok({ deleted: true });
  });
}

export async function groupListAction() {
  return guard(async () => {
    await requirePermission("customers.view");
    return ok(await listGroups());
  });
}

export async function saveGroupAction(id: string | null, raw: unknown) {
  return guard(async () => {
    await requirePermission("customers.update");
    return ok(await saveGroup(id, raw));
  });
}

export async function deleteGroupAction(id: string) {
  return guard(async () => {
    await requirePermission("customers.update");
    await deleteGroup(id);
    return ok({ deleted: true });
  });
}

export async function recordCustomerTxnAction(raw: unknown) {
  return guard(async () => {
    const user = await requirePermission("customers.credit");
    return ok(await recordCustomerTxn(user.id, raw));
  });
}

export async function deleteCustomerTxnsMonthAction(raw: { month: string; customerId?: string }) {
  return guard(async () => {
    const user = await requirePermission("customers.credit");
    return ok(await deleteCustomerTxnsByMonth(user.id, raw));
  });
}

export async function customerTxnListAction(customerId?: string) {
  return guard(async () => {
    await requirePermission("customers.view");
    return ok(await listCustomerTransactions({ customerId }));
  });
}

export async function statementAction(customerId: string) {
  return guard(async () => {
    await requirePermission("customers.view");
    return ok(await getStatement(customerId));
  });
}

export async function adjustLoyaltyAction(raw: unknown) {
  return guard(async () => {
    const user = await requirePermission("customers.loyalty");
    return ok(await adjustLoyalty({ ...(raw as Record<string, unknown>), userId: user.id } as Parameters<typeof adjustLoyalty>[0]));
  });
}
