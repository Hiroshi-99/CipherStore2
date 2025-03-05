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
    // Initialize Supabase with service role key
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Drop and recreate policies for users table
    try {
      // First try to drop existing policies
      await supabase.rpc("drop_all_policies_on_users");

      // Create proper policies
      await supabase.rpc("create_proper_users_policies");

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: "User table policies fixed successfully",
        }),
      };
    } catch (policyError) {
      console.error("Error fixing policies:", policyError);

      // Try direct SQL as fallback
      try {
        const policyFixSQL = `
          BEGIN;
          -- Drop all policies on users table
          DROP POLICY IF EXISTS "Users can view their own data" ON "users";
          DROP POLICY IF EXISTS "Users can update their own data" ON "users";
          DROP POLICY IF EXISTS "Admins can view all users" ON "users";
          DROP POLICY IF EXISTS "Admins can update all users" ON "users";
          
          -- Enable RLS on users table
          ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
          
          -- Create proper policies
          CREATE POLICY "Users can view their own data" 
            ON "users" FOR SELECT 
            USING (auth.uid() = id);
            
          CREATE POLICY "Admins can view all users" 
            ON "users" FOR SELECT 
            USING (EXISTS (
              SELECT 1 FROM admin_users 
              WHERE user_id = auth.uid()
            ));
            
          CREATE POLICY "Admins can update all users" 
            ON "users" FOR UPDATE
            USING (EXISTS (
              SELECT 1 FROM admin_users 
              WHERE user_id = auth.uid()
            ));
          COMMIT;
        `;

        await supabase.rpc("execute_sql", { sql: policyFixSQL });

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            message: "User table policies fixed via direct SQL",
          }),
        };
      } catch (sqlError) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({
            success: false,
            error: "Failed to fix policies",
            details: sqlError.message,
          }),
        };
      }
    }
  } catch (error) {
    console.error("Error in fix-user-policies:", error);
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
