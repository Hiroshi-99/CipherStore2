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
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState<
    "all" | "pending" | "approved" | "rejected"
  >("all");
  const [sortBy, setSortBy] = useState<"date" | "status" | "name">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [dateRange, setDateRange] = useState<DateRange>({
    start: null,
    end: null,
  });
  const [showFilters, setShowFilters] = useState(false);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
  });
  const navigate = useNavigate();
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [showBatchActions, setShowBatchActions] = useState(false);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const searchDebounceRef = useRef<NodeJS.Timeout>();
  const [showImageModal, setShowImageModal] = useState(false);
  const [currentImageUrl, setCurrentImageUrl] = useState("");
  const [accountDetails, setAccountDetails] = useState<AccountDetails>({
    accountId: "",
    password: "",
  });
  const [formErrors, setFormErrors] = useState({
    accountId: false,
  });
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectedTab, setSelectedTab] = useState("users");
  const [fallbackMode, setFallbackMode] = useState(false);
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>("all");
  const [orderDateRange, setOrderDateRange] = useState<{
    start: Date | null;
    end: Date | null;
  }>({ start: null, end: null });
  const [orderSearchQuery, setOrderSearchQuery] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(
    new Set()
  );
  const [isOrderActionInProgress, setIsOrderActionInProgress] = useState(false);
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<Order | null>(
    null
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [hasMoreOrders, setHasMoreOrders] = useState(true);
  const [isFetchingNextPage, setIsFetchingNextPage] = useState(false);

  // This will define the selectedOrder based on the selectedOrderId
  const selectedOrder = selectedOrderId
    ? orders.find((order) => order.id === selectedOrderId)
    : null;

  // Use the custom hook for order filtering
  const {
    searchTerm: filteredSearchTerm,
    setSearchTerm: setFilteredSearchTerm,
    selectedStatuses: filteredSelectedStatuses,
    setSelectedStatuses: setFilteredSelectedStatuses,
    dateRange: filteredDateRange,
    setDateRange: setFilteredDateRange,
    sortBy: filteredSortBy,
    setSortBy: setFilteredSortBy,
    sortOrder: filteredSortOrder,
    setSortOrder: setFilteredSortOrder,
    toggleSort: toggleFilteredSort,
    filteredOrders,
    stats: filteredStats,
    clearFilters: clearFilteredFilters,
  } = useOrderFilters(orders);

  // Add this effect to update selectedOrderDetail when selectedOrderId changes
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

  // Memoize event handlers and computed values
  const handleViewOrderDetails = useCallback(
    (orderId: string) => {
      setSelectedOrderId(orderId);
      const order = orders.find((o) => o.id === orderId);
      if (order) {
        setSelectedOrderDetail(order);
      }
    },
    [orders]
  );

  const handleApprove = useCallback(async (orderId: string) => {
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

      if (error) throw error;

      // Update optimistically
      setOrders((prevOrders) =>
        prevOrders.map((order) =>
          order.id === orderId ? { ...order, status: "active" } : order
        )
      );

      toast.success("Order approved successfully");
    } catch (err) {
      console.error("Error in handleApprove:", err);
      toast.error("Failed to approve order");
    } finally {
      setActionInProgress(null);
    }
  }, []);

  const handleReject = useCallback(async (orderId: string) => {
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

      if (error) throw error;

      // Update optimistically
      setOrders((prevOrders) =>
        prevOrders.map((order) =>
          order.id === orderId ? { ...order, status: "rejected" } : order
        )
      );

      toast.success("Order rejected successfully");
    } catch (err) {
      console.error("Error in handleReject:", err);
      toast.error("Failed to reject order");
    } finally {
      setActionInProgress(null);
    }
  }, []);

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

        // Check if the user is an admin
        const { isAdmin: userIsAdmin } = await checkIfAdmin(user.id);
        setIsAdmin(userIsAdmin);

        if (userIsAdmin) {
          // Fetch initial data for the dashboard
          fetchOrders();

          // Fetch users data if needed
          if (selectedTab === "users") {
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

  // Add a function to fetch users
  const fetchUsers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      // Transform the data to match our User interface
      const processedUsers = data.map((user) => ({
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
    }
  }, [supabase]);

  // Optimize the fetchOrders function to properly retrieve all orders
  const fetchOrders = useCallback(
    async (page = 1, append = false) => {
      try {
        setLoading(true);

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

        // Update stats
        const newStats = {
          total: count || 0,
          pending:
            data?.filter((order) => order.status === "pending").length || 0,
          approved:
            data?.filter((order) => order.status === "active").length || 0,
          rejected:
            data?.filter((order) => order.status === "rejected").length || 0,
        };
        setStats(newStats);

        return { data: processedOrders, error: null, hasMore };
      } catch (err) {
        console.error("Error fetching orders:", err);
        toast.error("Failed to fetch orders");
        return { data: [], error: err, hasMore: false };
      } finally {
        setLoading(false);
      }
    },
    [pageSize, supabase]
  );

  // Add a function to load more orders
  const loadMoreOrders = useCallback(async () => {
    if (isFetchingNextPage || !hasMoreOrders) return;

    setIsFetchingNextPage(true);
    try {
      // Calculate the next page to fetch
      const nextPage = currentPage + 1;

      // Fetch the next page of orders
      const { data, error, hasMore } = await fetchOrders(nextPage, true);

      if (error) {
        throw error;
      }

      // Update the current page
      setCurrentPage(nextPage);

      // Update hasMoreOrders based on the response
      setHasMoreOrders(hasMore);
    } catch (err) {
      console.error("Error loading more orders:", err);
      toast.error("Failed to load more orders");
    } finally {
      setIsFetchingNextPage(false);
    }
  }, [currentPage, fetchOrders, hasMoreOrders, isFetchingNextPage]);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    await fetchOrders();
  };

  const handlePaymentAction = useCallback(
    async (orderId: string, status: "approved" | "rejected") => {
      if (actionInProgress) return;
      setActionInProgress(orderId);

      setOrders((prev) =>
        prev.map((order) =>
          order.id === orderId
            ? {
                ...order,
                status: status === "approved" ? "active" : "rejected",
                payment_proofs: order.payment_proofs?.map((proof) => ({
                  ...proof,
                  status,
                })),
              }
            : order
        )
      );

      try {
        const response = await fetch(
          "/.netlify/functions/discord-update-payment",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              orderId,
              status,
              notes: `Payment ${status} by admin`,
            }),
          }
        );

        if (!response.ok) throw new Error("Failed to update payment status");

        toast.success(`Payment ${status} successfully`);
        await fetchOrders();
      } catch (error) {
        console.error("Error updating payment status:", error);
        await fetchOrders();
        toast.error("Failed to update payment status");
      } finally {
        setActionInProgress(null);
      }
    },
    [actionInProgress, fetchOrders]
  );

  const handleFileUploadSuccess = useCallback(
    async (orderId: string, fileUrl: string) => {
      try {
        const response = await fetch("/.netlify/functions/admin-upload-file", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ orderId, fileUrl }),
        });

        if (!response.ok) throw new Error("Failed to process file upload");

        setUploadedFileUrl(fileUrl);
        toast.success("File uploaded successfully");
        await fetchOrders();
      } catch (error) {
        console.error("Error processing file upload:", error);
        toast.error("Failed to process file upload");
      }
    },
    [fetchOrders]
  );

  // Calculate stats
  const calculateStats = useCallback((orders: Order[]) => {
    return orders.reduce(
      (acc, order) => ({
        total: acc.total + 1,
        pending: acc.pending + (order.status === "pending" ? 1 : 0),
        approved: acc.approved + (order.status === "active" ? 1 : 0),
        rejected: acc.rejected + (order.status === "rejected" ? 1 : 0),
      }),
      {
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
      }
    );
  }, []);

  // Add export function
  const handleExport = useCallback(() => {
    const csv = [
      [
        "Order ID",
        "Name",
        "Email",
        "Status",
        "Date",
        "Has Account File",
        "Messages",
      ],
      ...filteredOrders.map((order) => [
        order.id,
        order.full_name,
        order.email,
        order.status,
        new Date(order.created_at).toLocaleString(),
        order.account_file_url ? "Yes" : "No",
        order.messages?.length || 0,
      ]),
    ]
      .map((row) => row.join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orders-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  }, [filteredOrders]);

  // Add stats display component
  const StatsDisplay = () => (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {Object.entries(stats).map(([key, value]) => (
        <div key={key} className="bg-white/5 p-4 rounded-lg">
          <h3 className="text-white/70 capitalize">{key}</h3>
          <p className="text-2xl font-bold text-white">{value}</p>
        </div>
      ))}
    </div>
  );

  // Add batch action handler
  const handleBatchAction = async (action: BatchAction) => {
    try {
      setIsBatchProcessing(true);

      switch (action) {
        case "approve": {
          if (selectedOrders.size === 0) {
            toast.error("No orders selected");
            return;
          }

          // Get selected order IDs
          const orderIds = Array.from(selectedOrders);

          // Show loading toast
          const toastId = toast.loading(
            `Approving ${orderIds.length} orders...`
          );

          try {
            // Update all selected orders to approved status
            const { error } = await supabase
              .from("orders")
              .update({ status: "approved" })
              .in("id", orderIds);

            if (error) throw error;

            // Update local state
            setOrders((prev) =>
              prev.map((order) =>
                selectedOrders.has(order.id)
                  ? { ...order, status: "approved" }
                  : order
              )
            );

            // Show success message with account details prompt
            if (orderIds.length === 1) {
              toast.success(
                "Order approved! Please enter account details to send to the customer.",
                { id: toastId, duration: 5000 }
              );

              // Select the single order for account details entry
              setSelectedOrderId(orderIds[0]);

              // Scroll to the account details section
              const accountDetailsSection = document.getElementById(
                "account-details-section"
              );
              if (accountDetailsSection) {
                accountDetailsSection.scrollIntoView({ behavior: "smooth" });

                // Focus on the first input field after a short delay
                setTimeout(() => {
                  const accountIdInput =
                    document.getElementById("account-id-input");
                  if (accountIdInput) {
                    (accountIdInput as HTMLInputElement).focus();
                  }
                }, 500);
              }
            } else {
              toast.success(
                `${orderIds.length} orders approved! Please enter account details for each order individually.`,
                { id: toastId, duration: 5000 }
              );
            }
          } catch (error) {
            console.error("Error approving orders:", error);
            toast.error("Failed to approve orders. Please try again.", {
              id: toastId,
            });
          }

          // Clear selection
          setSelectedOrders(new Set());

          break;
        }
        case "reject": {
          await Promise.all(
            Array.from(selectedOrders).map((orderId) =>
              handlePaymentAction(orderId, "rejected")
            )
          );
          toast.success(`Successfully rejected ${selectedOrders.size} orders`);
          break;
        }
        case "export": {
          const selectedOrdersData = filteredOrders.filter((order) =>
            selectedOrders.has(order.id)
          );
          handleExport();
          break;
        }
        case "delete": {
          if (!window.confirm(`Delete ${selectedOrders.size} orders?`)) return;
          // Implement delete logic here
          break;
        }
      }
    } catch (err) {
      console.error(`Failed to ${action} orders:`, err);
      toast.error(`Failed to ${action} orders`);
    } finally {
      setIsBatchProcessing(false);
    }
  };

  // Add debounced search
  const handleSearchChange = (value: string) => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    searchDebounceRef.current = setTimeout(() => {
      setFilteredSearchTerm(value);
    }, 300);
  };

  // Add image preview handler
  const handleImagePreview = (url: string) => {
    setCurrentImageUrl(url);
    setShowImageModal(true);
  };

  // Replace the existing uploadDirectToSupabase function with this version
  const uploadDirectToSupabase = async (file: File): Promise<string | null> => {
    try {
      // Generate a unique file name
      const fileName = `account_${Date.now()}-${file.name.replace(
        /[^a-zA-Z0-9.]/g,
        "_"
      )}`;

      // Show progress in the toast
      const toastId = toast.loading("Uploading account details...");

      // Upload directly to Supabase storage
      const { data, error } = await supabase.storage
        .from("account_files")
        .upload(`accounts/${fileName}`, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (error) {
        console.error("Error uploading to Supabase storage:", error);
        toast.error("Upload failed. Please try again.", {
          id: toastId,
        });
        return null;
      }

      // Get the public URL
      const { data: urlData } = supabase.storage
        .from("account_files")
        .getPublicUrl(`accounts/${fileName}`);

      toast.success("Account details uploaded successfully!", { id: toastId });
      return urlData.publicUrl;
    } catch (err) {
      console.error("Error in direct Supabase upload:", err);
      toast.error("Upload failed. Please try again.");
      return null;
    }
  };

  // Add validation function
  const validateAccountDetails = () => {
    const errors = {
      accountId: !accountDetails.accountId.trim(),
    };

    setFormErrors(errors);
    return !Object.values(errors).some(Boolean);
  };

  // Update the handleAccountDetailsUpload function
  const handleAccountDetailsUpload = async () => {
    try {
      if (!selectedOrderId) {
        toast.error("Please select an order first");
        return;
      }

      // Validate form
      if (!validateAccountDetails()) {
        toast.error("Please fill in all required fields");
        return;
      }

      setActionInProgress("uploading");
      const toastId = toast.loading("Sending account details...");

      // Get the selected order
      const selectedOrder = orders.find(
        (order) => order.id === selectedOrderId
      );
      if (!selectedOrder) {
        toast.error("Order not found", { id: toastId });
        return;
      }

      // Create account details object
      const accountData = {
        accountId: accountDetails.accountId,
        password: accountDetails.password,
      };

      // Get current user info for the message
      const { data: userData } = await supabase.auth.getUser();
      const userName = userData?.user?.user_metadata?.full_name || "Admin";
      const userAvatar =
        userData?.user?.user_metadata?.avatar_url ||
        "/images/support-avatar.png";

      // Create a formatted message with account details
      const formattedMessage = `
**Account Details**

**Account ID:** ${accountData.accountId}
**Password:** ${accountData.password}

Please keep these details secure. You can copy them by selecting the text.
      `.trim();

      // Generate a proper UUID for the message
      const messageId = generateUUID();

      // Create a message to send the account details
      const { error: messageError } = await supabase.from("messages").insert({
        id: messageId,
        order_id: selectedOrder.id,
        user_id: userData?.user?.id,
        content: formattedMessage,
        is_admin: true,
        created_at: new Date().toISOString(),
        user_name: userName,
        user_avatar: userAvatar,
      });

      if (messageError) {
        console.error("Error creating message:", messageError);
        toast.error("Failed to send account details", { id: toastId });
        throw messageError;
      }

      // Show success message
      toast.success("Account details sent to customer successfully!", {
        id: toastId,
      });

      // Reset form
      setAccountDetails({
        accountId: "",
        password: "",
      });
    } catch (err) {
      console.error("Error handling account details upload:", err);
      toast.error("Failed to send account details. Please try again.");
    } finally {
      setActionInProgress(null);
    }
  };

  // Add this function to deliver account details to users
  const deliverAccountDetails = useCallback(
    (orderId: string, accountDetails: AccountDetails) => {
      // Update the orders list with the new account details
      setOrders((prevOrders) =>
        prevOrders.map((order) =>
          order.id === orderId
            ? {
                ...order,
                account_id: accountDetails.accountId,
                account_password: accountDetails.password,
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

  // Add this function to fix schema issues
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

  // Add this function to set up admin tables
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

          {/* Other settings panels */}
        </div>
      </div>
    );
  };

  // Make sure this is defined OUTSIDE any inner functions or event handlers
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

  // Add the renderOrdersTab function before the return statement
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
        {loading ? (
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
                                : order.status === "approved"
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
                  </div>
                ))}

                {/* Load More Button */}
                {hasMoreOrders && (
                  <div id="load-more-trigger" className="py-4 text-center">
                    {loading ? (
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

  // Add the missing checkDatabaseAccess function
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

  // Add implementation for addAdminByEmail function
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
  }, [newAdminEmail, supabase, grantAdminPrivileges]);

  if (loading) {
    return (
      <PageContainer title="ADMIN">
        <div className="flex items-center justify-center min-h-[calc(100vh-5rem)]">
          <LoadingSpinner size="lg" light />
        </div>
      </PageContainer>
    );
  }

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

          {/* User Management Tab */}
          {selectedTab === "users" && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl text-white">User Management</h2>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search users..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:border-white/40 w-64"
                  />
                  <div className="absolute right-3 top-2.5 text-white/50">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Users Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-white">
                  <thead className="bg-white/5 text-left">
                    <tr>
                      <th className="px-4 py-3 rounded-tl-lg">Name</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Created</th>
                      <th className="px-4 py-3 rounded-tr-lg">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {filteredUsers.length > 0 ? (
                      filteredUsers.map((user) => (
                        <tr key={user.id} className="hover:bg-white/5">
                          <td className="px-4 py-3">
                            {user.fullName || "N/A"}
                          </td>
                          <td className="px-4 py-3">{user.email}</td>
                          <td className="px-4 py-3">
                            {user.isAdmin ? (
                              <span className="bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-full text-xs">
                                Admin
                              </span>
                            ) : (
                              <span className="bg-blue-500/20 text-blue-400 px-2 py-1 rounded-full text-xs">
                                User
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {new Date(user.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3">
                            {user.isAdmin ? (
                              <button
                                onClick={() => handleRevokeAdmin(user.id)}
                                disabled={
                                  actionInProgress === user.id ||
                                  user.id === currentUser.id
                                }
                                className={`px-3 py-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors ${
                                  actionInProgress === user.id ||
                                  user.id === currentUser.id
                                    ? "opacity-50 cursor-not-allowed"
                                    : ""
                                }`}
                              >
                                {actionInProgress === user.id ? (
                                  <span className="flex items-center">
                                    <LoadingSpinner size="sm" light />
                                    <span className="ml-2">Revoking...</span>
                                  </span>
                                ) : (
                                  "Revoke Admin"
                                )}
                              </button>
                            ) : (
                              <button
                                onClick={() => handleGrantAdmin(user.id)}
                                disabled={actionInProgress === user.id}
                                className={`px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30 transition-colors ${
                                  actionInProgress === user.id
                                    ? "opacity-50 cursor-not-allowed"
                                    : ""
                                }`}
                              >
                                {actionInProgress === user.id ? (
                                  <span className="flex items-center">
                                    <LoadingSpinner size="sm" light />
                                    <span className="ml-2">Granting...</span>
                                  </span>
                                ) : (
                                  "Make Admin"
                                )}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-4 py-8 text-center text-white/50"
                        >
                          {searchTerm ? (
                            <>
                              <p>No users matching "{searchTerm}"</p>
                              <button
                                onClick={() => setSearchTerm("")}
                                className="mt-2 px-4 py-2 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-colors"
                              >
                                Clear search
                              </button>
                            </>
                          ) : (
                            <p>No users found</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-6 p-4 bg-white/5 rounded-lg">
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
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white transition-colors"
                  >
                    Add Admin
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Orders Tab */}
          {selectedTab === "orders" && renderOrdersTab()}

          {/* Settings Tab */}
          {selectedTab === "settings" && renderSettingsTab()}
        </div>
      </main>
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
