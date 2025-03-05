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

    // Create admin_users table
    await supabase.rpc("execute_sql", {
      sql: `
        CREATE TABLE IF NOT EXISTS admin_users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL,
          granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          CONSTRAINT unique_user_id UNIQUE (user_id)
        );
      `,
    });

    // Create the user from the request body if provided
    const { userId, email } = JSON.parse(event.body || "{}");

    if (userId && email) {
      // Insert the user as admin
      await supabase.from("admin_users").upsert(
        {
          user_id: userId,
          granted_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

      // Update user metadata via auth admin API
      await supabase.auth.admin.updateUserById(userId, {
        user_metadata: { role: "admin" },
      });
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: "Admin tables created successfully",
      }),
    };
  } catch (error) {
    console.error("Error creating admin tables:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Error creating admin tables",
        details: error.message,
      }),
    };
  }
};
