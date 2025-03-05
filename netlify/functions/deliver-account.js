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
    // Parse request body
    const { orderId } = JSON.parse(event.body || "{}");

    if (!orderId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Order ID is required" }),
      };
    }

    // Initialize Supabase client
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    // Generate account credentials
    const accountId = `ACC${Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, "0")}`;
    const password = Math.random().toString(36).substring(2, 10);

    // Try to use the database function if it exists
    try {
      const { data, error } = await supabase.rpc("deliver_account", {
        order_id: orderId,
        account_identifier: accountId,
        account_pass: password,
      });

      if (!error && data?.success) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            accountId,
            password,
            method: data.method,
          }),
        };
      }
    } catch (fnError) {
      console.log("Database function failed, using fallback method");
    }

    // If the function doesn't exist or fails, try the direct approach
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (orderError) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: "Order not found" }),
      };
    }

    // Determine which update strategy to use
    let updateResult;

    if ("account_id" in order) {
      updateResult = await supabase
        .from("orders")
        .update({
          account_id: accountId,
          account_password: password,
          account_delivered: true,
          account_delivered_at: new Date().toISOString(),
          status: "active",
        })
        .eq("id", orderId);
    } else if ("metadata" in order) {
      // Parse existing metadata
      let metadata = {};
      if (order.metadata) {
        if (typeof order.metadata === "string") {
          try {
            metadata = JSON.parse(order.metadata);
          } catch (e) {}
        } else if (typeof order.metadata === "object") {
          metadata = order.metadata;
        }
      }

      updateResult = await supabase
        .from("orders")
        .update({
          metadata: {
            ...metadata,
            account: {
              id: accountId,
              password,
              delivered: true,
              delivered_at: new Date().toISOString(),
            },
          },
          status: "active",
        })
        .eq("id", orderId);
    } else {
      // Minimal update
      updateResult = await supabase
        .from("orders")
        .update({
          status: "active",
        })
        .eq("id", orderId);
    }

    if (updateResult.error) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: "Failed to update order",
          details: updateResult.error.message,
        }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        accountId,
        password,
        method: "fallback",
      }),
    };
  } catch (err) {
    console.error("Error in deliver-account:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
