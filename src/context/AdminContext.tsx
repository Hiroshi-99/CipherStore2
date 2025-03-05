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
        return;
      }

      console.log("Checking admin status for user:", session.user.id);
      const result = await checkIfAdmin(session.user.id);
      console.log("Admin check result:", result);

      if (result?.isAdmin || result?.success) {
        setIsAdmin(true);
      } else {
        setIsAdmin(false);
      }
    } catch (err) {
      console.error("Error checking admin status:", err);
      setIsAdmin(false);
    } finally {
      setIsAdminLoading(false);
    }
  };

  // Run the check on initial load
  useEffect(() => {
    checkAdminStatus();
  }, []);

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
