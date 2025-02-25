import { supabase } from "../lib/supabase";

// Function to get an admin user ID with fallback
export const getAdminUserId = async (): Promise<string> => {
  try {
    // Try to get an admin user from the users table
    const { data: adminUsers, error } = await supabase
      .from("users")
      .select("id")
      .eq("is_admin", true)
      .limit(1);

    if (error) {
      console.error("Error fetching admin user:", error);
      throw error;
    }

    // If we found an admin user, return their ID
    if (adminUsers && adminUsers.length > 0) {
      return adminUsers[0].id;
    }

    // If no admin users found, try to get the current user
    const { data: userData } = await supabase.auth.getUser();
    if (userData?.user?.id) {
      return userData.user.id;
    }

    // Last resort fallback
    return "00000000-0000-0000-0000-000000000000";
  } catch (err) {
    console.error("Error in getAdminUserId:", err);
    // Fallback to a default UUID
    return "00000000-0000-0000-0000-000000000000";
  }
};
