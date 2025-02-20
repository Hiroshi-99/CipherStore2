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

export async function isAdmin(userId: string): Promise<boolean> {
  try {
    // First check if user is the owner
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return false;

    if (user.user_metadata?.sub === import.meta.env.VITE_OWNER_ID) {
      // Auto-add owner to admin_users if not already there
      const { data: existingAdmin } = await supabase
        .from("admin_users")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      if (!existingAdmin) {
        await supabase
          .from("admin_users")
          .insert([{ user_id: userId }])
          .select()
          .single();
      }
      return true;
    }

    // Then check admin_users table
    const { data: adminUser } = await supabase
      .from("admin_users")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    return !!adminUser;
  } catch (error) {
    console.error("Error checking admin status:", error);
    return false;
  }
}
