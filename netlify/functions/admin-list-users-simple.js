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

    // First check if the profiles table exists
    try {
      const { data: tableExists, error: tableCheckError } = await supabase
        .from("profiles")
        .select("id")
        .limit(1);

      if (
        tableCheckError &&
        tableCheckError.message.includes("does not exist")
      ) {
        console.log("Profiles table does not exist, using auth.users instead");

        // Fall back to using auth.users directly
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

        // Get admin users
        const { data: adminUsers, error: adminUsersError } = await supabase
          .from("admin_users")
          .select("user_id");

        if (
          adminUsersError &&
          !adminUsersError.message.includes("does not exist")
        ) {
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
      }
    } catch (tableCheckErr) {
      console.error("Error checking profiles table:", tableCheckErr);
      // Continue with normal flow
    }

    // Just get profiles from the public schema - simpler approach
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, email, full_name, created_at");

    if (profilesError) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: `Failed to fetch profiles: ${profilesError.message}`,
        }),
      };
    }

    // Get admin users
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

    // Format the response
    const usersWithAdminStatus = (profiles || []).map((profile) => ({
      id: profile.id,
      email: profile.email,
      fullName: profile.full_name || "",
      isAdmin: adminUserIds.has(profile.id),
      lastSignIn: null,
      createdAt: profile.created_at,
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
      body: JSON.stringify({
        error: "Internal server error",
        details: error.message,
      }),
    };
  }
};
