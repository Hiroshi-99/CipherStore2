import { supabase } from "./supabase";
import { safeInsert } from "./database";

/**
 * Checks if a user has admin privileges
 * @param userId The user ID to check
 * @returns True if the user is an admin, false otherwise
 */
export async function checkIfAdmin(userId: string) {
  try {
    // First check the admin_users table
    const { data: adminData, error: adminError } = await supabase
      .from("admin_users")
      .select("id")
      .eq("user_id", userId)
      .single();

    if (!adminError && adminData) {
      return true;
    }

    // Then check user metadata through a serverless function
    try {
      const { data, error } = await fetch(
        "/.netlify/functions/check-admin-status",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ userId }),
        }
      ).then((res) => res.json());

      if (!error && data?.isAdmin) {
        return true;
      }
    } catch (fnError) {
      console.error("Error checking admin via function:", fnError);
    }

    // Check against known admin IDs as fallback
    const knownAdminIds = [
      "febded26-f3f6-4aec-9668-b6898de96ca3",
      // Add other admin IDs as needed
    ];

    return knownAdminIds.includes(userId);
  } catch (err) {
    console.error("Error checking admin status:", err);
    return false;
  }
}

/**
 * Grants admin privileges to a user
 * @param adminUserId The admin performing the action
 * @param targetUserId The user to grant admin privileges to
 * @returns Success or error information
 */
export async function grantAdminPrivileges(
  adminUserId: string,
  targetUserId: string
) {
  try {
    // First verify the requesting user is an admin
    const isAdmin = await checkIfAdmin(adminUserId);
    if (!isAdmin) {
      return {
        success: false,
        error: "Unauthorized: Only admins can grant admin privileges",
      };
    }

    // Add to admin_users table
    const { data, error } = await safeInsert("admin_users", {
      user_id: targetUserId,
      granted_by: adminUserId,
      granted_at: new Date().toISOString(),
    });

    if (error) {
      return {
        success: false,
        error: `Failed to grant admin privileges: ${error.message}`,
      };
    }

    return { success: true, data };
  } catch (err) {
    console.error("Error granting admin privileges:", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

/**
 * Revokes admin privileges from a user
 * @param adminUserId The admin performing the action
 * @param targetUserId The user to revoke admin privileges from
 * @returns Success or error information
 */
export async function revokeAdminPrivileges(
  adminUserId: string,
  targetUserId: string
) {
  try {
    // First verify the requesting user is an admin
    const isAdmin = await checkIfAdmin(adminUserId);
    if (!isAdmin) {
      return {
        success: false,
        error: "Unauthorized: Only admins can revoke admin privileges",
      };
    }

    // Remove from admin_users table
    const { error } = await supabase
      .from("admin_users")
      .delete()
      .eq("user_id", targetUserId);

    if (error) {
      return {
        success: false,
        error: `Failed to revoke admin privileges: ${error.message}`,
      };
    }

    return { success: true };
  } catch (err) {
    console.error("Error revoking admin privileges:", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

/**
 * Fetches all users with admin status information
 * @param adminUserId The admin requesting the user list
 * @returns List of users with admin status
 */
export async function fetchUsersWithAdminStatus(adminUserId: string) {
  try {
    // First verify the requesting user is an admin
    const isAdmin = await checkIfAdmin(adminUserId);
    if (!isAdmin) {
      return {
        success: false,
        error: "Unauthorized: Only admins can view all users",
      };
    }

    // Call the serverless function to get users
    try {
      const response = await fetch("/.netlify/functions/admin-list-users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ adminUserId }),
      });

      const result = await response.json();

      if (result.error) {
        return {
          success: false,
          error: result.error,
        };
      }

      return {
        success: true,
        data: result.data,
      };
    } catch (fnError) {
      console.error("Error fetching users via function:", fnError);

      // Fallback to just getting admin status from the admin_users table
      const { data: users, error: usersError } = await supabase
        .from("profiles")
        .select("id, email, full_name, created_at");

      if (usersError) {
        return {
          success: false,
          error: `Failed to fetch users: ${usersError.message}`,
        };
      }

      // Get all admin users
      const { data: adminUsers, error: adminError } = await supabase
        .from("admin_users")
        .select("user_id");

      if (adminError) {
        return {
          success: false,
          error: `Failed to fetch admin users: ${adminError.message}`,
        };
      }

      // Create a set of admin user IDs for quick lookup
      const adminUserIds = new Set(
        (adminUsers || []).map((admin) => admin.user_id)
      );

      // Combine the data
      const usersWithAdminStatus = (users || []).map((user) => ({
        id: user.id,
        email: user.email,
        fullName: user.full_name || "",
        isAdmin: adminUserIds.has(user.id),
        lastSignIn: null,
        createdAt: user.created_at,
      }));

      return { success: true, data: usersWithAdminStatus };
    }
  } catch (err) {
    console.error("Error fetching users with admin status:", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}
