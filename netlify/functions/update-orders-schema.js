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

    // Add account columns to orders table
    await supabase.rpc("execute_sql", {
      sql: `
        -- Add account_id column if it doesn't exist
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 
                FROM information_schema.columns 
                WHERE table_name = 'orders' AND column_name = 'account_id'
            ) THEN
                ALTER TABLE orders ADD COLUMN account_id TEXT;
            END IF;
        END
        $$;

        -- Add account_password column if it doesn't exist
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 
                FROM information_schema.columns 
                WHERE table_name = 'orders' AND column_name = 'account_password'
            ) THEN
                ALTER TABLE orders ADD COLUMN account_password TEXT;
            END IF;
        END
        $$;

        -- Add account_file_url column if it doesn't exist
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 
                FROM information_schema.columns 
                WHERE table_name = 'orders' AND column_name = 'account_file_url'
            ) THEN
                ALTER TABLE orders ADD COLUMN account_file_url TEXT;
            END IF;
        END
        $$;
        
        -- Add delivery_date column if it doesn't exist
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 
                FROM information_schema.columns 
                WHERE table_name = 'orders' AND column_name = 'delivery_date'
            ) THEN
                ALTER TABLE orders ADD COLUMN delivery_date TIMESTAMP WITH TIME ZONE;
            END IF;
        END
        $$;
      `,
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: "Orders schema updated successfully",
      }),
    };
  } catch (error) {
    console.error("Error updating orders schema:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Error updating orders schema",
        details: error.message,
      }),
    };
  }
};
