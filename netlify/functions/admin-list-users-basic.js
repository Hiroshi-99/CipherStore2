exports.handler = async (event, context) => {
  // Set up CORS headers
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
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
    // For development purposes, return a mock user list
    const mockUsers = [
      {
        id: "current-user",
        email: "admin@example.com",
        fullName: "Admin User",
        isAdmin: true,
        lastSignIn: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    ];

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ users: mockUsers }),
    };
  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || "Internal server error" }),
    };
  }
};
