const { createClient } = require("@supabase/supabase-js");

exports.handler = async (event, context) => {
  // Set up CORS headers
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
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
    // Validate environment variables
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Missing Supabase environment variables");
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: "Server configuration issue: Missing environment variables",
        }),
      };
    }

    // Initialize Supabase client with proper error handling
    let supabase;
    try {
      supabase = createClient(supabaseUrl, supabaseServiceKey);
    } catch (initError) {
      console.error("Error initializing Supabase client:", initError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: "Failed to initialize database client",
          details: initError.message,
        }),
      };
    }

    // Simple connection test
    try {
      const { error: pingError } = await supabase
        .from("orders")
        .select("count")
        .limit(1);
      if (pingError) {
        console.error("Database connection test failed:", pingError);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({
            error: "Database connection failed",
            details: pingError.message,
          }),
        };
      }
    } catch (pingError) {
      console.error("Database ping failed:", pingError);
    }

    // Use simpler approach with individual queries instead of RPC
    // Add account_id column if it doesn't exist
    try {
      await supabase.from("orders").select("account_id").limit(1);
    } catch (error) {
      if (
        error.message.includes("column") &&
        error.message.includes("does not exist")
      ) {
        const { error: alterError } = await supabase.rpc("execute_sql", {
          sql: "ALTER TABLE orders ADD COLUMN account_id TEXT;",
        });

        if (alterError) {
          console.log("Error adding account_id column:", alterError);
        } else {
          console.log("Added account_id column successfully");
        }
      }
    }

    // Add account_password column if it doesn't exist
    try {
      await supabase.from("orders").select("account_password").limit(1);
    } catch (error) {
      if (
        error.message.includes("column") &&
        error.message.includes("does not exist")
      ) {
        const { error: alterError } = await supabase.rpc("execute_sql", {
          sql: "ALTER TABLE orders ADD COLUMN account_password TEXT;",
        });

        if (alterError) {
          console.log("Error adding account_password column:", alterError);
        } else {
          console.log("Added account_password column successfully");
        }
      }
    }

    // Add delivery_date column if it doesn't exist
    try {
      await supabase.from("orders").select("delivery_date").limit(1);
    } catch (error) {
      if (
        error.message.includes("column") &&
        error.message.includes("does not exist")
      ) {
        const { error: alterError } = await supabase.rpc("execute_sql", {
          sql: "ALTER TABLE orders ADD COLUMN delivery_date TIMESTAMP WITH TIME ZONE;",
        });

        if (alterError) {
          console.log("Error adding delivery_date column:", alterError);
        } else {
          console.log("Added delivery_date column successfully");
        }
      }
    }

    // Add account_file_url column if it doesn't exist
    try {
      await supabase.from("orders").select("account_file_url").limit(1);
    } catch (error) {
      if (
        error.message.includes("column") &&
        error.message.includes("does not exist")
      ) {
        const { error: alterError } = await supabase.rpc("execute_sql", {
          sql: "ALTER TABLE orders ADD COLUMN account_file_url TEXT;",
        });

        if (alterError) {
          console.log("Error adding account_file_url column:", alterError);
        } else {
          console.log("Added account_file_url column successfully");
        }
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: "Database schema updated successfully",
      }),
    };
  } catch (err) {
    console.error("Error in fix-orders-schema:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Internal server error",
        message: err.message,
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
      }),
    };
  }
};
