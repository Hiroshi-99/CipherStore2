const { createClient } = require("@supabase/supabase-js");

exports.handler = async (event, context) => {
  // Set up CORS headers
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
    // For development without proper admin system, always return true
    if (process.env.NODE_ENV !== "production") {
      console.log("Development mode - always granting admin access");
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ isAdmin: true }),
      };
    }

    // Get the userId from the request body
    let userId;
    try {
      const body = JSON.parse(event.body || "{}");
      userId = body.userId;
    } catch (parseError) {
      console.error("Error parsing request body:", parseError);
    }

    // If userId is undefined or null, still return admin: true in development
    if (!userId && process.env.NODE_ENV !== "production") {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ isAdmin: true }),
      };
    }

    // Return non-admin for production when userId is missing
    if (!userId) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ isAdmin: false }),
      };
    }

    // For development/testing - you can hardcode specific user IDs to be admins
    const devAdminIds = [
      // Add your user IDs here for testing
    ];

    if (devAdminIds.includes(userId)) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ isAdmin: true }),
      };
    }

    // Remaining logic...
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ isAdmin: true }),
    };
  } catch (error) {
    console.error("Admin check error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || "Internal server error" }),
    };
  }
};
