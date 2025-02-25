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
type BatchAction = "approve" | "reject" | "export" | "delete" | "clear-history";

// Add this interface for account details
interface AccountDetails {
  accountId: string;
  password: string;
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

  // Define handleApprove early in the component
  const handleApprove = useCallback(
    async (orderId: string) => {
      try {
        if (actionInProgress) return;

        setActionInProgress(orderId);

        // Update order status directly without prompting for file upload
        const { error } = await supabase
          .from("orders")
          .update({ status: "approved" })
          .eq("id", orderId);

        if (error) throw error;

        // Update local state
        setOrders((prev) =>
          prev.map((order) =>
            order.id === orderId ? { ...order, status: "approved" } : order
          )
        );

        // Show success message with account details prompt
        toast.success(
          "Order approved! Please enter account details to send to the customer.",
          { duration: 5000 }
        );

        // Select the order for account details entry
        setSelectedOrderId(orderId);

        // Scroll to the account details section
        const accountDetailsSection = document.getElementById(
          "account-details-section"
        );
        if (accountDetailsSection) {
          accountDetailsSection.scrollIntoView({ behavior: "smooth" });

          // Focus on the first input field after a short delay
          setTimeout(() => {
            const accountIdInput = document.getElementById("account-id-input");
            if (accountIdInput) {
              (accountIdInput as HTMLInputElement).focus();
            }
          }, 500);
        }
      } catch (error) {
        console.error("Error approving order:", error);
        toast.error("Failed to approve order. Please try again.");
      } finally {
        setActionInProgress(null);
      }
    },
    [actionInProgress]
  );

  useEffect(() => {
    setPageTitle("Admin");
    fetchOrders();
    checkAdminStatus();
  }, []);

  const fetchOrders = useCallback(async () => {
    try {
      setError(null);
      const { data: ordersData, error: ordersError } = await supabase
        .from("orders")
        .select(
          `
          *,
          payment_proofs(id, image_url, status),
          messages(id)
        `
        )
        .order("created_at", { ascending: false });

      if (ordersError) throw ordersError;
      setOrders(ordersData || []);

      // Update stats
      setStats(calculateStats(ordersData || []));
    } catch (error) {
      console.error("Error fetching orders:", error);
      setError("Failed to load orders");
      toast.error("Failed to load orders");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const checkAdminStatus = async () => {
    try {
      const { data: adminData, error: adminError } = await supabase
        .from("admin_users")
        .select("*");

      if (adminError) throw adminError;
      setAdmins(adminData || []);
      setIsOwner(adminData?.some((admin) => admin.is_owner));
    } catch (error) {
      console.error("Error checking admin status:", error);
      setError("Failed to verify admin status");
    }
  };

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

            // Clear selection
            setSelectedOrders(new Set());
          } catch (error) {
            console.error("Error approving orders:", error);
            toast.error("Failed to approve orders. Please try again.", {
              id: toastId,
            });
          } finally {
            setIsBatchProcessing(false);
          }

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
        case "clear-history": {
          if (selectedOrders.size === 0) {
            toast.error("No orders selected");
            return;
          }

          // Get selected order IDs
          const orderIds = Array.from(selectedOrders);

          // Show loading toast
          const toastId = toast.loading(
            `Clearing chat history for ${orderIds.length} orders...`
          );

          try {
            // Delete all messages for these orders
            const { error } = await supabase
              .from("messages")
              .delete()
              .in("order_id", orderIds);

            if (error) throw error;

            // Update local state to reflect the cleared chat
            setOrders((prev) =>
              prev.map((order) =>
                selectedOrders.has(order.id)
                  ? { ...order, messages: [] }
                  : order
              )
            );

            toast.success(
              `Chat history cleared for ${orderIds.length} orders!`,
              { id: toastId }
            );

            // Clear selection
            setSelectedOrders(new Set());
          } catch (error) {
            console.error("Error clearing chat history:", error);
            toast.error("Failed to clear chat history. Please try again.", {
              id: toastId,
            });
          } finally {
            setIsBatchProcessing(false);
          }

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

  // Update the handleAccountDetailsUpload function to use proper UUIDs
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

      // Create account details object - simplified
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

      // Create a formatted message with account details - simplified
      const formattedMessage = `
**Account Details**

**Account ID:** ${accountData.accountId}
**Password:** ${accountData.password}

Please keep these details secure. You can copy them by selecting the text.
      `.trim();

      // Generate a proper UUID for the message
      const messageId = crypto.randomUUID();

      // Create a message to send the account details
      const { error: messageError } = await supabase.from("messages").insert({
        id: messageId, // Use the generated UUID
        order_id: selectedOrder.id,
        user_id: userData?.user?.id,
        content: formattedMessage,
        is_admin: true,
        created_at: new Date().toISOString(),
        user_name: userName,
        user_avatar: userAvatar,
        is_account_details: true,
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

      // Reset form - simplified
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

  // Add this function to the AdminPage component to clear chat history
  const handleClearChatHistory = async (orderId: string) => {
    try {
      if (!orderId || actionInProgress) return;

      setActionInProgress(`clear-${orderId}`);
      const toastId = toast.loading("Clearing chat history...");

      // Delete all messages for this order
      const { error } = await supabase
        .from("messages")
        .delete()
        .eq("order_id", orderId);

      if (error) {
        console.error("Error clearing chat history:", error);
        toast.error("Failed to clear chat history", { id: toastId });
        return;
      }

      // Update local state to reflect the cleared chat
      setOrders((prev) =>
        prev.map((order) =>
          order.id === orderId ? { ...order, messages: [] } : order
        )
      );

      toast.success("Chat history cleared successfully", { id: toastId });
    } catch (err) {
      console.error("Error clearing chat history:", err);
      toast.error("Failed to clear chat history");
    } finally {
      setActionInProgress(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return (
    <PageContainer title="ADMIN" user={null}>
      <Toaster position="top-right" />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <StatsDisplay />

        <div className="backdrop-blur-md bg-black/30 p-6 rounded-2xl">
          {/* Batch Actions */}
          <div className="relative">
            <button
              onClick={() => setShowBatchActions(!showBatchActions)}
              disabled={selectedOrders.size === 0 || isBatchProcessing}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Batch Actions ({selectedOrders.size})
              <span
                className={`transition-transform ${
                  showBatchActions ? "rotate-180" : ""
                }`}
              >
                ▼
              </span>
            </button>

            {showBatchActions && (
              <div className="absolute top-full left-0 mt-1 w-48 bg-gray-800 rounded-md shadow-lg z-10">
                <button
                  onClick={() => handleBatchAction("approve")}
                  disabled={isBatchProcessing}
                  className="w-full text-left px-4 py-2 hover:bg-gray-700 text-white flex items-center gap-2"
                >
                  <CheckCircle size={16} className="text-green-400" />
                  Approve
                </button>
                <button
                  onClick={() => handleBatchAction("reject")}
                  disabled={isBatchProcessing}
                  className="w-full text-left px-4 py-2 hover:bg-gray-700 text-white flex items-center gap-2"
                >
                  <XCircle size={16} className="text-red-400" />
                  Reject
                </button>
                <button
                  onClick={() => handleBatchAction("export")}
                  disabled={isBatchProcessing}
                  className="w-full text-left px-4 py-2 hover:bg-gray-700 text-white flex items-center gap-2"
                >
                  <Download size={16} className="text-blue-400" />
                  Export
                </button>
                <button
                  onClick={() => handleBatchAction("clear-history")}
                  disabled={isBatchProcessing}
                  className="w-full text-left px-4 py-2 hover:bg-gray-700 text-white flex items-center gap-2"
                >
                  <RefreshCw size={16} className="text-yellow-400" />
                  Clear Chat History
                </button>
                <button
                  onClick={() => handleBatchAction("delete")}
                  disabled={isBatchProcessing}
                  className="w-full text-left px-4 py-2 hover:bg-gray-700 text-white flex items-center gap-2 border-t border-gray-600"
                >
                  <XCircle size={16} className="text-red-400" />
                  Delete
                </button>
              </div>
            )}
          </div>

          {/* Update Controls section */}
          <div className="flex flex-wrap items-center gap-4 mb-6">
            <div className="flex-1 flex flex-wrap items-center gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search orders..."
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="pl-10 pr-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-white/40"
                />
              </div>

              <button
                onClick={() => setShowFilters(!showFilters)}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                title="Toggle filters"
              >
                <Filter className="w-5 h-5 text-white" />
              </button>

              <button
                onClick={handleExport}
                className="px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded-lg flex items-center gap-2"
                title="Export to CSV"
              >
                <Download className="w-4 h-4" />
                Export
              </button>
            </div>

            {/* View mode toggle */}
            <div className="flex items-center gap-2 bg-white/5 rounded-lg p-1">
              <button
                onClick={() => setViewMode("list")}
                className={`p-2 rounded ${
                  viewMode === "list" ? "bg-white/10" : ""
                }`}
              >
                List
              </button>
              <button
                onClick={() => setViewMode("grid")}
                className={`p-2 rounded ${
                  viewMode === "grid" ? "bg-white/10" : ""
                }`}
              >
                Grid
              </button>
            </div>
          </div>

          {/* Filters panel */}
          {showFilters && (
            <div className="mb-6 p-4 bg-white/5 rounded-lg">
              <h3 className="text-white mb-4">Filters</h3>
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-white/70" />
                  <input
                    type="date"
                    onChange={(e) =>
                      setFilteredDateRange((prev) => ({
                        ...prev,
                        start: e.target.value ? new Date(e.target.value) : null,
                      }))
                    }
                    className="bg-white/10 border border-white/20 rounded px-2 py-1 text-white"
                  />
                  <span className="text-white/70">to</span>
                  <input
                    type="date"
                    onChange={(e) =>
                      setFilteredDateRange((prev) => ({
                        ...prev,
                        end: e.target.value ? new Date(e.target.value) : null,
                      }))
                    }
                    className="bg-white/10 border border-white/20 rounded px-2 py-1 text-white"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-white/70" />
                  <select
                    multiple
                    value={filteredSelectedStatuses}
                    onChange={(e) =>
                      setFilteredSelectedStatuses(
                        Array.from(
                          e.target.selectedOptions,
                          (option) => option.value
                        )
                      )
                    }
                    className="bg-white/10 border border-white/20 rounded px-2 py-1 text-white"
                  >
                    <option value="pending">Pending</option>
                    <option value="active">Active</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Orders List/Grid */}
          <div
            className={
              viewMode === "grid"
                ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                : "space-y-6"
            }
          >
            {loading ? (
              <div className="text-center py-12">
                <LoadingSpinner size="lg" light />
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-white/70 text-lg">No orders found</p>
                <p className="text-white/50 text-sm mt-2">
                  {searchTerm || filter !== "all"
                    ? "Try adjusting your search or filter"
                    : "New orders will appear here"}
                </p>
              </div>
            ) : (
              filteredOrders.map((order) => (
                <OrderItem
                  key={order.id}
                  order={order}
                  onPaymentAction={handlePaymentAction}
                  onImageView={(imageUrl) => {
                    setCurrentImageUrl(imageUrl);
                    setShowImageModal(true);
                  }}
                  onFileUpload={handleFileUploadSuccess}
                  isSelected={selectedOrders.has(order.id)}
                  onSelect={(selected) => {
                    setSelectedOrders((prev) => {
                      const next = new Set(prev);
                      if (selected) {
                        next.add(order.id);
                      } else {
                        next.delete(order.id);
                      }
                      return next;
                    });
                  }}
                  actionInProgress={actionInProgress}
                  onApprove={handleApprove}
                  onClearHistory={handleClearChatHistory}
                />
              ))
            )}
          </div>

          {/* Order Details Section */}
          <div className="mt-4 space-y-4">
            <div className="mt-6 border-t border-gray-700 pt-4">
              <h3 className="text-lg font-medium mb-3 text-white">
                Account Management
              </h3>

              <div
                className="bg-gray-800 rounded-lg p-4 mb-4"
                id="account-details-section"
              >
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-white">Account Details</h4>
                  {selectedOrder?.account_details_sent && (
                    <span className="px-2 py-1 text-xs bg-green-500/20 text-green-400 rounded-full">
                      Sent
                    </span>
                  )}
                </div>

                {selectedOrder?.status === "approved" &&
                  !selectedOrder?.account_details_sent && (
                    <div className="mb-4 p-4 bg-blue-500/20 border border-blue-500/30 rounded-md animate-pulse-slow">
                      <div className="flex items-center">
                        <MessageCircle
                          className="text-blue-400 mr-2"
                          size={20}
                        />
                        <p className="text-blue-300 text-sm">
                          <span className="font-medium">Action required:</span>{" "}
                          Please enter the account details below to send them to
                          the customer.
                        </p>
                      </div>
                    </div>
                  )}

                {selectedOrder?.account_details_sent ? (
                  <div className="mb-4">
                    <div className="flex items-center mb-2">
                      <MessageCircle className="text-blue-400 mr-2" size={20} />
                      <span className="text-gray-300">
                        Account details sent on{" "}
                        {new Date(
                          selectedOrder.account_details_sent_at
                        ).toLocaleString()}
                      </span>
                    </div>

                    {selectedOrder.account_metadata && (
                      <div className="mt-2 p-3 bg-gray-700/50 rounded-md text-sm">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-gray-400">Account ID:</span>
                            <div className="text-white font-mono">
                              {selectedOrder.account_metadata.accountId}
                            </div>
                          </div>
                          <div>
                            <span className="text-gray-400">Password:</span>
                            <div className="text-white">
                              {selectedOrder.account_metadata.password}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-400 text-sm mb-3">
                    No account details have been sent for this order yet.
                  </p>
                )}

                <div className="space-y-4">
                  <div>
                    <label className="block text-gray-400 text-sm mb-1">
                      Account ID / Email <span className="text-red-400">*</span>
                    </label>
                    <input
                      id="account-id-input"
                      type="text"
                      value={accountDetails.accountId}
                      onChange={(e) => {
                        setAccountDetails((prev) => ({
                          ...prev,
                          accountId: e.target.value,
                        }));
                        // Clear error when typing
                        if (e.target.value.trim()) {
                          setFormErrors((prev) => ({
                            ...prev,
                            accountId: false,
                          }));
                        }
                      }}
                      placeholder="e.g., user123@example.com"
                      className={`w-full p-2 bg-gray-700 border ${
                        formErrors.accountId
                          ? "border-red-500"
                          : "border-gray-600"
                      } rounded-md text-white`}
                    />
                    {formErrors.accountId && (
                      <p className="text-red-400 text-xs mt-1">
                        Account ID is required
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-gray-400 text-sm mb-1">
                      Password
                    </label>
                    <input
                      id="account-password-input"
                      type="text"
                      value={accountDetails.password}
                      onChange={(e) =>
                        setAccountDetails((prev) => ({
                          ...prev,
                          password: e.target.value,
                        }))
                      }
                      placeholder="Enter password"
                      className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                    />
                  </div>

                  <button
                    onClick={handleAccountDetailsUpload}
                    className="w-full px-4 py-3 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors flex items-center justify-center"
                    disabled={
                      actionInProgress === "uploading" ||
                      !selectedOrderId ||
                      !accountDetails.accountId
                    }
                  >
                    {actionInProgress === "uploading" ? (
                      <span className="flex items-center justify-center">
                        <RefreshCw className="animate-spin mr-2 h-5 w-5" />
                        Sending...
                      </span>
                    ) : (
                      <span className="flex items-center justify-center">
                        <MessageCircle className="mr-2 h-5 w-5" />
                        Send Account Details
                      </span>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Image Modal with zoom and navigation */}
      {showImageModal && (
        <ImageModal
          imageUrl={currentImageUrl}
          onClose={() => setShowImageModal(false)}
        />
      )}
    </PageContainer>
  );
}

const OrderItem = React.memo(function OrderItem({
  order,
  onPaymentAction,
  onImageView,
  onFileUpload,
  isSelected,
  onSelect,
  actionInProgress,
  onApprove,
  onClearHistory,
}: {
  order: Order;
  onPaymentAction: (orderId: string, status: string) => void;
  onImageView: (imageUrl: string) => void;
  onFileUpload: (orderId: string, fileUrl: string) => void;
  isSelected: boolean;
  onSelect: (selected: boolean) => void;
  actionInProgress: string | null;
  onApprove: (orderId: string) => void;
  onClearHistory: (orderId: string) => void;
}) {
  const messageCount = order.messages?.length || 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={`relative bg-white/5 hover:bg-white/10 rounded-lg p-6 transition-colors ${
        isSelected ? "ring-2 ring-emerald-500" : ""
      }`}
    >
      <div className="absolute top-2 right-2">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onSelect(e.target.checked)}
          className="w-4 h-4 accent-emerald-500"
        />
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-white">
            {order.full_name}
          </h3>
          <p className="text-white/70">{order.email}</p>
          <p className="text-sm text-white/50">
            {new Date(order.created_at).toLocaleString()}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={order.status} />
            {order.account_file_url && (
              <span className="bg-purple-400/20 text-purple-400 px-2 py-1 rounded text-xs">
                HAS ACCOUNT FILE
              </span>
            )}
            {messageCount > 0 && (
              <span className="bg-blue-400/20 text-blue-400 px-2 py-1 rounded text-xs">
                {messageCount} MESSAGES
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {order.payment_proofs?.map((proof) => (
            <div key={proof.id} className="flex items-center gap-2">
              <button
                onClick={() => onImageView(proof.image_url)}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
                title="View payment proof"
              >
                <Eye className="text-white" size={20} />
              </button>
              {proof.status === "pending" && (
                <div className="flex items-center gap-2">
                  <ActionButton
                    icon={<CheckCircle className="text-green-400" size={20} />}
                    onClick={() => onApprove(order.id)}
                    disabled={actionInProgress !== null}
                    title="Approve order"
                  />
                  <ActionButton
                    icon={<XCircle className="text-red-400" size={20} />}
                    onClick={() => onPaymentAction(order.id, "rejected")}
                    disabled={!!actionInProgress}
                    title="Reject payment"
                  />
                </div>
              )}
            </div>
          ))}

          <Link
            to={`/chat?order=${order.id}`}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
            title="Open chat"
          >
            <MessageCircle className="text-white" size={20} />
          </Link>

          {messageCount > 0 && (
            <ActionButton
              icon={<RefreshCw className="text-yellow-400" size={20} />}
              onClick={() => onClearHistory(order.id)}
              disabled={actionInProgress !== null}
              title="Clear chat history"
            />
          )}
        </div>
      </div>

      {order.status === "active" && !order.account_file_url && (
        <div className="mt-4">
          <FileUpload
            orderId={order.id}
            onUploadSuccess={(fileUrl) => onFileUpload(order.id, fileUrl)}
          />
        </div>
      )}
    </motion.div>
  );
});

const StatusBadge = React.memo(function StatusBadge({
  status,
}: {
  status: string;
}) {
  const getStatusStyle = () => {
    switch (status) {
      case "active":
        return "bg-emerald-400/20 text-emerald-400";
      case "rejected":
        return "bg-red-400/20 text-red-400";
      default:
        return "bg-yellow-400/20 text-yellow-400";
    }
  };

  return (
    <span className={`px-2 py-1 rounded text-xs ${getStatusStyle()}`}>
      {status.toUpperCase()}
    </span>
  );
});

const ActionButton = React.memo(function ActionButton({
  icon,
  onClick,
  disabled,
  title,
}: {
  icon: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="p-2 hover:bg-white/10 rounded-full transition-colors disabled:opacity-50"
      title={title}
    >
      {icon}
    </button>
  );
});

const ImageModal = React.memo(function ImageModal({
  imageUrl,
  onClose,
}: {
  imageUrl: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      <div
        className="relative max-w-4xl w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <img src={imageUrl} alt="Payment Proof" className="w-full rounded-lg" />
        <button
          className="absolute -top-4 -right-4 bg-white/10 hover:bg-white/20 rounded-full p-2 text-white transition-colors"
          onClick={onClose}
        >
          <XCircle size={24} />
        </button>
      </div>
    </div>
  );
});

export default React.memo(AdminPage);
