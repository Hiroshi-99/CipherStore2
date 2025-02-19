import { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const { orderId, fileUrl } = JSON.parse(event.body || "{}");

    if (!orderId || !fileUrl) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing required fields" }),
      };
    }

    // Get order details
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("user_id")
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      throw new Error("Failed to fetch order details");
    }

    // Update order with file URL
    const { error: updateError } = await supabaseAdmin
      .from("orders")
      .update({ account_file_url: fileUrl })
      .eq("id", orderId);

    if (updateError) {
      throw updateError;
    }

    // Create inbox message
    const { error: inboxError } = await supabaseAdmin
      .from("inbox_messages")
      .insert([
        {
          user_id: order.user_id,
          title: "Account File Uploaded",
          content:
            "Your account file has been uploaded. You can view it in your inbox.",
          type: "account_file",
          file_url: fileUrl,
        },
      ]);

    if (inboxError) {
      throw inboxError;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
    };
  } catch (error) {
    console.error("Error in admin-upload-file:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Failed to process file upload",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
    };
  }
};
