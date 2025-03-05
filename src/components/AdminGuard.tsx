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
    const isProduction = process.env.NODE_ENV === "production";
    const devOverride =
      window.localStorage.getItem("dev_admin_override") === "true";

    if (devOverride && !isProduction) {
      console.log("Using development admin override");
    } else {
      checkAdminStatus();
    }

    // Create a periodic check to ensure admin status stays valid
    const intervalId = setInterval(() => {
      if (!devOverride || isProduction) {
        checkAdminStatus();
      }
    }, 5 * 60 * 1000); // Check every 5 minutes

    return () => clearInterval(intervalId);
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
