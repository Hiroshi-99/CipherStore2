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
    // Initialize Supabase client
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    // First, check if the orders table exists
    const { data: tableExists, error: tableError } = await supabase.rpc(
      "table_exists",
      { table_name: "orders" }
    );

    if (tableError || !tableExists) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Orders table doesn't exist" }),
      };
    }

    // Run SQL migrations to add account columns
    const { data, error } = await supabase.rpc("run_sql_migration", {
      sql: `
        -- First, create a function to check if a column exists
        CREATE OR REPLACE FUNCTION column_exists(tbl text, col text) RETURNS boolean AS $$
        BEGIN
          RETURN EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_name = tbl AND column_name = col
          );
        END;
        $$ LANGUAGE plpgsql;

        -- Now add necessary columns if they don't exist
        DO $$
        BEGIN
          -- Add account_id column if it doesn't exist
          IF NOT column_exists('orders', 'account_id') THEN
            ALTER TABLE orders ADD COLUMN account_id text;
          END IF;

          -- Add account_password column if it doesn't exist
          IF NOT column_exists('orders', 'account_password') THEN
            ALTER TABLE orders ADD COLUMN account_password text;
          END IF;

          -- Add account_delivered column if it doesn't exist
          IF NOT column_exists('orders', 'account_delivered') THEN
            ALTER TABLE orders ADD COLUMN account_delivered boolean DEFAULT false;
          END IF;

          -- Add account_delivered_at column if it doesn't exist
          IF NOT column_exists('orders', 'account_delivered_at') THEN
            ALTER TABLE orders ADD COLUMN account_delivered_at timestamp with time zone;
          END IF;

          -- Add metadata column if it doesn't exist (JSON format for flexible storage)
          IF NOT column_exists('orders', 'metadata') THEN
            ALTER TABLE orders ADD COLUMN metadata jsonb DEFAULT '{}'::jsonb;
          END IF;
        END $$;

        -- Create a function for delivering account details
        CREATE OR REPLACE FUNCTION deliver_account(
          order_id text,
          account_identifier text,
          account_pass text
        ) RETURNS json AS $$
        DECLARE
          result json;
          order_exists boolean;
          has_account_id boolean;
          has_metadata boolean;
          current_metadata jsonb;
        BEGIN
          -- Check if order exists
          SELECT EXISTS(SELECT 1 FROM orders WHERE id = order_id) INTO order_exists;
          
          IF NOT order_exists THEN
            RETURN json_build_object('success', false, 'error', 'Order not found');
          END IF;
          
          -- Check which columns we have available
          has_account_id := column_exists('orders', 'account_id');
          has_metadata := column_exists('orders', 'metadata');
          
          -- Try updating with direct columns if they exist
          IF has_account_id THEN
            UPDATE orders 
            SET 
              account_id = account_identifier,
              account_password = account_pass,
              account_delivered = true,
              account_delivered_at = now(),
              status = 'active'
            WHERE id = order_id;
            
            RETURN json_build_object(
              'success', true, 
              'method', 'direct', 
              'account_id', account_identifier
            );
          END IF;
          
          -- Fall back to metadata field if available
          IF has_metadata THEN
            -- Get current metadata
            SELECT COALESCE(metadata, '{}'::jsonb) INTO current_metadata 
            FROM orders WHERE id = order_id;
            
            -- Update with new account info
            UPDATE orders 
            SET 
              metadata = jsonb_set(
                current_metadata, 
                '{account}', 
                jsonb_build_object(
                  'id', account_identifier,
                  'password', account_pass,
                  'delivered', true,
                  'delivered_at', now()
                )
              ),
              status = 'active'
            WHERE id = order_id;
            
            RETURN json_build_object(
              'success', true, 
              'method', 'metadata', 
              'account_id', account_identifier
            );
          END IF;
          
          -- Last resort, just update status
          UPDATE orders 
          SET status = 'active'
          WHERE id = order_id;
          
          RETURN json_build_object(
            'success', true, 
            'method', 'status_only', 
            'account_id', account_identifier
          );
        END;
        $$ LANGUAGE plpgsql;
      `,
    });

    if (error) {
      console.error("Migration error:", error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: "Failed to update database schema",
          details: error.message,
        }),
      };
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
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
