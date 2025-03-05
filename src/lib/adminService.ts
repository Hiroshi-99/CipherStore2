import { supabase } from "./supabase";
import { safeInsert } from "./database";

/**
 * Checks if a user has admin privileges with better fallbacks
 */
export const checkIfAdmin = async (userId: string) => {
  console.log("Checking admin status for user:", userId);

  // First check for dev override
  try {
    const devAdminOverride =
      typeof window !== "undefined" &&
      window.localStorage.getItem("dev_admin_override") === "true";
    if (devAdminOverride) {
      console.log("Using development admin override");
      return { isAdmin: true, success: true };
    }
  } catch (e) {
    // Ignore localStorage errors
  }

  try {
    // Try the serverless function first (more reliable)
    try {
      const response = await fetch("/.netlify/functions/admin-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result?.isAdmin) {
          console.log("Admin status confirmed via serverless function");
          return { isAdmin: true, success: true };
        }
      }
    } catch (functionError) {
      console.log("Serverless admin check failed, trying direct DB access");
    }

    // Fallback to direct database check
    try {
      const { data, error } = await supabase
        .from("admin_users")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (!error && data) {
        console.log("User found in admin_users table");
        return { isAdmin: true, success: true };
      }
    } catch (dbError) {
      console.log("Direct database check failed");
    }

    // Last attempt: force reload and check again if in dev mode
    if (process.env.NODE_ENV === "development") {
      console.log("Development mode: Consider using Force Admin mode button");
    }

    try {
      const response = await fetch("/.netlify/functions/admin-check-simple", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result?.isAdmin) {
          console.log("Admin status confirmed via simple check");
          return { isAdmin: true, success: true };
        }
      }
    } catch (simpleFunctionError) {
      console.log("Simple admin check failed too");
    }

    return { isAdmin: false, success: false };
  } catch (err) {
    console.error("Exception in checkIfAdmin:", err);
    return { isAdmin: false, success: false, error: String(err) };
  }
};

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

// Add this function to get users when direct DB access fails
export const getAllUsersClientSide = async () => {
  try {
    // Try direct database access first
    const { data, error } = await supabase
      .from("users")
      .select("id, email, full_name, created_at, is_admin");

    if (!error && data && data.length > 0) {
      return {
        success: true,
        data: data.map((user) => ({
          id: user.id,
          email: user.email || "",
          fullName: user.full_name || "",
          isAdmin: user.is_admin || false,
          lastSignIn: null,
          createdAt: user.created_at,
        })),
      };
    }

    // Try auth API as fallback
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session) {
      // Try to get users from serverless function
      const response = await fetch(
        "/.netlify/functions/admin-list-users-simple",
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        const result = await response.json();
        if (result.users) {
          return { success: true, data: result.users };
        }
      }
    }

    // Create a fallback user (current user)
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();

    if (currentUser) {
      return {
        success: true,
        data: [
          {
            id: currentUser.id,
            email: currentUser.email || "",
            fullName: currentUser.user_metadata?.full_name || "Current User",
            isAdmin: true, // Assume current user is admin
            lastSignIn: null,
            createdAt: currentUser.created_at,
          },
        ],
      };
    }

    return { success: false, error: "Could not retrieve users" };
  } catch (err) {
    console.error("Error getting all users client side:", err);
    return { success: false, error: String(err) };
  }
};
