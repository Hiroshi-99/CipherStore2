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
    const { userId } = JSON.parse(event.body);

    if (!userId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "User ID is required" }),
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

    // Check admin_users table using service role
    const { data: adminData, error: adminError } = await supabase
      .from("admin_users")
      .select("*")
      .eq("user_id", userId);

    // If user is in admin_users table
    if (adminData && adminData.length > 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ isAdmin: true }),
      };
    }

    // If not in admin_users, check user metadata
    const { data: userData, error: userError } =
      await supabase.auth.admin.getUserById(userId);

    if (userData?.user?.user_metadata?.role === "admin") {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ isAdmin: true }),
      };
    }

    // Not an admin
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ isAdmin: false }),
    };
  } catch (error) {
    console.error("Admin check error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || "Internal server error" }),
    };
  }
};
