import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Contacts and contracts follow the client's visibility, so a hidden client returns nothing. */
export async function listClientContacts(clientId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("client_contacts")
    .select("id, name, job_title, email, phone, is_primary, notes, archived_at")
    .eq("client_id", clientId)
    .order("is_primary", { ascending: false })
    .order("name");
  if (error) throw new Error(`Failed to load contacts: ${error.message}`);
  return data ?? [];
}
export type ContactRow = Awaited<ReturnType<typeof listClientContacts>>[number];

export async function listClientContracts(clientId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("client_contracts")
    .select("id, title, reference, contract_type, status, start_date, end_date, renewal_notice_days, notes, archived_at")
    .eq("client_id", clientId)
    .order("end_date", { ascending: true, nullsFirst: false });
  if (error) throw new Error(`Failed to load contracts: ${error.message}`);
  return data ?? [];
}
export type ContractRow = Awaited<ReturnType<typeof listClientContracts>>[number];
