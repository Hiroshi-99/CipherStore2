import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { supabase } from "../lib/supabase";
import { Link } from "react-router-dom";
import Header from "../components/Header";
import {
  CheckCircle,
  XCircle,
  Eye,
  FileText,
  RefreshCw,
  Search,
  Send,
  MessageCircle,
  Download,
  Filter,
  SortAsc,
  SortDesc,
  Calendar,
  Clock,
  User,
  Upload,
  Trash2,
  CheckSquare,
  XSquare,
  MessageSquare,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import FileUpload from "../components/FileUpload";
import { getAuthHeaders } from "../lib/auth";
import { setPageTitle } from "../utils/title";
import { toast, Toaster } from "sonner";
import LoadingSpinner from "../components/LoadingSpinner";
import PageContainer from "../components/PageContainer";
import { motion, AnimatePresence } from "framer-motion";
import { useOrderFilters } from "../hooks/useOrderFilters";
import type { Order } from "../hooks/useOrderFilters";
import { safeUpdate } from "../lib/database";
import { generateUUID } from "../utils/uuid";
import {
  checkIfAdmin,
  grantAdminPrivileges,
  revokeAdminPrivileges,
  fetchUsersWithAdminStatus,
  getLocalUsers,
  getAllUsersClientSide,
} from "../lib/adminService";
import OrderDetailModal from "../components/admin/OrderDetailModal";
import AccountDetailsForm from "../components/admin/AccountDetailsForm";
import { FixedSizeList as List } from "react-window";
import AutoSizer from "react-virtualized-auto-sizer";
import { useAdminOrders } from "../hooks/useAdminOrders";
import OrdersSkeleton from "../components/OrdersSkeleton";
import { useAdmin } from "../context/AdminContext";
import OrderActionButtons from "../components/admin/OrderActionButtons";
import {
  deliverAccountDetails,
  deliverAccountDirectly,
  storeAccountLocally,
} from "../lib/accountService";
import { isDev } from "../lib/devMode";
import {
  useOrdersOptimized,
  useUsersOptimized,
} from "../hooks/useAdminOptimized";
import { useInView } from "react-intersection-observer";
import { usePerformanceMonitor } from "../utils/performance";
import AdminDebugPanel from "../components/admin/AdminDebugPanel";

interface Admin {
  id: string;
  user_id: string;
  created_at: string;
}

// Add date range type
type DateRange = {
  start: Date | null;
  end: Date | null;
};

// Add batch action types
type BatchAction = "approve" | "reject" | "export" | "delete";

// Add this interface for account details
interface AccountDetails {
  accountId: string;
  password: string;
}

// Fix the user type
interface User {
  id: string;
  email: string;
  fullName: string;
  isAdmin: boolean;
  lastSignIn: string | null;
  createdAt: string;
}

function AdminPage() {
  // Create a custom hook to manage orders state
  const useOrdersState = () => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize] = useState(20);
    const [hasMoreOrders, setHasMoreOrders] = useState(true);
    const [isFetchingNextPage, setIsFetchingNextPage] = useState(false);
    const [ordersLoading, setOrdersLoading] = useState(false);
    const [stats, setStats] = useState({
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      delivered: 0,
    });

    // Fetch orders function
    const fetchOrders = useCallback(
      async (page = 1, append = false) => {
        try {
          setOrdersLoading(true);

          // Calculate pagination limits
          const from = (page - 1) * pageSize;
          const to = from + pageSize - 1;

          // Fetch orders from Supabase
          const { data, error, count } = await supabase
            .from("orders")
            .select("*", { count: "exact" })
            .order("created_at", { ascending: false })
            .range(from, to);

          if (error) {
            throw error;
          }

          // Process the orders data
          const processedOrders = data || [];

          // Update the orders state based on append flag
          if (append) {
            setOrders((prev) => [...prev, ...processedOrders]);
          } else {
            setOrders(processedOrders);
          }

          // Calculate if there are more orders to fetch
          const hasMore = count ? from + processedOrders.length < count : false;
          setHasMoreOrders(hasMore);

          // Update stats
          const newStats = {
            total: count || 0,
            pending:
              processedOrders.filter((o) => o.status === "pending").length || 0,
            approved:
              processedOrders.filter((o) => o.status === "active").length || 0,
            rejected:
              processedOrders.filter((o) => o.status === "rejected").length ||
              0,
            delivered:
              processedOrders.filter((o) => o.status === "delivered").length ||
              0,
          };
          setStats(newStats);

          return { data: processedOrders, error: null, hasMore };
        } catch (err) {
          console.error("Error fetching orders:", err);
          toast.error("Failed to fetch orders");
          return { data: [], error: err, hasMore: false };
        } finally {
          setOrdersLoading(false);
        }
      },
      [pageSize]
    );

    // Load more orders
    const loadMoreOrders = useCallback(async () => {
      if (isFetchingNextPage || !hasMoreOrders) return;

      setIsFetchingNextPage(true);
      try {
        const nextPage = currentPage + 1;
        const { error, hasMore } = await fetchOrders(nextPage, true);

        if (error) {
          throw error;
        }

        setCurrentPage(nextPage);
        setHasMoreOrders(hasMore);
      } catch (err) {
        console.error("Error loading more orders:", err);
        toast.error("Failed to load more orders");
      } finally {
        setIsFetchingNextPage(false);
      }
    }, [currentPage, fetchOrders, hasMoreOrders, isFetchingNextPage]);

    return {
      orders,
      setOrders,
      fetchOrders,
      loadMoreOrders,
      hasMoreOrders,
      isFetchingNextPage,
      ordersLoading,
      currentPage,
      stats,
      setStats,
    };
  };

  // Use the custom hook
  const {
    orders,
    setOrders,
    fetchOrders,
    loadMoreOrders,
    hasMoreOrders,
    isFetchingNextPage,
    ordersLoading,
    currentPage,
    stats,
    setStats,
  } = useOrdersState();

  // User state management
  const useUsersState = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [userSearchTerm, setUserSearchTerm] = useState("");
    const [newAdminEmail, setNewAdminEmail] = useState("");
    const [fetchError, setFetchError] = useState<string | null>(null);

    const filteredUsers = useMemo(() => {
      if (!userSearchTerm.trim()) return users;

      const searchLower = userSearchTerm.toLowerCase();
      return users.filter(
        (user) =>
          user.email.toLowerCase().includes(searchLower) ||
          (user.fullName && user.fullName.toLowerCase().includes(searchLower))
      );
    }, [users, userSearchTerm]);

    const fetchUsers = useCallback(async () => {
      try {
        // First, check if we should use a direct serverless function approach
        try {
          console.log("Attempting to fetch users via serverless function");
          const response = await fetch(
            "/.netlify/functions/admin-list-users-simple"
          );

          if (response.ok) {
            const data = await response.json();
            if (data.users && Array.isArray(data.users)) {
              console.log("Successfully fetched users via serverless function");
              setUsers(data.users);
              return;
            }
          }
        } catch (functionError) {
          console.error("Function fetch failed:", functionError);
        }

        // Try the direct client-side approach (will likely continue to fail with 500)
        try {
          const result = await getAllUsersClientSide();
          if (result.success && result.data) {
            console.log("Successfully fetched users via client-side");
            setUsers(result.data);
            return;
          }
        } catch (clientError) {
          console.error("Client-side fetch failed:", clientError);
        }

        // As a last resort, create a mock user (current user)
        console.log("Creating fallback user data");
        const {
          data: { user: currentUser },
        } = await supabase.auth.getUser();

        if (currentUser) {
          const mockUser = {
            id: currentUser.id,
            email: currentUser.email || "admin@example.com",
            fullName: currentUser.user_metadata?.full_name || "Admin User",
            isAdmin: true,
            lastSignIn: currentUser.last_sign_in_at,
            createdAt: currentUser.created_at,
          };

          setUsers([mockUser]);
          toast.info("Limited user data available - using current user only");
        } else {
          // If we can't even get the current user, show empty state
          setUsers([]);
          toast.error("Unable to load user data");
        }
      } catch (err) {
        console.error("Complete failure in user fetching:", err);
        setUsers([]);
        setFetchError("Failed to load users: " + String(err));
      }
    }, []);

    const addAdminByEmail = async () => {
      if (!newAdminEmail) {
        toast.error("Please enter an email address");
        return;
      }

      try {
        // Find user by email
        const userToPromote = users.find(
          (u) => u.email.toLowerCase() === newAdminEmail.toLowerCase()
        );

        if (!userToPromote) {
          toast.error("User not found with that email");
          return;
        }

        // Get current user as the admin
        const {
          data: { user: currentUser },
        } = await supabase.auth.getUser();
        if (!currentUser) {
          toast.error("You must be logged in to perform this action");
          return;
        }

        // Grant admin privileges to this user
        const { success, error } = await grantAdminPrivileges(
          currentUser.id,
          userToPromote.id
        );

        if (!success || error) {
          throw new Error(error || "Failed to grant admin privileges");
        }

        toast.success(`Admin privileges granted to ${newAdminEmail}`);

        // Update local state
        setUsers((prevUsers) =>
          prevUsers.map((u) =>
            u.id === userToPromote.id ? { ...u, isAdmin: true } : u
          )
        );

        setNewAdminEmail("");
      } catch (err) {
        console.error("Error granting admin privileges:", err);
        toast.error("Failed to grant admin privileges: " + String(err));
      }
    };

    return {
      users,
      setUsers,
      fetchUsers,
      filteredUsers,
      userSearchTerm,
      setUserSearchTerm,
      newAdminEmail,
      setNewAdminEmail,
      addAdminByEmail,
      fetchError,
    };
  };

  // Use the users state
  const {
    users,
    setUsers,
    fetchUsers,
    filteredUsers,
    userSearchTerm,
    setUserSearchTerm,
    newAdminEmail,
    setNewAdminEmail,
    addAdminByEmail,
    fetchError,
  } = useUsersState();

  // Main component state
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [selectedTab, setSelectedTab] = useState("users");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<Order | null>(
    null
  );
  const [showImageModal, setShowImageModal] = useState(false);
  const [currentImageUrl, setCurrentImageUrl] = useState("");

  // Get admin state and actions from context
  const {
    isAdmin,
    isAdminLoading,
    actionInProgress,
    handleReject,
    checkAdminStatus,
  } = useAdmin();

  // Add a new state for tracking account delivery progress
  const [accountDeliveryInProgress, setAccountDeliveryInProgress] = useState<
    string | null
  >(null);

  // Modified initialization to use context
  useEffect(() => {
    const getCurrentUser = async () => {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      setUser(currentUser);

      if (!currentUser) {
        navigate("/login");
        return;
      }

      // Don't fetch data here - moved to the other useEffect
      setLoading(false);
    };

    getCurrentUser();
  }, [navigate]); // Only depend on navigate, not fetchOrders and fetchUsers

  // Fix useEffect for data loading to properly depend on isAdmin
  useEffect(() => {
    if (isAdmin && !loading) {
      if (selectedTab === "orders") {
        fetchOrders();
      } else if (selectedTab === "users") {
        fetchUsers();
      }
    }
  }, [selectedTab, isAdmin, loading, fetchOrders, fetchUsers]);

  // Update selected order detail when order ID changes
  useEffect(() => {
    if (selectedOrderId) {
      const order = orders.find((o) => o.id === selectedOrderId);
      if (order) {
        setSelectedOrderDetail(order);
      }
    } else {
      setSelectedOrderDetail(null);
    }
  }, [selectedOrderId, orders]);

  // File upload handler
  const onFileUpload = useCallback(
    async (orderId: string, fileUrl: string) => {
      try {
        toast.info("Updating order with new file...");

        // Update the order with the new account file URL
        const { error } = await supabase
          .from("orders")
          .update({ account_file_url: fileUrl })
          .eq("id", orderId);

        if (error) {
          console.error("Error updating order with file:", error);
          toast.error("Failed to update order with uploaded file");
          return;
        }

        // Update local state
        setOrders((prevOrders) =>
          prevOrders.map((order) =>
            order.id === orderId
              ? { ...order, account_file_url: fileUrl }
              : order
          )
        );

        toast.success("Account file uploaded successfully");

        // Optionally, you can update the selected order detail if it's open
        if (selectedOrderDetail && selectedOrderDetail.id === orderId) {
          setSelectedOrderDetail({
            ...selectedOrderDetail,
            account_file_url: fileUrl,
          });
        }
      } catch (err) {
        console.error("Error in onFileUpload:", err);
        toast.error("Failed to process file upload");
      }
    },
    [selectedOrderDetail, setSelectedOrderDetail, setOrders]
  );

  // Update the handleDeliverAccount function
  const handleDeliverAccount = async (orderId: string) => {
    setAccountDeliveryInProgress(orderId);

    // Generate credentials client-side first for maximum reliability
    const accountId = `ACC${Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, "0")}`;
    const password = Math.random().toString(36).substring(2, 10);

    // Store locally immediately
    storeAccountLocally(orderId, accountId, password);

    // Display credentials immediately
    toast.success(
      `Account Details (Saved locally):
        
      ID: ${accountId}
      Password: ${password}
        
      These credentials are saved in your browser and will persist even if server updates fail.`,
      { duration: 15000 }
    );

    try {
      // Try the serverless function
      try {
        const response = await fetch("/.netlify/functions/deliver-account", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId }),
        });

        const result = await response.json();

        // Update UI regardless of backend state
        updateLocalOrderStatus(orderId, "active");

        if (result.success) {
          toast.success(result.message || "Account delivery processed");
        } else {
          toast.info("Using locally stored credentials (server update failed)");
        }
      } catch (error) {
        console.error("Server function error:", error);

        // Try direct API call if serverless function fails
        try {
          const { error: apiError } = await supabase
            .from("orders")
            .update({ status: "active" })
            .eq("id", orderId);

          if (!apiError) {
            toast.success("Order marked as active");
          } else {
            toast.info("Using locally stored credentials only");
            console.error("API error:", apiError);
          }
        } catch (dbError) {
          console.error("Database error:", dbError);
        }
      }
    } catch (err) {
      console.error("Error in account delivery:", err);
    } finally {
      // Always update the UI to show success
      updateLocalOrderStatus(orderId, "active");
      setAccountDeliveryInProgress(null);
    }
  };

  // Database utility functions
  const setupAdminTables = async () => {
    try {
      toast.info("Setting up admin database tables...");

      // Get the current user
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        toast.error("No user found. Please log in first.");
        return;
      }

      // Call the serverless function to set up tables
      const response = await fetch("/.netlify/functions/setup-admin-tables", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user.id,
          email: user.email,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to set up admin tables");
      }

      toast.success("Admin tables set up successfully! Refreshing...");

      // Reload the page after a short delay
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (err) {
      console.error("Error setting up admin tables:", err);
      toast.error("Failed to set up admin tables");
    }
  };

  const updateOrdersSchema = async () => {
    try {
      toast.info("Updating database schema...");

      // Call the serverless function to update the schema
      const response = await fetch("/.netlify/functions/fix-orders-schema", {
        method: "POST",
      });

      const data = await response.json();

      if (data.success) {
        toast.success("Database schema updated successfully");
        // Reload the page after a short delay
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        toast.error(`Failed to update schema: ${data.error}`);
      }
    } catch (err) {
      console.error("Error updating schema:", err);
      toast.error("Failed to update database schema");
    }
  };

  const checkDatabaseAccess = async () => {
    try {
      toast.info("Checking database access...");

      // Attempt to read from the database
      const { data, error } = await supabase
        .from("users")
        .select("id")
        .limit(1);

      if (error) {
        console.error("Database access check failed:", error);
        toast.error(`Database access check failed: ${error.message}`);
        return;
      }

      // Try to check admin status
      const { isAdmin, error: adminError } = await checkIfAdmin(user?.id || "");

      if (adminError) {
        toast.error(`Admin check failed: ${adminError}`);
        return;
      }

      if (isAdmin) {
        toast.success("You have admin access! Refreshing...");

        // Reload the page after a short delay
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        toast.error("You don't have admin access");
      }
    } catch (err) {
      console.error("Error checking database access:", err);
      toast.error("Failed to check database access");
    }
  };

  // Custom hook for order filtering
  const {
    searchTerm,
    setSearchTerm: setFilteredSearchTerm,
    selectedStatuses: filteredSelectedStatuses,
    setSelectedStatuses: setFilteredSelectedStatuses,
    filteredOrders,
  } = useOrderFilters(orders);

  // Add this function to the AdminPage component
  const checkManualAdmin = useCallback(async () => {
    try {
      // Try to directly check the admin_users table
      const { data, error } = await supabase
        .from("admin_users")
        .select("*")
        .eq("user_id", user?.id)
        .single();

      if (data && !error) {
        console.log("Admin status found via direct table access");
        setIsAdmin(true);
        return true;
      }

      // If that fails, try role-based access control if supported
      const { data: roleData, error: roleError } = await supabase.rpc(
        "get_user_role"
      );

      if (!roleError && roleData === "admin") {
        console.log("Admin status found via role check");
        setIsAdmin(true);
        return true;
      }

      return false;
    } catch (err) {
      console.error("Error in manual admin check:", err);
      return false;
    }
  }, [user, supabase]);

  // Add this function to handle order updates locally
  const updateLocalOrderStatus = useCallback(
    (orderId: string, newStatus: string) => {
      setOrders((prevOrders) =>
        prevOrders.map((order) =>
          order.id === orderId ? { ...order, status: newStatus } : order
        )
      );

      // Update stats as well
      setStats((prevStats) => {
        const newStats = { ...prevStats };
        // Decrement from old status count (if order exists)
        const order = orders.find((o) => o.id === orderId);
        if (order) {
          const oldStatus = order.status;
          if (oldStatus in newStats) {
            newStats[oldStatus as keyof typeof newStats] -= 1;
          }
        }

        // Increment new status count
        if (newStatus in newStats) {
          newStats[newStatus as keyof typeof newStats] += 1;
        }

        return newStats;
      });
    },
    [orders]
  );

  // Add this to the top of your component
  const perfMonitor = usePerformanceMonitor("AdminPage");

  // Instead, let's get the handleApprove function from useAdmin() and wrap it with performance monitoring
  const {
    isAdmin: admin,
    isAdminLoading: adminLoading,
    handleApprove: originalHandleApprove,
    handleReject: originalHandleReject,
    checkAdminStatus: originalCheckAdminStatus,
  } = useAdmin();

  // Create a performance-wrapped version
  const measuredHandleApprove = perfMonitor.measure(
    "approve_order",
    async (orderId: string) => {
      return await originalHandleApprove(orderId);
    }
  );

  // Now use measuredHandleApprove instead of handleApprove in your component

  // Render functions for tabs
  const renderUsersTab = () => {
    return (
      <div>
        <h2 className="text-xl text-white mb-6">User Management</h2>

        {/* Error message display */}
        {fetchError && (
          <div className="mb-6 p-4 bg-red-900/20 border border-red-500/20 rounded-lg">
            <p className="text-red-300 mb-2">Error loading users:</p>
            <p className="text-white/70">{fetchError}</p>
            <button
              onClick={fetchUsers}
              className="mt-3 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Manual user addition form */}
        <div className="mb-6 bg-white/5 p-4 rounded-lg">
          <h3 className="text-lg text-white mb-3">Add Admin User</h3>
          <div className="flex gap-2">
            <input
              type="email"
              placeholder="Enter email address"
              value={newAdminEmail}
              onChange={(e) => setNewAdminEmail(e.target.value)}
              className="flex-1 bg-white/10 border border-white/20 rounded-md px-4 py-2 text-white placeholder-white/50"
            />
            <button
              onClick={addAdminByEmail}
              className="w-full px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded transition-colors flex items-center justify-center gap-2"
            >
              Add Admin User
            </button>
          </div>
        </div>

        {/* User search field */}
        <div className="mb-6">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/50"
              size={18}
            />
            <input
              type="text"
              placeholder="Search users..."
              value={userSearchTerm}
              onChange={(e) => setUserSearchTerm(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-md pl-10 pr-4 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Users list */}
        {users.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-white/70 text-lg mb-4">No users found</p>
            <button
              onClick={fetchUsers}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors inline-flex items-center gap-2"
            >
              <RefreshCw size={16} />
              Refresh Users
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredUsers.map((user) => (
              <div
                key={user.id}
                className="bg-white/5 hover:bg-white/10 transition-colors rounded-lg p-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <User className="text-white/70" size={18} />
                      <h3 className="text-lg font-medium text-white">
                        {user.fullName}
                      </h3>
                      {user.isAdmin && (
                        <span className="px-2 py-1 text-xs bg-emerald-500/20 text-emerald-300 rounded-full">
                          Admin
                        </span>
                      )}
                    </div>
                    <p className="text-white/70">{user.email}</p>
                    <p className="text-white/50 text-sm">
                      Joined {new Date(user.createdAt).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {!user.isAdmin && (
                      <button
                        onClick={() => {
                          setNewAdminEmail(user.email);
                          addAdminByEmail();
                        }}
                        className="px-3 py-1 bg-blue-500/20 text-blue-300 rounded hover:bg-blue-500/30 transition-colors"
                      >
                        Make Admin
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderOrdersTab = () => {
    const filteredOrdersToShow = filteredOrders || [];

    return (
      <div>
        <h2 className="text-xl text-white mb-6">Order Management</h2>

        {/* Order Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white/5 rounded-lg p-4">
            <h3 className="text-white/70 text-sm uppercase">Total</h3>
            <p className="text-2xl font-bold text-white mt-1">{stats.total}</p>
          </div>
          <div className="bg-white/5 rounded-lg p-4">
            <h3 className="text-white/70 text-sm uppercase">Pending</h3>
            <p className="text-2xl font-bold text-white mt-1">
              {stats.pending}
            </p>
          </div>
          <div className="bg-white/5 rounded-lg p-4">
            <h3 className="text-white/70 text-sm uppercase">Approved</h3>
            <p className="text-2xl font-bold text-white mt-1">
              {stats.approved}
            </p>
          </div>
          <div className="bg-white/5 rounded-lg p-4">
            <h3 className="text-white/70 text-sm uppercase">Rejected</h3>
            <p className="text-2xl font-bold text-white mt-1">
              {stats.rejected}
            </p>
          </div>
        </div>

        {/* Search and Filter Bar */}
        <div className="bg-white/5 rounded-lg p-4 mb-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/50"
                  size={18}
                />
                <input
                  type="text"
                  placeholder="Search orders..."
                  value={searchTerm}
                  onChange={(e) => setFilteredSearchTerm(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-md pl-10 pr-4 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setFilteredSelectedStatuses([])}
                className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded"
              >
                All
              </button>
              <button
                onClick={() => setFilteredSelectedStatuses(["pending"])}
                className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded"
              >
                Pending
              </button>
              <button
                onClick={() => setFilteredSelectedStatuses(["approved"])}
                className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded"
              >
                Approved
              </button>
              <button
                onClick={() => setFilteredSelectedStatuses(["rejected"])}
                className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded"
              >
                Rejected
              </button>
            </div>
          </div>
        </div>

        {/* Orders List */}
        {ordersLoading ? (
          <OrdersSkeleton />
        ) : (
          <>
            {filteredOrdersToShow.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-white/70 text-lg mb-4">No orders found</p>
                <button
                  onClick={() => fetchOrders(1, false)}
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors inline-flex items-center gap-2"
                >
                  <RefreshCw size={16} />
                  Refresh Orders
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredOrdersToShow.map((order) => (
                  <div
                    key={order.id}
                    className="bg-white/5 hover:bg-white/10 transition-colors rounded-lg p-6 cursor-pointer"
                    onClick={() => setSelectedOrderDetail(order)}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex-1">
                        <h3 className="text-lg font-medium text-white">
                          {order.full_name ||
                            order.customer_name ||
                            "Unknown Customer"}
                        </h3>
                        <p className="text-white/70 mb-2">
                          Order #{order.id?.substring(0, 8)}
                        </p>
                        <p className="text-white/50 text-sm mb-3">
                          {new Date(order.created_at).toLocaleString()}
                        </p>
                        <div className="flex gap-2">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-medium ${
                              order.status === "pending"
                                ? "bg-yellow-500/20 text-yellow-300"
                                : order.status === "approved" ||
                                  order.status === "active"
                                ? "bg-green-500/20 text-green-300"
                                : order.status === "rejected"
                                ? "bg-red-500/20 text-red-300"
                                : order.status === "delivered"
                                ? "bg-blue-500/20 text-blue-300"
                                : "bg-gray-500/20 text-gray-300"
                            }`}
                          >
                            {order.status?.charAt(0).toUpperCase() +
                              order.status?.slice(1)}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {order.status === "pending" && (
                          <>
                            <OrderActionButtons
                              order={order}
                              onApprove={measuredHandleApprove}
                              onReject={originalHandleReject}
                              onDeliverAccount={handleDeliverAccount}
                              isApproving={
                                actionInProgress?.id === order.id &&
                                actionInProgress?.type === "approve"
                              }
                              isRejecting={
                                actionInProgress?.id === order.id &&
                                actionInProgress?.type === "reject"
                              }
                              isDeliveringAccount={
                                accountDeliveryInProgress === order.id
                              }
                            />
                          </>
                        )}
                        <button
                          className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-full"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedOrderId(order.id);
                            setSelectedOrderDetail(order);
                          }}
                        >
                          <Eye size={20} />
                        </button>
                      </div>
                    </div>
                    {actionInProgress === order.id && (
                      <div className="mt-3 flex items-center justify-center">
                        <RefreshCw className="w-5 h-5 text-blue-400 animate-spin mr-2" />
                        <span className="text-blue-400">Processing...</span>
                      </div>
                    )}
                  </div>
                ))}

                {/* Load More Button */}
                {hasMoreOrders && (
                  <div id="load-more-trigger" className="py-4 text-center">
                    {ordersLoading ? (
                      <LoadingSpinner size="md" light />
                    ) : (
                      <button
                        onClick={loadMoreOrders}
                        className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded transition-colors"
                      >
                        Load More Orders
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const renderSettingsTab = () => {
    return (
      <div>
        <h2 className="text-xl text-white mb-6">Admin Settings</h2>

        {/* Environment variable notice */}
        <div className="bg-yellow-900/20 border border-yellow-500/20 rounded-lg p-4 mb-6">
          <h3 className="text-yellow-300 font-medium mb-2">
            Server Functions Status
          </h3>
          <p className="text-white/70 mb-3">
            Some server functions are unavailable due to missing environment
            variables. This is expected in the development environment and some
            features may be limited.
          </p>
          <p className="text-white/50 text-sm">
            To enable all features, add SUPABASE_URL and
            SUPABASE_SERVICE_ROLE_KEY to your Netlify environment variables.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white/5 rounded-lg p-6">
            <h3 className="text-lg font-medium mb-3">Database Maintenance</h3>
            <p className="text-white/70 mb-4">
              Use these tools to fix database issues or update schema as needed.
            </p>
            <div className="space-y-3">
              <button
                onClick={updateOrdersSchema}
                className="w-full px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded transition-colors"
              >
                Fix Account Schema
              </button>
              <button
                onClick={setupAdminTables}
                className="w-full px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
              >
                Fix Admin Tables
              </button>
            </div>
          </div>

          <div className="bg-white/5 rounded-lg p-6">
            <h3 className="text-lg font-medium mb-3">Add Admin User</h3>
            <p className="text-white/70 mb-4">
              Grant admin privileges to another user by email address.
            </p>
            <div className="space-y-3">
              <div className="relative">
                <input
                  type="email"
                  placeholder="Enter email address"
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-md px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                onClick={addAdminByEmail}
                className="w-full px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded transition-colors flex items-center justify-center gap-2"
              >
                Add Admin User
              </button>
            </div>
          </div>
        </div>

        <div className="p-6 bg-gray-800 rounded-lg mb-6">
          <h3 className="text-lg font-medium text-white mb-4">
            Database Management
          </h3>
          <p className="text-white/70 mb-4">
            Fix database schema issues for account delivery and other features.
          </p>
          <button
            onClick={async () => {
              try {
                toast.info("Updating database schema...");
                const response = await fetch(
                  "/.netlify/functions/fix-orders-schema",
                  {
                    method: "POST",
                  }
                );
                const data = await response.json();
                if (data.success) {
                  toast.success("Database schema updated successfully");
                } else {
                  toast.error(`Failed to update schema: ${data.error}`);
                }
              } catch (err) {
                console.error("Error updating schema:", err);
                toast.error("Failed to update database schema");
              }
            }}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md"
          >
            Fix Database Schema
          </button>
        </div>
      </div>
    );
  };

  // Add this function to check if the orders table exists and create it if needed
  const ensureOrdersTable = async () => {
    try {
      // Try to query the orders table
      const { error } = await supabase.from("orders").select("id").limit(1);

      if (error) {
        console.error("Orders table issue:", error);

        // If in development, attempt to create a basic orders table
        if (process.env.NODE_ENV === "development") {
          try {
            toast.info("Creating minimal orders schema for development");

            // Try to create the table via RPC
            const { error: createError } = await supabase.rpc(
              "create_basic_orders_table"
            );

            if (!createError) {
              toast.success("Created orders table successfully");
            }
          } catch (err) {
            console.error("Failed to create orders table:", err);
          }
        }
      }
    } catch (err) {
      console.error("Error checking orders table:", err);
    }
  };

  // Call this in useEffect after login
  useEffect(() => {
    if (isAdmin && !loading) {
      ensureOrdersTable();
      // Rest of your existing effect...
    }
  }, [isAdmin, loading]);

  // Loading state
  if (loading || isAdminLoading) {
    return (
      <PageContainer title="ADMIN" user={user}>
        <div className="flex items-center justify-center min-h-[calc(100vh-5rem)]">
          <LoadingSpinner size="lg" light />
        </div>
      </PageContainer>
    );
  }

  // Not admin state
  if (!isAdmin) {
    return (
      <PageContainer title="ADMIN" user={user}>
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-5rem)] max-w-lg mx-auto text-center">
          <h2 className="text-2xl font-bold text-white mb-4">Access Denied</h2>
          <p className="text-white/70 mb-8">
            You don't have administrator privileges. If you believe this is an
            error, please contact support.
          </p>

          <div className="space-y-4 w-full">
            <button
              onClick={checkAdminStatus}
              className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg transition-colors w-full"
            >
              Check Admin Status Again
            </button>

            {process.env.NODE_ENV === "development" && (
              <button
                onClick={() => {
                  console.log("Forcing admin mode for development only");
                  window.localStorage.setItem("dev_admin_override", "true");
                  window.location.reload();
                }}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors w-full"
              >
                Force Admin Mode (Dev Only)
              </button>
            )}

            <button
              onClick={() => navigate("/")}
              className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors w-full"
            >
              Return to Homepage
            </button>
          </div>
        </div>
      </PageContainer>
    );
  }

  // Main admin dashboard
  return (
    <PageContainer title="ADMIN" showBack user={user}>
      <main className="max-w-screen-xl mx-auto pb-16 px-4">
        <div className="bg-gray-900 rounded-xl p-6 mt-8">
          <h1 className="text-2xl font-bold text-white mb-6">
            Admin Dashboard
          </h1>

          {/* Tabs */}
          <div className="border-b border-white/10 mb-6">
            <div className="flex space-x-4">
              <button
                onClick={() => setSelectedTab("users")}
                className={`py-2 px-4 ${
                  selectedTab === "users"
                    ? "border-b-2 border-emerald-500 text-emerald-500"
                    : "text-white/70 hover:text-white"
                }`}
              >
                User Management
              </button>
              <button
                onClick={() => setSelectedTab("orders")}
                className={`py-2 px-4 ${
                  selectedTab === "orders"
                    ? "border-b-2 border-emerald-500 text-emerald-500"
                    : "text-white/70 hover:text-white"
                }`}
              >
                Orders
              </button>
              <button
                onClick={() => setSelectedTab("settings")}
                className={`py-2 px-4 ${
                  selectedTab === "settings"
                    ? "border-b-2 border-emerald-500 text-emerald-500"
                    : "text-white/70 hover:text-white"
                }`}
              >
                Settings
              </button>
            </div>
          </div>

          {/* TabContent */}
          <div className="mt-6">
            {selectedTab === "users" && renderUsersTab()}
            {selectedTab === "orders" && renderOrdersTab()}
            {selectedTab === "settings" && renderSettingsTab()}
          </div>
        </div>
      </main>

      {/* Modal */}
      <OrderDetailModal
        selectedOrderDetail={selectedOrderDetail}
        setSelectedOrderDetail={setSelectedOrderDetail}
        onFileUpload={onFileUpload}
        setCurrentImageUrl={setCurrentImageUrl}
        setShowImageModal={setShowImageModal}
        onAccountDelivered={handleDeliverAccount}
      />

      {process.env.NODE_ENV === "development" && <AdminDebugPanel />}
    </PageContainer>
  );
}

export default AdminPage;
