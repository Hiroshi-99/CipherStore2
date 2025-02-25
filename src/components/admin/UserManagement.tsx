import React, { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { toast } from "sonner";
import { User, CheckCircle, XCircle, RefreshCw, Shield } from "lucide-react";
import {
  grantAdminPrivileges,
  revokeAdminPrivileges,
} from "../../lib/adminService";
import LoadingSpinner from "../LoadingSpinner";

interface UserData {
  id: string;
  email: string;
  fullName: string;
  isAdmin: boolean;
  lastSignIn: string | null;
  createdAt: string;
}

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);

      // Get the current user
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!currentUser) {
        toast.error("Not authenticated");
        return;
      }

      // Fetch users from the users table
      const { data: usersData, error: usersError } = await supabase
        .from("users")
        .select("*")
        .order("created_at", { ascending: false });

      if (usersError) {
        console.error("Error fetching users:", usersError);
        toast.error("Failed to fetch users");
        return;
      }

      // Fetch admin users
      const { data: adminUsers, error: adminError } = await supabase
        .from("admin_users")
        .select("user_id");

      if (adminError) {
        console.error("Error fetching admin users:", adminError);
      }

      // Create a set of admin user IDs for quick lookup
      const adminUserIds = new Set(
        adminUsers?.map((admin) => admin.user_id) || []
      );

      // Map the users data to the expected format
      const formattedUsers =
        usersData?.map((user) => ({
          id: user.id,
          email: user.email || "",
          fullName: user.full_name || "",
          isAdmin: adminUserIds.has(user.id) || user.is_admin,
          lastSignIn: user.last_sign_in,
          createdAt: user.created_at,
        })) || [];

      setUsers(formattedUsers);
    } catch (err) {
      console.error("Error in fetchUsers:", err);
      toast.error("Failed to fetch users");
    } finally {
      setLoading(false);
    }
  };

  const handleGrantAdmin = async (userId: string) => {
    try {
      setActionInProgress(userId);

      // Get the current user
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!currentUser) {
        toast.error("Not authenticated");
        return;
      }

      const result = await grantAdminPrivileges(currentUser.id, userId);

      if (result.success) {
        toast.success("Admin privileges granted successfully");

        // Update local state
        setUsers(
          users.map((user) =>
            user.id === userId ? { ...user, isAdmin: true } : user
          )
        );
      } else {
        toast.error(result.error || "Failed to grant admin privileges");
      }
    } catch (err) {
      console.error("Error granting admin privileges:", err);
      toast.error("Failed to grant admin privileges");
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRevokeAdmin = async (userId: string) => {
    try {
      setActionInProgress(userId);

      // Get the current user
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!currentUser) {
        toast.error("Not authenticated");
        return;
      }

      // Don't allow revoking your own admin privileges
      if (userId === currentUser.id) {
        toast.error("You cannot revoke your own admin privileges");
        setActionInProgress(null);
        return;
      }

      const result = await revokeAdminPrivileges(currentUser.id, userId);

      if (result.success) {
        toast.success("Admin privileges revoked successfully");

        // Update local state
        setUsers(
          users.map((user) =>
            user.id === userId ? { ...user, isAdmin: false } : user
          )
        );
      } else {
        toast.error(result.error || "Failed to revoke admin privileges");
      }
    } catch (err) {
      console.error("Error revoking admin privileges:", err);
      toast.error("Failed to revoke admin privileges");
    } finally {
      setActionInProgress(null);
    }
  };

  const addAdminByEmail = async () => {
    try {
      if (!newAdminEmail.trim()) {
        toast.error("Please enter an email address");
        return;
      }

      setActionInProgress("new");

      // Get the current user
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!currentUser) {
        toast.error("Not authenticated");
        return;
      }

      // Find the user by email
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("id")
        .eq("email", newAdminEmail.trim())
        .single();

      if (userError || !userData) {
        toast.error("User not found with that email address");
        return;
      }

      const result = await grantAdminPrivileges(currentUser.id, userData.id);

      if (result.success) {
        toast.success("Admin privileges granted successfully");
        setNewAdminEmail("");
        fetchUsers();
      } else {
        toast.error(result.error || "Failed to grant admin privileges");
      }
    } catch (err) {
      console.error("Error adding admin by email:", err);
      toast.error("Failed to add admin");
    } finally {
      setActionInProgress(null);
    }
  };

  // Filter users based on search term
  const filteredUsers = users.filter(
    (user) =>
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.fullName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <LoadingSpinner size="lg" light />
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl text-white mb-6">User Management</h2>

      {/* Search and Add Admin */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search users..."
              className="w-full bg-white/10 border border-white/20 rounded-lg pl-10 pr-4 py-2 text-white placeholder-white/50 focus:outline-none focus:border-white/40"
            />
            <User
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/50"
              size={18}
            />
          </div>
        </div>

        <button
          onClick={fetchUsers}
          className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 transition-colors flex items-center gap-2"
        >
          <RefreshCw
            className={`w-4 h-4 ${
              actionInProgress === "refresh" ? "animate-spin" : ""
            }`}
          />
          Refresh
        </button>
      </div>

      {/* Add Admin Form */}
      <div className="mb-6 p-4 bg-white/5 rounded-lg">
        <h3 className="text-lg font-medium mb-4">Add Admin User</h3>
        <div className="flex gap-2">
          <input
            type="email"
            value={newAdminEmail}
            onChange={(e) => setNewAdminEmail(e.target.value)}
            placeholder="User email address"
            className="flex-1 px-3 py-2 bg-gray-800 rounded border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={addAdminByEmail}
            disabled={actionInProgress === "new"}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {actionInProgress === "new" ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Adding...
              </>
            ) : (
              <>
                <Shield className="w-4 h-4" />
                Add Admin
              </>
            )}
          </button>
        </div>
      </div>

      {/* Users List */}
      {filteredUsers.length === 0 ? (
        <div className="bg-white/5 rounded-lg p-8 text-center">
          <p className="text-white/70">No users found</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-white/10 text-left">
                <th className="px-4 py-3 text-white/70 font-medium">User</th>
                <th className="px-4 py-3 text-white/70 font-medium">Status</th>
                <th className="px-4 py-3 text-white/70 font-medium">Joined</th>
                <th className="px-4 py-3 text-white/70 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id} className="border-t border-white/10">
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-white font-medium">
                        {user.fullName || "No Name"}
                      </p>
                      <p className="text-white/70 text-sm">{user.email}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        user.isAdmin
                          ? "bg-emerald-400/20 text-emerald-400"
                          : "bg-blue-400/20 text-blue-400"
                      }`}
                    >
                      {user.isAdmin ? "ADMIN" : "USER"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-white/70">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {user.isAdmin ? (
                        <button
                          onClick={() => handleRevokeAdmin(user.id)}
                          disabled={!!actionInProgress}
                          className="p-2 hover:bg-white/10 rounded-full transition-colors disabled:opacity-50"
                          title="Revoke admin privileges"
                        >
                          <XCircle className="text-red-400" size={20} />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleGrantAdmin(user.id)}
                          disabled={!!actionInProgress}
                          className="p-2 hover:bg-white/10 rounded-full transition-colors disabled:opacity-50"
                          title="Grant admin privileges"
                        >
                          <CheckCircle className="text-green-400" size={20} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
