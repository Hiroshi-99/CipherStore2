import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { isAdmin } from "../lib/auth";
import LoadingSpinner from "./LoadingSpinner";

interface AdminGuardProps {
  children: React.ReactNode;
}

function AdminGuard({ children }: AdminGuardProps) {
  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkAdmin();
  }, []);

  const checkAdmin = async () => {
    try {
      setError(null);
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        setLoading(false);
        return;
      }

      const adminStatus = await isAdmin(session.user.id);
      setIsAuthorized(adminStatus);
    } catch (err) {
      console.error("Error checking admin status:", err);
      setError("Failed to verify admin privileges");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <LoadingSpinner size="lg" light />
          <p className="text-white text-lg">Verifying admin access...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="bg-black/50 p-8 rounded-xl max-w-md text-center">
          <p className="text-red-400 text-lg mb-4">{error}</p>
          <button
            onClick={() => checkAdmin()}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 rounded text-white transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

export default AdminGuard;
