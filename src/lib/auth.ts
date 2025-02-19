import { supabase } from "./supabase";

export async function getAuthHeaders() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("No active session");
  }

  return {
    Authorization: `Bearer ${session.access_token}`,
  };
}
