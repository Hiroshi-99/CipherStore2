import { supabase } from "./supabase";

export const getAuthHeaders = async () => {
  const session = await supabase.auth.getSession();
  return {
    Authorization: `Bearer ${session.data.session?.access_token}`,
  };
};

export const handleDiscordAuth = async (userId: string, discordId: string) => {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch("/.netlify/functions/discord-user-manager", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify({
        action: "add_to_guild",
        userId,
        discordId,
      }),
    });

    const data = await response.json();
    if (!data.success) {
      console.warn("Failed to add user to guild:", data.error);
    }
  } catch (error) {
    console.error("Error handling Discord auth:", error);
  }
};

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
