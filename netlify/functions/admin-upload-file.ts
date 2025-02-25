import { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase client with service role key
const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Improved error logging
const logError = (error: any, context: string) => {
  console.error(`Error in admin-upload-file (${context}):`, {
    message: error.message,
    stack: error.stack,
    details: JSON.stringify(error, null, 2),
    timestamp: new Date().toISOString(),
  });
};

// Validate request input
const validateInput = (body: any) => {
  if (!body.orderId) {
    throw new Error("Missing required field: orderId");
  }

  if (!body.fileUrl) {
    throw new Error("Missing required field: fileUrl");
  }

  // Validate URL format
  try {
    new URL(body.fileUrl);
  } catch (urlError) {
    throw new Error("Invalid fileUrl format");
  }

  return { orderId: body.orderId, fileUrl: body.fileUrl };
};

// Process file upload with transaction
const processFileUpload = async (orderId: string, fileUrl: string) => {
  // Get order details
  const { data: order, error: orderError } = await supabaseAdmin
    .from("orders")
    .select("id, user_id, status")
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    throw new Error(
      orderError
        ? `Order query failed: ${orderError.message}`
        : "Order not found"
    );
  }

  // Start a transaction-like operation (Supabase doesn't support true transactions via the JS API)
  try {
    // 1. Update order with file URL
    const { error: updateError } = await supabaseAdmin
      .from("orders")
      .update({ account_file_url: fileUrl })
      .eq("id", orderId);

    if (updateError) {
      throw new Error(`Failed to update order: ${updateError.message}`);
    }

    // 2. Create inbox message
    const { error: inboxError } = await supabaseAdmin
      .from("inbox_messages")
      .insert([
        {
          user_id: order.user_id,
          title: "Account File Available",
          content:
            "Your account file has been uploaded and is now available. You can access it from this message.",
          type: "account_file",
          file_url: fileUrl,
        },
      ]);

    if (inboxError) {
      throw new Error(`Failed to create inbox message: ${inboxError.message}`);
    }

    // 3. Log the activity
    await supabaseAdmin.from("admin_logs").insert([
      {
        action: "file_upload",
        order_id: orderId,
        details: { fileUrl },
      },
    ]);

    return order;
  } catch (error) {
    // If anything fails, we can't do a true rollback, but we should log the error
    throw error;
  }
};

export const handler: Handler = async (event) => {
  // Check method
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  // Check auth header
  const authHeader = event.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: "Unauthorized" }),
    };
  }

  try {
    // Verify admin token
    const token = authHeader.split(" ")[1];
    const { data: userData, error: authError } =
      await supabaseAdmin.auth.getUser(token);

    if (authError || !userData.user) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "Invalid authentication token" }),
      };
    }

    // Check if user is admin
    const { data: adminData } = await supabaseAdmin
      .from("admins")
      .select("id")
      .eq("user_id", userData.user.id)
      .single();

    if (!adminData) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "Forbidden - Admin access required" }),
      };
    }

    // Parse and validate input
    let parsedBody;
    try {
      parsedBody = JSON.parse(event.body || "{}");
    } catch (jsonError) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid JSON in request body" }),
      };
    }

    const { orderId, fileUrl } = validateInput(parsedBody);

    // Process the file upload
    const order = await processFileUpload(orderId, fileUrl);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: {
          orderId,
          userId: order.user_id,
          fileUrl,
        },
      }),
    };
  } catch (error) {
    // Handle different types of errors with appropriate status codes
    let statusCode = 500;
    let errorMessage = "Failed to process file upload";

    if (error instanceof Error) {
      logError(error, "handler");

      if (
        error.message.includes("Missing required field") ||
        error.message.includes("Invalid")
      ) {
        statusCode = 400;
        errorMessage = "Bad request";
      } else if (error.message.includes("not found")) {
        statusCode = 404;
        errorMessage = "Order not found";
      }
    }

    return {
      statusCode,
      body: JSON.stringify({
        error: errorMessage,
        details: error instanceof Error ? error.message : "Unknown error",
      }),
    };
  }
};
