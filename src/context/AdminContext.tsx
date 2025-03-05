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

      // Add a development mode check first
      if (process.env.NODE_ENV === "development") {
        const devOverride =
          localStorage.getItem("dev_admin_override") === "true";
        if (devOverride) {
          console.log("Using development admin override");
          setIsAdmin(true);
          setIsAdminLoading(false);

          // Save to cache
          localStorage.setItem(
            "admin_status",
            JSON.stringify({
              isAdmin: true,
              timestamp: Date.now(),
            })
          );
          return;
        }
      }
    } catch (err) {
      console.error("Error checking admin status:", err);
      setIsAdmin(false);
    } finally {
      setIsAdminLoading(false);
    }
  };

  // Add this function to initialize admin status on first load
  const initializeAdminStatus = useCallback(async () => {
    try {
      // Check localStorage for cached admin status with timestamp
      const cachedStatus = localStorage.getItem("admin_status");
      const now = Date.now();

      if (cachedStatus) {
        const { isAdmin: cachedIsAdmin, timestamp } = JSON.parse(cachedStatus);
        const age = now - timestamp;

        // Use cached result if less than 5 minutes old
        if (age < 5 * 60 * 1000) {
          console.log("Using cached admin status", cachedIsAdmin);
          setIsAdmin(cachedIsAdmin);
          setIsAdminLoading(false);
          return;
        }
      }

      // If no valid cache, check status
      await checkAdminStatus();
    } catch (err) {
      console.error("Error initializing admin status:", err);
      setIsAdminLoading(false);
    }
  }, []);

  // Use this in useEffect
  useEffect(() => {
    initializeAdminStatus();

    // Also listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      checkAdminStatus();
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
