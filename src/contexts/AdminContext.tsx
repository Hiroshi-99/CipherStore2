import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { checkIfAdmin } from "../lib/adminService";

interface AdminContextType {
  isAdmin: boolean;
  isAdminLoading: boolean;
  refreshAdminStatus: () => Promise<void>;
}

const AdminContext = createContext<AdminContextType>({
  isAdmin: false,
  isAdminLoading: true,
  refreshAdminStatus: async () => {},
});

export const useAdmin = () => useContext(AdminContext);

export const AdminProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAdminLoading, setIsAdminLoading] = useState(true);

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

      const adminStatus = await checkIfAdmin(session.user.id);
      setIsAdmin(adminStatus);
    } catch (err) {
      console.error("Error checking admin status:", err);
      setIsAdmin(false);
    } finally {
      setIsAdminLoading(false);
    }
  };

  useEffect(() => {
    checkAdminStatus();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      checkAdminStatus();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const refreshAdminStatus = async () => {
    await checkAdminStatus();
  };

  return (
    <AdminContext.Provider
      value={{ isAdmin, isAdminLoading, refreshAdminStatus }}
    >
      {children}
    </AdminContext.Provider>
  );
};
