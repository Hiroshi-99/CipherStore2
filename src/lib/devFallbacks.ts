// Create this new file to provide development fallbacks

// Mock user data for development
export const getMockUsers = () => {
  return [
    {
      id: crypto.randomUUID ? crypto.randomUUID() : "user-1",
      email: "admin@example.com",
      fullName: "Admin User",
      isAdmin: true,
      lastSignIn: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    },
  ];
};

// Mock orders data for development
export const getMockOrders = () => {
  return [
    {
      id: crypto.randomUUID ? crypto.randomUUID() : "order-1",
      status: "pending",
      customer_name: "Test Customer",
      email: "customer@example.com",
      created_at: new Date().toISOString(),
    },
    {
      id: crypto.randomUUID ? crypto.randomUUID() : "order-2",
      status: "active",
      customer_name: "Another Customer",
      email: "another@example.com",
      created_at: new Date(Date.now() - 86400000).toISOString(),
    },
  ];
};

// Check if we're in dev mode with network issues
export const isDevelopmentWithNetworkIssues = async () => {
  if (process.env.NODE_ENV !== "development") {
    return false;
  }

  try {
    // Try to ping the functions endpoint
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1000);

    const response = await fetch("/.netlify/functions/health-check", {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return !response.ok;
  } catch (e) {
    console.log("Network check failed, using local fallbacks");
    return true;
  }
};
