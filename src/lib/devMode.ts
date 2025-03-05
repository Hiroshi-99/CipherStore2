// Create this helper file for development mode features

// Check if we're in development mode
export const isDev = () => process.env.NODE_ENV === "development";

// Mock data generator
export const generateMockData = (type: "order" | "user" | "account") => {
  if (type === "order") {
    return {
      id: `order-${Math.random().toString(36).substring(2, 8)}`,
      status: "pending",
      created_at: new Date().toISOString(),
      customer_name: "Test Customer",
      email: "customer@example.com",
    };
  }

  if (type === "account") {
    return {
      id: `ACC${Math.floor(Math.random() * 10000)
        .toString()
        .padStart(4, "0")}`,
      password: Math.random().toString(36).substring(2, 10),
      created_at: new Date().toISOString(),
    };
  }

  return {
    id: `user-${Math.random().toString(36).substring(2, 8)}`,
    email: `user${Math.floor(Math.random() * 1000)}@example.com`,
    fullName: "Test User",
    isAdmin: true,
    createdAt: new Date().toISOString(),
  };
};

// Store temporary data for development mode
const devStorage = new Map();

export const storeDevData = (key: string, data: any) => {
  devStorage.set(key, data);

  // Also try localStorage as backup
  try {
    localStorage.setItem(`dev_${key}`, JSON.stringify(data));
  } catch (e) {
    // Ignore localStorage errors
  }
};

export const getDevData = (key: string) => {
  // Try memory first
  if (devStorage.has(key)) {
    return devStorage.get(key);
  }

  // Fall back to localStorage
  try {
    const data = localStorage.getItem(`dev_${key}`);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    return null;
  }
};
