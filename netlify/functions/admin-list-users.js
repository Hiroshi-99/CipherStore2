const { createClient } = require("@supabase/supabase-js");

exports.handler = async (event, context) => {
  // Set up CORS headers
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  // Handle preflight OPTIONS request
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: "",
    };
  }

  try {
    // Parse the request body
    const { adminUserId } = JSON.parse(event.body);

    if (!adminUserId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Admin user ID is required" }),
      };
    }

    // Initialize Supabase client with service role key (from environment variables)
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: "Missing Supabase environment variables",
        }),
      };
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the requesting user is an admin
    const { data: adminData, error: adminError } = await supabase
      .from("admin_users")
      .select("id")
      .eq("user_id", adminUserId)
      .single();

    if (adminError && adminError.code !== "PGRST116") {
      // Not found error is okay
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: `Failed to verify admin status: ${adminError.message}`,
        }),
      };
    }

    // If not found in admin_users table, check user metadata
    if (!adminData) {
      const { data: userData, error: userError } =
        await supabase.auth.admin.getUserById(adminUserId);

      if (userError) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({
            error: `Failed to verify admin status: ${userError.message}`,
          }),
        };
      }

      const isAdmin = userData?.user?.user_metadata?.role === "admin";

      if (!isAdmin) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({
            error: "Unauthorized: Only admins can view all users",
          }),
        };
      }
    }

    // Get all users
    const { data: users, error: usersError } =
      await supabase.auth.admin.listUsers();

    if (usersError) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: `Failed to fetch users: ${usersError.message}`,
        }),
      };
    }

    // Get all admin users
    const { data: adminUsers, error: adminUsersError } = await supabase
      .from("admin_users")
      .select("user_id");

    if (adminUsersError) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: `Failed to fetch admin users: ${adminUsersError.message}`,
        }),
      };
    }

    // Create a set of admin user IDs for quick lookup
    const adminUserIds = new Set(
      (adminUsers || []).map((admin) => admin.user_id)
    );

    // Combine the data
    const usersWithAdminStatus = users.users.map((user) => ({
      id: user.id,
      email: user.email,
      fullName: user.user_metadata?.full_name || "",
      isAdmin:
        adminUserIds.has(user.id) || user.user_metadata?.role === "admin",
      lastSignIn: user.last_sign_in_at,
      createdAt: user.created_at,
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ data: usersWithAdminStatus }),
    };
  } catch (error) {
    console.error("Function error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
