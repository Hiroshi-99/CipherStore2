const { createClient } = require("@supabase/supabase-js");

exports.handler = async (event, context) => {
  // Set up CORS headers
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
    // Get the authorization token
    const authHeader =
      event.headers.authorization || event.headers.Authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          error: "Missing or invalid authorization token",
        }),
      };
    }

    const token = authHeader.split(" ")[1];

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

    // Verify the token and get the user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: "Invalid authentication token" }),
      };
    }

    // Get all users (admin only)
    const { data: users, error: usersError } =
      await supabase.auth.admin.listUsers();

    if (usersError) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: `Failed to list users: ${usersError.message}`,
        }),
      };
    }

    // Format the response
    const formattedUsers = users.users.map((user) => ({
      id: user.id,
      email: user.email,
      fullName: user.user_metadata?.full_name || "",
      isAdmin: user.user_metadata?.role === "admin",
      lastSignIn: user.last_sign_in_at,
      createdAt: user.created_at,
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ data: formattedUsers }),
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
