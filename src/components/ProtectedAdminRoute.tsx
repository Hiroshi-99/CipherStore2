import React from "react";
import { Navigate } from "react-router-dom";
import { useAdmin } from "../contexts/AdminContext";
import LoadingSpinner from "./LoadingSpinner";

interface ProtectedAdminRouteProps {
  children: React.ReactNode;
}

const ProtectedAdminRoute: React.FC<ProtectedAdminRouteProps> = ({
  children,
}) => {
  const { isAdmin, isAdminLoading } = useAdmin();

  if (isAdminLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" light />
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default ProtectedAdminRoute;
