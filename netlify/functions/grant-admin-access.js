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
        body: JSON.stringify({ success: false, error: "User ID is required" }),
      };
    }

    // Initialize Supabase with service role key
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Create admin_users table if it doesn't exist
    try {
      await supabase.rpc("create_admin_users_table_if_not_exists");
    } catch (tableError) {
      console.log(
        "Could not create table via RPC, this is expected:",
        tableError
      );

      // We'll try direct insert instead
    }

    // Insert into admin_users
    const { error: adminError } = await supabase.from("admin_users").insert({
      user_id: userId,
      granted_at: new Date().toISOString(),
    });

    // Update user metadata to include admin role
    const { error: userUpdateError } = await supabase.auth.admin.updateUserById(
      userId,
      { user_metadata: { role: "admin" } }
    );

    if (adminError && userUpdateError) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: "Failed to grant admin privileges",
          details: { adminError, userUpdateError },
        }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: "Admin privileges granted successfully",
      }),
    };
  } catch (error) {
    console.error("Error granting admin access:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: "Internal server error",
        details: error.message,
      }),
    };
  }
};
