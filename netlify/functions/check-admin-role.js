const { createClient } = require("@supabase/supabase-js");

exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  // Handle preflight OPTIONS request
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    // Parse request
    const { userId } = JSON.parse(event.body);

    if (!userId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          isAdmin: false,
          error: "User ID is required",
        }),
      };
    }

    // Initialize Supabase with service role key
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Get user data from Supabase Auth
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.admin.getUserById(userId);

    if (userError || !user) {
      console.error("Error getting user:", userError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          isAdmin: false,
          error: "Could not get user data",
        }),
      };
    }

    // Check if user has admin role in metadata
    const isAdmin = user.user_metadata?.role === "admin";

    // If not admin, but this is a first-time setup, grant admin privileges
    if (!isAdmin) {
      // Check if this is the first/only user in the system
      const {
        data: { users },
        error: listError,
      } = await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 2,
      });

      if (
        !listError &&
        users &&
        (users.length === 1 || users[0].id === userId)
      ) {
        // This is the first/only user, grant admin privileges
        await supabase.auth.admin.updateUserById(userId, {
          user_metadata: { ...user.user_metadata, role: "admin" },
        });

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            isAdmin: true,
            message: "First user in system - admin privileges granted",
          }),
        };
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ isAdmin }),
    };
  } catch (error) {
    console.error("Error in check-admin-role:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        isAdmin: false,
        error: "Internal server error",
        details: error.message,
      }),
    };
  }
};
