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
