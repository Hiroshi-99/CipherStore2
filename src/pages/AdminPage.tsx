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
    const [actionInProgress, setActionInProgress] = useState<string | null>(
      null
    );
    const [fetchError, setFetchError] = useState<string | null>(null);

    // Fetch users function
    const fetchUsers = useCallback(async () => {
      try {
        // First try the standard approach (will likely fail due to policy recursion)
        try {
          const { data, error } = await supabase
            .from("users")
            .select("*")
            .order("created_at", { ascending: false });

          if (!error) {
            // If successful, process the users
            const processedUsers = data.map((user) => ({
              id: user.id,
              email: user.email,
              fullName:
                user.full_name || user.email?.split("@")[0] || "Unknown",
              isAdmin: user.is_admin || false,
              lastSignIn: user.last_sign_in,
              createdAt: user.created_at,
            }));

            setUsers(processedUsers);
            return;
          }

          // If error is not recursion-related, throw it to be caught below
          if (error.code !== "42P17") {
            throw error;
          }

          // Continue to fallback if we have recursion error
        } catch (directError) {
          console.log(
            "Direct fetch failed, trying serverless function:",
            directError
          );
        }

        // Fallback to serverless function
        const response = await fetch("/.netlify/functions/get-users", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to fetch users");
        }

        const result = await response.json();

        // Process the users from the serverless function
        const processedUsers = result.users.map((user) => ({
          id: user.id,
          email: user.email,
          fullName: user.full_name || user.email?.split("@")[0] || "Unknown",
          isAdmin: user.is_admin || false,
          lastSignIn: user.last_sign_in,
          createdAt: user.created_at,
        }));

        setUsers(processedUsers);
      } catch (err) {
        console.error("Error fetching users:", err);
        toast.error("Failed to fetch users");

        // Set empty users array as fallback
        setUsers([]);
        setFetchError("Failed to fetch users. Please try again later.");
      }
    }, [supabase]);

    // Add admin function
    const addAdminByEmail = useCallback(async () => {
      if (!newAdminEmail) {
        toast.error("Please enter an email address");
        return;
      }

      try {
        setActionInProgress("adding-admin");

        // First try to find the user by email
        const { data: foundUsers, error: findError } = await supabase
          .from("users")
          .select("id, email")
          .ilike("email", newAdminEmail)
          .limit(1);

        if (findError) {
          throw findError;
        }

        if (!foundUsers || foundUsers.length === 0) {
          toast.error(`User with email ${newAdminEmail} not found`);
          return;
        }

        const userId = foundUsers[0].id;

        // Grant admin privileges to this user
        const { success, error } = await grantAdminPrivileges(userId);

        if (!success || error) {
          throw new Error(error || "Failed to grant admin privileges");
        }

        // Add this user to our local list of admins
        setUsers((prev) =>
          prev.map((user) =>
            user.id === userId ? { ...user, isAdmin: true } : user
          )
        );

        toast.success(`Admin privileges granted to ${newAdminEmail}`);
        setNewAdminEmail("");
      } catch (err) {
        console.error("Error adding admin:", err);
        toast.error("Failed to add admin user");
      } finally {
        setActionInProgress(null);
      }
    }, [newAdminEmail]);

    // Filtered users
    const filteredUsers = useMemo(() => {
      if (!users.length) return [];

      if (!userSearchTerm.trim()) return users;

      const searchLower = userSearchTerm.toLowerCase();

      return users.filter(
        (user) =>
          user.email?.toLowerCase().includes(searchLower) ||
          user.fullName?.toLowerCase().includes(searchLower) ||
          user.id?.toLowerCase().includes(searchLower)
      );
    }, [users, userSearchTerm]);

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
      actionInProgress,
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
    actionInProgress,
    fetchError,
  } = useUsersState();

  // Main component state
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [selectedTab, setSelectedTab] = useState("users");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<Order | null>(
    null
  );
  const [showImageModal, setShowImageModal] = useState(false);
  const [currentImageUrl, setCurrentImageUrl] = useState("");

  // Initialize the page
  useEffect(() => {
    setPageTitle("Admin Dashboard");

    const initializePage = async () => {
      try {
        setLoading(true);

        // Fetch the current user
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          navigate("/login");
          return;
        }

        setUser(user);

        // Check if the user is an admin
        const { isAdmin: userIsAdmin } = await checkIfAdmin(user.id);
        setIsAdmin(userIsAdmin);

        if (userIsAdmin) {
          // Fetch initial data
          if (selectedTab === "orders") {
            fetchOrders();
          } else if (selectedTab === "users") {
            fetchUsers();
          }
        }
      } catch (err) {
        console.error("Error initializing admin page:", err);
        toast.error("Failed to initialize admin dashboard");
      } finally {
        setLoading(false);
      }
    };

    initializePage();
  }, []);

  // Effect to load data when tab changes
  useEffect(() => {
    if (isAdmin) {
      if (selectedTab === "orders") {
        fetchOrders();
      } else if (selectedTab === "users") {
        fetchUsers();
      }
    }
  }, [selectedTab, isAdmin, fetchOrders, fetchUsers]);

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

  // Account delivery handler
  const deliverAccountDetails = useCallback(
    (orderId: string, accountId: string, password: string) => {
      // Update the orders list with the new account details
      setOrders((prevOrders) =>
        prevOrders.map((order) =>
          order.id === orderId
            ? {
                ...order,
                account_id: accountId,
                account_password: password,
                status: "delivered",
                delivery_date: new Date().toISOString(),
              }
            : order
        )
      );

      toast.success("Account delivered successfully");
    },
    []
  );

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
      const response = await fetch("/.netlify/functions/update-orders-schema", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update schema");
      }

      const result = await response.json();

      if (result.success) {
        toast.success("Database schema updated successfully! Refreshing...");
        // Reload the page after a short delay
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        throw new Error(result.message || "Schema update failed");
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

  // Handle approve and reject
  const handleApprove = useCallback(
    async (orderId: string) => {
      if (!confirm("Are you sure you want to approve this order?")) {
        return;
      }

      try {
        setActionInProgress(orderId);

        // Update the order status to active
        const { error } = await supabase
          .from("orders")
          .update({ status: "active" })
          .eq("id", orderId);

        if (error) {
          throw error;
        }

        // Update local state
        setOrders((prevOrders) =>
          prevOrders.map((order) =>
            order.id === orderId ? { ...order, status: "active" } : order
          )
        );

        // Update stats
        setStats((prev) => ({
          ...prev,
          pending: Math.max(0, prev.pending - 1),
          approved: prev.approved + 1,
        }));

        toast.success("Order approved successfully");
      } catch (err) {
        console.error("Error approving order:", err);
        toast.error("Failed to approve order");
      } finally {
        setActionInProgress(null);
      }
    },
    [setOrders, setStats, supabase]
  );

  const handleReject = useCallback(
    async (orderId: string) => {
      if (!confirm("Are you sure you want to reject this order?")) {
        return;
      }

      try {
        setActionInProgress(orderId);

        // Update the order status to rejected
        const { error } = await supabase
          .from("orders")
          .update({ status: "rejected" })
          .eq("id", orderId);

        if (error) {
          throw error;
        }

        // Update local state
        setOrders((prevOrders) =>
          prevOrders.map((order) =>
            order.id === orderId ? { ...order, status: "rejected" } : order
          )
        );

        // Update stats
        setStats((prev) => ({
          ...prev,
          pending: Math.max(0, prev.pending - 1),
          rejected: prev.rejected + 1,
        }));

        toast.success("Order rejected successfully");
      } catch (err) {
        console.error("Error rejecting order:", err);
        toast.error("Failed to reject order");
      } finally {
        setActionInProgress(null);
      }
    },
    [setOrders, setStats, supabase]
  );

  // Custom hook for order filtering
  const {
    searchTerm,
    setSearchTerm: setFilteredSearchTerm,
    selectedStatuses: filteredSelectedStatuses,
    setSelectedStatuses: setFilteredSelectedStatuses,
    filteredOrders,
  } = useOrderFilters(orders);

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
                          {order.customer_name || "Unknown Customer"}
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
                            <button
                              className="p-2 bg-green-500/20 hover:bg-green-500/30 text-green-300 rounded-full"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleApprove(order.id);
                              }}
                              disabled={actionInProgress === order.id}
                            >
                              <CheckCircle size={20} />
                            </button>
                            <button
                              className="p-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-full"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleReject(order.id);
                              }}
                              disabled={actionInProgress === order.id}
                            >
                              <XCircle size={20} />
                            </button>
                          </>
                        )}
                        <button
                          className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-full"
                          onClick={(e) => {
                            e.stopPropagation();
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
                    {isFetchingNextPage ? (
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
                disabled={actionInProgress === "adding-admin"}
                className="w-full px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded transition-colors flex items-center justify-center gap-2"
              >
                {actionInProgress === "adding-admin" ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  "Add Admin User"
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Loading state
  if (loading) {
    return (
      <PageContainer title="ADMIN">
        <div className="flex items-center justify-center min-h-[calc(100vh-5rem)]">
          <LoadingSpinner size="lg" light />
        </div>
      </PageContainer>
    );
  }

  // Not admin state
  if (!isAdmin) {
    return (
      <PageContainer title="ADMIN">
        <div className="flex items-center justify-center min-h-[calc(100vh-5rem)]">
          <div className="text-center max-w-md">
            <h2 className="text-xl text-white mb-4">Access Denied</h2>
            <p className="text-white/70 mb-6">
              You don't have permission to access this page. If you believe this
              is an error, you can try to fix the database settings.
            </p>
            <div className="flex flex-col gap-4 items-center">
              <button
                onClick={setupAdminTables}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors w-full"
              >
                Set Up Admin Tables
              </button>
              <button
                onClick={updateOrdersSchema}
                className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg transition-colors w-full"
              >
                Fix Orders Schema
              </button>
              <button
                onClick={checkDatabaseAccess}
                className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors w-full"
              >
                Check Database Access
              </button>
              <button
                onClick={() => navigate("/")}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors w-full"
              >
                Go Home
              </button>
            </div>
          </div>
        </div>
      </PageContainer>
    );
  }

  // Main admin dashboard
  return (
    <PageContainer title="ADMIN" showBack>
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
        onAccountDelivered={deliverAccountDetails}
      />
    </PageContainer>
  );
}

export default AdminPage;
