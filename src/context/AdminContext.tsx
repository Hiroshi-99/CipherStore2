import React, { createContext, useState, useContext, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { toast } from "sonner";

// Define interfaces inline to avoid circular imports
interface OrderType {
  id: string;
  status: string;
  // Add other required fields here
}

interface AdminContextType {
  actionInProgress: string | null;
  handleApprove: (orderId: string) => Promise<any>;
  handleReject: (orderId: string) => Promise<any>;
  // Add other admin actions here
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export const AdminProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

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

      // Return success for UI updates
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

      // Return success for UI updates
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
        actionInProgress,
        handleApprove,
        handleReject,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
};

export const useAdmin = () => {
  const context = useContext(AdminContext);
  if (context === undefined) {
    throw new Error("useAdmin must be used within an AdminProvider");
  }
  return context;
};
