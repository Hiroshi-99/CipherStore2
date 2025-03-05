import React, {
  createContext,
  useState,
  useContext,
  useCallback,
  useEffect,
} from "react";
import { supabase } from "../lib/supabase";
import { toast } from "sonner";
import { checkIfAdmin } from "../lib/adminService";

// Define interfaces inline to avoid circular imports
interface OrderType {
  id: string;
  status: string;
  // Add other required fields here
}

interface AdminContextType {
  isAdmin: boolean;
  isAdminLoading: boolean;
  actionInProgress: string | null;
  handleApprove: (orderId: string) => Promise<any>;
  handleReject: (orderId: string) => Promise<any>;
  checkAdminStatus: () => Promise<void>;
}

const AdminContext = createContext<AdminContextType>({
  isAdmin: false,
  isAdminLoading: true,
  actionInProgress: null,
  handleApprove: async () => ({ success: false }),
  handleReject: async () => ({ success: false }),
  checkAdminStatus: async () => {},
});

export const useAdmin = () => useContext(AdminContext);

export const AdminProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAdminLoading, setIsAdminLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const checkAdminStatus = async () => {
    setIsAdminLoading(true);
    try {
      // FIRST check for development mode override BEFORE making any API calls
      if (process.env.NODE_ENV === "development") {
        const devOverride =
          localStorage.getItem("dev_admin_override") === "true";
        if (devOverride) {
          console.log("Using development admin override");
          setIsAdmin(true);
          setIsAdminLoading(false);

          // Cache result with timestamp
          localStorage.setItem(
            "admin_status",
            JSON.stringify({
              isAdmin: true,
              timestamp: Date.now(),
            })
          );
          return; // Exit early
        }
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        setIsAdmin(false);
        localStorage.setItem(
          "admin_status",
          JSON.stringify({
            isAdmin: false,
            timestamp: Date.now(),
          })
        );
        setIsAdminLoading(false);
        return;
      }

      console.log("Checking admin status for user:", session.user.id);
      const result = await checkIfAdmin(session.user.id);
      console.log("Admin check result:", result);

      const isAdminUser = !!(result?.isAdmin || result?.success);
      setIsAdmin(isAdminUser);

      // Cache result with timestamp
      localStorage.setItem(
        "admin_status",
        JSON.stringify({
          isAdmin: isAdminUser,
          timestamp: Date.now(),
        })
      );
    } catch (err) {
      console.error("Error checking admin status:", err);
      setIsAdmin(false);
    } finally {
      setIsAdminLoading(false);
    }
  };

  // Add this function to initialize admin status on first load
  const initializeAdminStatus = useCallback(async () => {
    // Check for development mode first to avoid any unnecessary API calls
    if (process.env.NODE_ENV === "development") {
      const devOverride = localStorage.getItem("dev_admin_override") === "true";
      if (devOverride) {
        console.log("Using development admin override in init");
        setIsAdmin(true);
        setIsAdminLoading(false);
        return;
      }
    }

    try {
      // Check localStorage for cached admin status with timestamp
      const cachedStatus = localStorage.getItem("admin_status");
      const now = Date.now();

      if (cachedStatus) {
        try {
          const { isAdmin: cachedIsAdmin, timestamp } =
            JSON.parse(cachedStatus);
          const age = now - timestamp;

          // Use cached result if less than 15 minutes old (increased from 5)
          if (age < 15 * 60 * 1000) {
            console.log("Using cached admin status", cachedIsAdmin);
            setIsAdmin(cachedIsAdmin);
            setIsAdminLoading(false);
            return;
          }
        } catch (cacheError) {
          console.error("Error parsing cached admin status:", cacheError);
        }
      }

      // If no valid cache, check status
      await checkAdminStatus();
    } catch (err) {
      console.error("Error initializing admin status:", err);
      setIsAdminLoading(false);
    }
  }, [checkAdminStatus]);

  // Use this in useEffect
  useEffect(() => {
    // Only initialize once
    let isInitialized = false;

    if (!isInitialized) {
      isInitialized = true;
      initializeAdminStatus();
    }

    // Only listen for sign-in/sign-out, not every auth state change
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      // Only trigger on sign in or sign out
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        checkAdminStatus();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [initializeAdminStatus]);

  const handleApprove = useCallback(async (orderId: string) => {
    if (!confirm("Are you sure you want to approve this order?")) {
      return { success: false };
    }

    try {
      setActionInProgress(orderId);

      // Update the order status to active
      const { error } = await supabase
        .from("orders")
        .update({ status: "active" })
        .eq("id", orderId);

      if (error) throw error;

      toast.success("Order approved successfully");
      return { success: true };
    } catch (err) {
      console.error("Error approving order:", err);
      toast.error("Failed to approve order");
      return { success: false, error: err };
    } finally {
      setActionInProgress(null);
    }
  }, []);

  const handleReject = useCallback(async (orderId: string) => {
    if (!confirm("Are you sure you want to reject this order?")) {
      return { success: false };
    }

    try {
      setActionInProgress(orderId);

      // Update the order status to rejected
      const { error } = await supabase
        .from("orders")
        .update({ status: "rejected" })
        .eq("id", orderId);

      if (error) throw error;

      toast.success("Order rejected successfully");
      return { success: true };
    } catch (err) {
      console.error("Error rejecting order:", err);
      toast.error("Failed to reject order");
      return { success: false, error: err };
    } finally {
      setActionInProgress(null);
    }
  }, []);

  return (
    <AdminContext.Provider
      value={{
        isAdmin,
        isAdminLoading,
        actionInProgress,
        handleApprove,
        handleReject,
        checkAdminStatus,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
};
