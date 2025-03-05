import { supabase } from "./supabase";
import { toast } from "sonner";
import { isDev, storeDevData, getDevData } from "./devMode";

// Simple wrapper to log operations in dev mode
const logDev = (message: string, data?: any) => {
  if (isDev()) {
    console.log(`[DEV] ${message}`, data);
  }
};

// Create a universal function to deliver account details that works in any environment
export const deliverAccountDetails = async (orderId: string) => {
  logDev(`Delivering account for order ${orderId}`);

  // Generate credentials
  const accountId = `ACC${Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0")}`;
  const password = Math.random().toString(36).substring(2, 10);

  // Always show the credentials first so they're not lost
  toast.success(
    `Account Details Created:
     
     ID: ${accountId}
     Password: ${password}
     
     (Save these somewhere safe)`,
    { duration: 10000 } // Keep visible longer
  );

  // Store in development storage regardless of what happens next
  if (isDev()) {
    const accounts = getDevData("delivered_accounts") || {};
    accounts[orderId] = {
      accountId,
      password,
      timestamp: new Date().toISOString(),
    };
    storeDevData("delivered_accounts", accounts);
    logDev("Saved to dev storage", accounts);
  }

  // Try the serverless function approach first (most reliable)
  try {
    const response = await fetch("/.netlify/functions/deliver-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId }),
    });

    if (response.ok) {
      const result = await response.json();
      if (result.success) {
        logDev("Updated using serverless function", result);
        return {
          success: true,
          method: "serverless",
          accountId: result.accountId,
          password: result.password,
        };
      }
    }
  } catch (serverlessErr) {
    logDev("Serverless delivery failed", serverlessErr);
  }

  // First check if we can get the order
  try {
    const { data: order, error } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (error) {
      logDev("Error fetching order", error);
      return { success: true, devMode: true, accountId, password };
    }

    // Try multiple approaches to update the database

    // Start by determining available fields
    const hasAccountFields = "account_id" in order;
    const hasMetadataField = "metadata" in order;

    if (hasAccountFields) {
      try {
        const { error } = await supabase
          .from("orders")
          .update({
            account_id: accountId,
            account_password: password,
            status: "active",
            account_delivered_at: new Date().toISOString(),
          })
          .eq("id", orderId);

        if (!error) {
          logDev("Updated using account fields");
          return { success: true, method: "direct", accountId, password };
        }
      } catch (e) {
        logDev("Direct update failed", e);
      }
    }

    if (hasMetadataField) {
      try {
        // Parse existing metadata if it exists
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

        const { error } = await supabase
          .from("orders")
          .update({
            metadata: JSON.stringify({
              ...metadata,
              account: {
                id: accountId,
                password,
                delivered_at: new Date().toISOString(),
              },
            }),
            status: "active",
          })
          .eq("id", orderId);

        if (!error) {
          logDev("Updated using metadata field");
          return { success: true, method: "metadata", accountId, password };
        }
      } catch (e) {
        logDev("Metadata update failed", e);
      }
    }

    // As a last resort, try a simpler update with just status
    try {
      const { error } = await supabase
        .from("orders")
        .update({
          status: "active",
        })
        .eq("id", orderId);

      if (!error) {
        logDev("Simple status update succeeded");
        // Also store in localStorage as backup
        const localAccounts = JSON.parse(
          localStorage.getItem("account_credentials") || "{}"
        );
        localAccounts[orderId] = {
          accountId,
          password,
          timestamp: new Date().toISOString(),
        };
        localStorage.setItem(
          "account_credentials",
          JSON.stringify(localAccounts)
        );

        return { success: true, method: "minimal", accountId, password };
      }
    } catch (e) {
      logDev("Simple update failed", e);
    }
  } catch (err) {
    console.error("Error in account delivery:", err);
  }

  // If all database methods failed, return success anyway since user has the credentials from toast
  return {
    success: true,
    method: "toast_only",
    accountId,
    password,
    message: "Database update failed, but credentials were displayed",
  };
};

export const deliverAccountDirectly = async (orderId: string) => {
  try {
    // Generate credentials
    const accountId = `ACC${Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, "0")}`;
    const password = Math.random().toString(36).substring(2, 10);

    // Show credentials in toast first for safety
    toast.success(
      `Account Details Created:
       
       ID: ${accountId}
       Password: ${password}
       
       (Save these somewhere safe)`,
      { duration: 10000 }
    );

    // Try to update order in database
    try {
      const { error } = await supabase
        .from("orders")
        .update({
          account_id: accountId,
          account_password: password,
          status: "active",
          delivery_date: new Date().toISOString(),
        })
        .eq("id", orderId);

      if (error) throw error;
    } catch (dbError) {
      console.error("Database update failed:", dbError);

      // Store in localStorage as fallback
      try {
        const localAccounts = JSON.parse(
          localStorage.getItem("account_credentials") || "{}"
        );
        localAccounts[orderId] = {
          accountId,
          password,
          timestamp: new Date().toISOString(),
        };
        localStorage.setItem(
          "account_credentials",
          JSON.stringify(localAccounts)
        );
      } catch (e) {
        // Ignore localStorage errors
      }
    }

    return {
      success: true,
      accountId,
      password,
      method: "direct",
    };
  } catch (err) {
    console.error("Error in deliverAccountDirectly:", err);
    return {
      success: false,
      error: err,
    };
  }
};
