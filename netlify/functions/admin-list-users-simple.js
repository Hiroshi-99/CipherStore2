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

    // Initialize Supabase client with service role key
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

    // Add this after the supabase client initialization
    console.log("Checking if profiles table exists...");

    // Always use auth.users which is guaranteed to exist
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

    // Try to get admin users, but don't fail if the table doesn't exist
    let adminUserIds = new Set();
    try {
      const { data: adminUsers } = await supabase
        .from("admin_users")
        .select("user_id");

      if (adminUsers && adminUsers.length > 0) {
        adminUserIds = new Set(adminUsers.map((admin) => admin.user_id));
      }
    } catch (adminError) {
      console.log("Admin users table might not exist:", adminError.message);
    }

    // Format the response using auth.users data
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
    console.error("Error in admin-list-users-simple:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Internal server error",
        details: error.message,
      }),
    };
  }
};
