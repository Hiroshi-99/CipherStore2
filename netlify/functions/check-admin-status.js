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

    // Get user data with admin API
    const { data: userData, error: userError } =
      await supabase.auth.admin.getUserById(userId);

    if (userError) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: `Failed to get user: ${userError.message}`,
        }),
      };
    }

    // Check if user has admin role in metadata
    const isAdmin = userData?.user?.user_metadata?.role === "admin";

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ data: { isAdmin } }),
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
