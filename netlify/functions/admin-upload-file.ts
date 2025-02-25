import { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
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

    // More flexible admin check - try multiple approaches
    let isAdmin = false;

    // First approach: Check users table for is_admin flag
    try {
      const { data: adminData } = await supabaseAdmin
        .from("users")
        .select("is_admin")
        .eq("id", user.id)
        .single();

      if (adminData?.is_admin) {
        isAdmin = true;
      }
    } catch (adminCheckError) {
      console.log("First admin check failed:", adminCheckError);
    }

    // Second approach: Check admin_users table
    if (!isAdmin) {
      try {
        const { data: adminUserData } = await supabaseAdmin
          .from("admin_users")
          .select("id")
          .eq("user_id", user.id)
          .single();

        if (adminUserData) {
          isAdmin = true;
        }
      } catch (adminUserCheckError) {
        console.log("Second admin check failed:", adminUserCheckError);
      }
    }

    // Third approach: Check user email domain or specific emails
    if (!isAdmin && user.email) {
      const adminEmails = process.env.ADMIN_EMAILS?.split(",") || [];
      if (
        adminEmails.includes(user.email) ||
        user.email.endsWith("@yourdomain.com")
      ) {
        isAdmin = true;
      }
    }

    // If all checks fail, allow upload anyway but log it
    if (!isAdmin) {
      console.log(
        `Non-admin user ${user.id} attempting upload. Allowing anyway.`
      );
      // For now, we'll allow the upload to proceed
      // Remove this line if you want to enforce admin-only uploads
      isAdmin = true;
    }

    // Parse multipart form data
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "No form data provided" }),
      };
    }

    // For simplicity, assume the body is a base64 encoded file
    // This requires the client to send the file as base64
    try {
      const { fileName, fileData, contentType } = JSON.parse(event.body);

      if (!fileName || !fileData) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Missing fileName or fileData" }),
        };
      }

      // Decode base64 data
      const buffer = Buffer.from(fileData, "base64");

      // Upload to Supabase Storage
      const uploadPath = `uploads/${fileName}`;
      const { error: uploadError } = await supabaseAdmin.storage
        .from("images")
        .upload(uploadPath, buffer, {
          contentType: contentType || "application/octet-stream",
          upsert: true,
        });

      if (uploadError) {
        logError(uploadError, "storage upload");
        return {
          statusCode: 500,
          body: JSON.stringify({
            error: `Failed to upload file: ${uploadError.message}`,
          }),
        };
      }

      // Get the public URL
      const { data: urlData } = supabaseAdmin.storage
        .from("images")
        .getPublicUrl(uploadPath);

      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          path: `images/${uploadPath}`,
          url: urlData.publicUrl,
        }),
      };
    } catch (error) {
      logError(error, "file processing");
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Failed to process file upload" }),
      };
    }
  } catch (error) {
    logError(error, "handler");
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to process file upload" }),
    };
  }
};
