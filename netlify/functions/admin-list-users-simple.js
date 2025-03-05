const { createClient } = require("@supabase/supabase-js");

exports.handler = async (event, context) => {
  // Set up CORS headers
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
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

    // Get users directly using the service role
    const { data: users, error } = await supabase.auth.admin.listUsers();

    if (error) {
      console.error("Error fetching users:", error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: error.message }),
      };
    }

    // Format the user data
    const formattedUsers = users.users.map((user) => ({
      id: user.id,
      email: user.email || "",
      fullName: user.user_metadata?.full_name || "",
      isAdmin: user.app_metadata?.admin === true, // Check app metadata for admin flag
      lastSignIn: user.last_sign_in_at,
      createdAt: user.created_at,
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ users: formattedUsers }),
    };
  } catch (error) {
    console.error("Admin list users error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || "Internal server error" }),
    };
  }
};
