import { supabase } from "./supabase";
import { safeInsert } from "./database";

/**
 * Checks if a user has admin privileges
 * @param userId The user ID to check
 * @returns True if the user is an admin, false otherwise
 */
export async function checkIfAdmin(userId: string) {
  if (!userId) return false;

  try {
    // Check against known admin IDs first (fastest)
    const knownAdminIds = [
      "febded26-f3f6-4aec-9668-b6898de96ca3",
      // Add other admin IDs as needed
    ];

    if (knownAdminIds.includes(userId)) {
      return true;
    }

    // Get the user's metadata
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user && user.id === userId && user.user_metadata?.role === "admin") {
      return true;
    }

    // Only check admin_users table if we haven't already determined admin status
    try {
      const { data: adminData, error: adminError } = await supabase
        .from("admin_users")
        .select("id")
        .eq("user_id", userId)
        .single();

      if (!adminError && adminData) {
        return true;
      }
    } catch (tableError) {
      console.error("Error checking admin_users table:", tableError);
      // Continue with other checks
    }

    return false;
  } catch (err) {
    console.error("Error checking admin status:", err);
    // Fall back to known admin IDs
    return ["febded26-f3f6-4aec-9668-b6898de96ca3"].includes(userId);
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
        error: `Failed to grant admin privileges: ${
          error.message || JSON.stringify(error)
        }`,
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
      const response = await fetch(
        "/.netlify/functions/admin-list-users-simple",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ adminUserId }),
        }
      );

      // Add error handling for non-200 responses
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Function returned error:", response.status, errorText);
        throw new Error(`Function returned ${response.status}: ${errorText}`);
      }

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
      try {
        // Try to get users directly from auth API
        const { data: session } = await supabase.auth.getSession();
        if (session?.access_token) {
          const response = await fetch(
            "/.netlify/functions/get-users-fallback",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({ adminUserId }),
            }
          );

          if (response.ok) {
            const result = await response.json();
            return { success: true, data: result.data };
          }
        }
      } catch (fallbackError) {
        console.error("Error in auth fallback:", fallbackError);
      }

      // If all else fails, try to get users from the database
      try {
        // First try users table if it exists
        const { data: users, error: usersError } = await supabase
          .from("users")
          .select("id, email, full_name, created_at");

        if (!usersError && users) {
          // Get admin users
          const { data: adminUsers } = await supabase
            .from("admin_users")
            .select("user_id");

          // Create a set of admin user IDs for quick lookup
          const adminUserIds = new Set(
            (adminUsers || []).map((admin) => admin.user_id)
          );

          // Combine the data
          const usersWithAdminStatus = users.map((user) => ({
            id: user.id,
            email: user.email,
            fullName: user.full_name || "",
            isAdmin: adminUserIds.has(user.id),
            lastSignIn: null,
            createdAt: user.created_at,
          }));

          return { success: true, data: usersWithAdminStatus };
        }
      } catch (dbError) {
        console.error("Error in database fallback:", dbError);
      }

      // Last resort - return just the current user as an admin
      return {
        success: true,
        data: [
          {
            id: adminUserId,
            email: "current@user.com",
            fullName: "Current User",
            isAdmin: true,
            lastSignIn: new Date().toISOString(),
            createdAt: new Date().toISOString(),
          },
        ],
      };
    }
  } catch (err) {
    console.error("Error fetching users with admin status:", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

/**
 * Fetches local users
 * @param adminUserId The admin requesting the user list
 * @returns List of users with admin status
 */
export async function getLocalUsers(adminUserId: string) {
  // First verify the requesting user is an admin
  const isAdmin = await checkIfAdmin(adminUserId);
  if (!isAdmin) {
    return {
      success: false,
      error: "Unauthorized: Only admins can view all users",
    };
  }

  try {
    // Get the current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        success: false,
        error: "Not authenticated",
      };
    }

    // Return at least the current user
    return {
      success: true,
      data: [
        {
          id: user.id,
          email: user.email || "",
          fullName: user.user_metadata?.full_name || "",
          isAdmin: true, // Current user is admin (we checked above)
          lastSignIn: null,
          createdAt: user.created_at,
        },
      ],
    };
  } catch (err) {
    console.error("Error in getLocalUsers:", err);
    return {
      success: false,
      error: "Failed to get user information",
    };
  }
}

// Update this function to avoid using the users table
export async function getAllUsersClientSide() {
  try {
    // First check if the current user is an admin
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    const isAdmin = await checkIfAdmin(user.id);
    if (!isAdmin) {
      return {
        success: false,
        error: "Unauthorized: Only admins can view all users",
      };
    }

    // Get all admin users
    let adminUserIds = new Set();
    try {
      const { data: adminUsers, error: adminError } = await supabase
        .from("admin_users")
        .select("user_id");

      if (!adminError && adminUsers) {
        adminUserIds = new Set(adminUsers.map((admin) => admin.user_id));
      }
    } catch (adminError) {
      console.error("Error fetching admin users:", adminError);
      // Always include the current user as admin since we verified above
      adminUserIds.add(user.id);
    }

    // Return just the current user since we can't get other users
    return {
      success: true,
      data: [
        {
          id: user.id,
          email: user.email || "",
          fullName: user.user_metadata?.full_name || "",
          isAdmin: true, // Current user is admin (we verified above)
          lastSignIn: null,
          createdAt: user.created_at,
        },
      ],
    };
  } catch (err) {
    console.error("Error in getAllUsersClientSide:", err);

    // Fallback to just the current user
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        return {
          success: true,
          data: [
            {
              id: user.id,
              email: user.email || "",
              fullName: user.user_metadata?.full_name || "",
              isAdmin: true,
              lastSignIn: null,
              createdAt: user.created_at,
            },
          ],
        };
      }
    } catch (fallbackErr) {
      console.error("Error in fallback:", fallbackErr);
    }

    return { success: false, error: "Failed to get user information" };
  }
}
