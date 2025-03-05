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
    const { userId, email } = JSON.parse(event.body);

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

    // Get current user data to preserve existing metadata
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.admin.getUserById(userId);

    if (userError) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: "Failed to get user data",
          details: userError.message,
        }),
      };
    }

    // Update user metadata to include admin role
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      userId,
      {
        user_metadata: {
          ...user.user_metadata,
          role: "admin",
          is_admin: true,
          admin_forced: true,
          forced_at: new Date().toISOString(),
        },
      }
    );

    if (updateError) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: "Failed to update user metadata",
          details: updateError.message,
        }),
      };
    }

    // Try to log this action to a secure admin log
    try {
      await supabase.from("admin_logs").insert({
        user_id: userId,
        email: email,
        action: "force_admin_access",
        created_at: new Date().toISOString(),
      });
    } catch (logError) {
      console.log("Couldn't log admin action (this is ok):", logError);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: "Admin access forced successfully",
      }),
    };
  } catch (error) {
    console.error("Error forcing admin access:", error);
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
