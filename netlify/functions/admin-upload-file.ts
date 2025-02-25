import { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import busboy from "busboy";
import { Buffer } from "buffer";

// Initialize Supabase client with admin privileges
const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

// Improved error logging
const logError = (error: any, context: string) => {
  console.error(`Error in admin-upload-file (${context}):`, {
    message: error.message,
    stack: error.stack,
    details: error.details,
    hint: error.hint,
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

  try {
    new URL(body.fileUrl);
  } catch (urlError) {
    throw new Error("Invalid fileUrl format");
  }
};

// Process the file upload and update related records
const processFileUpload = async (orderId: string, fileUrl: string) => {
  // Get the order to verify it exists and get user_id
  const { data: order, error: orderError } = await supabaseAdmin
    .from("orders")
    .select("id, user_id")
    .eq("id", orderId)
    .single();

  if (orderError) {
    throw new Error(`Order not found: ${orderError.message}`);
  }

  if (!order) {
    throw new Error(`Order ${orderId} not found`);
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
  // Enable CORS
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    // Verify authentication
    const authHeader = event.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) {
      return {
        statusCode: 401,
        body: JSON.stringify({
          error: "Unauthorized - Missing or invalid token",
        }),
      };
    }

    const token = authHeader.replace("Bearer ", "");

    // Verify the token with Supabase
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      logError(authError || new Error("No user found"), "authentication");
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "Unauthorized - Invalid token" }),
      };
    }

    // Check if user is an admin
    const { data: adminData, error: adminError } = await supabaseAdmin
      .from("users")
      .select("is_admin")
      .eq("id", user.id)
      .single();

    if (adminError || !adminData?.is_admin) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "Forbidden - Admin access required" }),
      };
    }

    // Parse multipart form data
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "No form data provided" }),
      };
    }

    // Handle file upload using busboy
    return new Promise((resolve, reject) => {
      const bb = busboy({ headers: event.headers as any });
      let fileName = "";
      let fileBuffer: Buffer | null = null;
      let fileType = "";

      bb.on("file", (name, file, info) => {
        const { filename, mimeType } = info;
        const chunks: Buffer[] = [];

        fileName = filename;
        fileType = mimeType;

        file.on("data", (data) => {
          chunks.push(data);
        });

        file.on("end", () => {
          fileBuffer = Buffer.concat(chunks);
        });
      });

      bb.on("field", (name, val) => {
        if (name === "fileName" && val) {
          fileName = val;
        }
      });

      bb.on("finish", async () => {
        try {
          if (!fileBuffer) {
            resolve({
              statusCode: 400,
              body: JSON.stringify({ error: "No file provided" }),
            });
            return;
          }

          // Upload to Supabase Storage
          const uploadPath = `uploads/${fileName}`;
          const { error: uploadError } = await supabaseAdmin.storage
            .from("images")
            .upload(uploadPath, fileBuffer, {
              contentType: fileType,
              upsert: true,
            });

          if (uploadError) {
            logError(uploadError, "storage upload");
            resolve({
              statusCode: 500,
              body: JSON.stringify({
                error: `Failed to upload file: ${uploadError.message}`,
              }),
            });
            return;
          }

          // Get the public URL
          const { data: urlData } = supabaseAdmin.storage
            .from("images")
            .getPublicUrl(uploadPath);

          resolve({
            statusCode: 200,
            body: JSON.stringify({
              success: true,
              path: `images/${uploadPath}`,
              url: urlData.publicUrl,
            }),
          });
        } catch (error) {
          logError(error, "file processing");
          resolve({
            statusCode: 500,
            body: JSON.stringify({ error: "Failed to process file upload" }),
          });
        }
      });

      bb.on("error", (error) => {
        logError(error, "busboy");
        resolve({
          statusCode: 500,
          body: JSON.stringify({ error: "Failed to parse form data" }),
        });
      });

      // Pass the raw request body to busboy
      bb.write(
        Buffer.from(
          event.isBase64Encoded
            ? Buffer.from(event.body, "base64").toString()
            : event.body
        )
      );
      bb.end();
    });
  } catch (error) {
    logError(error, "handler");
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to process file upload" }),
    };
  }
};
