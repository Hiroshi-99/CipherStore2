import React, { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAdmin } from "../context/AdminContext";
import LoadingSpinner from "./LoadingSpinner";

interface AdminGuardProps {
  children: React.ReactNode;
}

const AdminGuard: React.FC<AdminGuardProps> = ({ children }) => {
  const { isAdmin, isAdminLoading, checkAdminStatus } = useAdmin();

  useEffect(() => {
    // Check for dev override
    const devOverride = window.localStorage.getItem("dev_admin_override");
    if (devOverride === "true") {
      console.log("Using development admin override");
    } else {
      // Refresh admin status on mount
      checkAdminStatus();
    }
  }, [checkAdminStatus]);

  // Handle dev override mode
  const devAdminOverride =
    window.localStorage.getItem("dev_admin_override") === "true";

  if (isAdminLoading && !devAdminOverride) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" light />
      </div>
    );
  }

  if (!isAdmin && !devAdminOverride) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default AdminGuard;
