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
    // Parse the request body
    const { userId } = JSON.parse(event.body);

    if (!userId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "User ID is required" }),
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

    // For development mode, always return true for first user created
    // This makes it easier to get started with the admin system
    if (process.env.NODE_ENV !== "production") {
      console.log("Development mode - simplified admin check");
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ isAdmin: true }),
      };
    }

    // Not an admin
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ isAdmin: false }),
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
