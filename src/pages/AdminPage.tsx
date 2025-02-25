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
type BatchAction = "approve" | "reject" | "export" | "delete";

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

      // Process orders data
      const processedOrders = ordersData.map((order) => ({
        ...order,
        // Add any additional processing here
      }));

      setOrders(processedOrders);

      // Calculate stats
      const stats = {
        total: processedOrders.length,
        pending: processedOrders.filter((o) => o.status === "pending").length,
        approved: processedOrders.filter((o) => o.status === "approved").length,
        rejected: processedOrders.filter((o) => o.status === "rejected").length,
      };

      setStats(stats);
    } catch (error) {
      console.error("Error fetching orders:", error);
      setError("Failed to load orders. Please try again.");
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
    async (orderId: string, status: string) => {
      try {
        setActionInProgress(orderId);

        // Update order status
        const { error } = await supabase
          .from("orders")
          .update({ status })
          .eq("id", orderId);

        if (error) throw error;

        // Update local state
        setOrders((prev) =>
          prev.map((order) =>
            order.id === orderId ? { ...order, status } : order
          )
        );

        // If order is rejected, schedule auto-delete of chat after 5 minutes
        if (status === "rejected") {
          // Send a system message to inform the user
          const systemMessage = `Your order has been rejected. This chat will be automatically deleted in 5 minutes. You will not be able to send new messages.`;

          // Add system message to the chat
          const { error: messageError } = await supabase
            .from("messages")
            .insert({
              order_id: orderId,
              content: systemMessage,
              is_admin: true,
              is_system: true, // Add this flag to identify system messages
              created_at: new Date().toISOString(),
              user_name: "System",
              user_avatar: "/images/system-avatar.png",
            });

          if (messageError) {
            console.error("Error sending system message:", messageError);
          }

          // Schedule deletion after 5 minutes (300000 ms)
          // Note: In a real production app, you would use a server-side scheduled job
          // This client-side timeout is just for demonstration
          setTimeout(async () => {
            try {
              // Delete all messages for this order
              const { error: deleteMessagesError } = await supabase
                .from("messages")
                .delete()
                .eq("order_id", orderId);

              if (deleteMessagesError) {
                console.error("Error deleting messages:", deleteMessagesError);
              }

              // Update order to mark chat as deleted
              const { error: updateOrderError } = await supabase
                .from("orders")
                .update({ chat_deleted: true })
                .eq("id", orderId);

              if (updateOrderError) {
                console.error("Error updating order:", updateOrderError);
              }

              // Update local state
              setOrders((prev) =>
                prev.map((order) =>
                  order.id === orderId
                    ? { ...order, chat_deleted: true }
                    : order
                )
              );

              toast.success(`Chat for rejected order has been deleted.`);
            } catch (err) {
              console.error("Error in auto-delete process:", err);
            }
          }, 300000); // 5 minutes

          toast.success(
            `Order rejected. Chat will be automatically deleted in 5 minutes.`
          );
        } else {
          toast.success(`Order ${status} successfully!`);
        }
      } catch (error) {
        console.error(`Error ${status} order:`, error);
        toast.error(`Failed to ${status} order. Please try again.`);
      } finally {
        setActionInProgress(null);
      }
    },
    []
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
            Array.from(selectedOrders).map(async (orderId) => {
              try {
                // Update order status
                const { error } = await supabase
                  .from("orders")
                  .update({ status: "rejected" })
                  .eq("id", orderId);

                if (error) throw error;

                // Send a system message to inform the user
                const systemMessage = `Your order has been rejected. This chat will be automatically deleted in 5 minutes. You will not be able to send new messages.`;

                // Add system message to the chat
                const { error: messageError } = await supabase
                  .from("messages")
                  .insert({
                    order_id: orderId,
                    content: systemMessage,
                    is_admin: true,
                    is_system: true,
                    created_at: new Date().toISOString(),
                    user_name: "System",
                    user_avatar: "/images/system-avatar.png",
                  });

                if (messageError) {
                  console.error("Error sending system message:", messageError);
                }

                // Schedule deletion after 5 minutes (300000 ms)
                setTimeout(async () => {
                  try {
                    // Delete all messages for this order
                    const { error: deleteMessagesError } = await supabase
                      .from("messages")
                      .delete()
                      .eq("order_id", orderId);

                    if (deleteMessagesError) {
                      console.error(
                        "Error deleting messages:",
                        deleteMessagesError
                      );
                    }

                    // Update order to mark chat as deleted
                    const { error: updateOrderError } = await supabase
                      .from("orders")
                      .update({ chat_deleted: true })
                      .eq("id", orderId);

                    if (updateOrderError) {
                      console.error("Error updating order:", updateOrderError);
                    }

                    // Update local state
                    setOrders((prev) =>
                      prev.map((order) =>
                        order.id === orderId
                          ? { ...order, chat_deleted: true }
                          : order
                      )
                    );
                  } catch (err) {
                    console.error("Error in auto-delete process:", err);
                  }
                }, 300000); // 5 minutes
              } catch (err) {
                console.error("Error rejecting order:", err);
                throw err;
              }
            })
          );

          toast.success(
            `Successfully rejected ${selectedOrders.size} orders. Chats will be automatically deleted in 5 minutes.`
          );
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

  // Simplified version that only sends a message without updating order metadata
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

      // Create a message to send the account details
      const { error: messageError } = await supabase.from("messages").insert({
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

  // Add a Dashboard Summary at the top of the Admin page
  const DashboardSummary = React.memo(function DashboardSummary({
    stats,
  }: {
    stats: {
      total: number;
      pending: number;
      approved: number;
      rejected: number;
    };
  }) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white/5 rounded-lg p-4 border-l-4 border-blue-500">
          <h3 className="text-white/70 text-sm font-medium">Total Orders</h3>
          <p className="text-white text-2xl font-bold">{stats.total}</p>
        </div>
        <div className="bg-white/5 rounded-lg p-4 border-l-4 border-yellow-500">
          <h3 className="text-white/70 text-sm font-medium">Pending</h3>
          <p className="text-white text-2xl font-bold">{stats.pending}</p>
        </div>
        <div className="bg-white/5 rounded-lg p-4 border-l-4 border-green-500">
          <h3 className="text-white/70 text-sm font-medium">Approved</h3>
          <p className="text-white text-2xl font-bold">{stats.approved}</p>
        </div>
        <div className="bg-white/5 rounded-lg p-4 border-l-4 border-red-500">
          <h3 className="text-white/70 text-sm font-medium">Rejected</h3>
          <p className="text-white text-2xl font-bold">{stats.rejected}</p>
        </div>
      </div>
    );
  });

  // Add an improved filter panel
  const FilterPanel = React.memo(function FilterPanel({
    searchTerm,
    setSearchTerm,
    selectedStatuses,
    setSelectedStatuses,
    dateRange,
    setDateRange,
    clearFilters,
  }: {
    searchTerm: string;
    setSearchTerm: (term: string) => void;
    selectedStatuses: string[];
    setSelectedStatuses: (statuses: string[]) => void;
    dateRange: DateRange;
    setDateRange: (range: DateRange) => void;
    clearFilters: () => void;
  }) {
    return (
      <div className="bg-white/5 rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white text-lg font-medium">Filters</h3>
          <button
            onClick={clearFilters}
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            Clear All
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-white/70 text-sm mb-1">Search</label>
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name or email..."
                className="w-full p-2 pl-8 bg-white/10 border border-white/20 rounded text-white"
              />
              <Search
                className="absolute left-2 top-2.5 text-white/50"
                size={16}
              />
            </div>
          </div>

          <div>
            <label className="block text-white/70 text-sm mb-1">Status</label>
            <div className="flex flex-wrap gap-2">
              {["pending", "approved", "rejected"].map((status) => (
                <button
                  key={status}
                  onClick={() => {
                    if (selectedStatuses.includes(status)) {
                      setSelectedStatuses(
                        selectedStatuses.filter((s) => s !== status)
                      );
                    } else {
                      setSelectedStatuses([...selectedStatuses, status]);
                    }
                  }}
                  className={`px-3 py-1 rounded-full text-sm ${
                    selectedStatuses.includes(status)
                      ? "bg-blue-500 text-white"
                      : "bg-white/10 text-white/70 hover:bg-white/20"
                  }`}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-white/70 text-sm mb-1">
              Date Range
            </label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={
                  dateRange.start
                    ? dateRange.start.toISOString().split("T")[0]
                    : ""
                }
                onChange={(e) => {
                  const date = e.target.value ? new Date(e.target.value) : null;
                  setDateRange({ ...dateRange, start: date });
                }}
                className="flex-1 p-2 bg-white/10 border border-white/20 rounded text-white"
              />
              <span className="text-white/50">to</span>
              <input
                type="date"
                value={
                  dateRange.end ? dateRange.end.toISOString().split("T")[0] : ""
                }
                onChange={(e) => {
                  const date = e.target.value ? new Date(e.target.value) : null;
                  setDateRange({ ...dateRange, end: date });
                }}
                className="flex-1 p-2 bg-white/10 border border-white/20 rounded text-white"
              />
            </div>
          </div>
        </div>
      </div>
    );
  });

  // Enhanced account details form with templates
  const AccountDetailsForm = React.memo(function AccountDetailsForm({
    accountDetails,
    setAccountDetails,
    formErrors,
    setFormErrors,
    onSubmit,
    isSubmitting,
    selectedOrderId,
  }: {
    accountDetails: AccountDetails;
    setAccountDetails: React.Dispatch<React.SetStateAction<AccountDetails>>;
    formErrors: { accountId: boolean };
    setFormErrors: React.Dispatch<React.SetStateAction<{ accountId: boolean }>>;
    onSubmit: () => void;
    isSubmitting: boolean;
    selectedOrderId: string | null;
  }) {
    const templates = [
      {
        name: "Gmail",
        accountId: "example@gmail.com",
        password: "Password123",
      },
      {
        name: "Game Account",
        accountId: "username123",
        password: "GamePass!23",
      },
    ];

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-white font-medium">Account Details</h4>
          <div className="relative group">
            <button
              className="text-sm text-blue-400 hover:text-blue-300"
              aria-label="Use template"
            >
              Use Template
            </button>
            <div className="absolute right-0 mt-1 w-48 bg-gray-800 rounded-md shadow-lg p-2 hidden group-hover:block z-10">
              {templates.map((template, index) => (
                <button
                  key={index}
                  onClick={() => setAccountDetails(template)}
                  className="block w-full text-left px-3 py-2 text-sm text-white hover:bg-white/10 rounded"
                >
                  {template.name}
                </button>
              ))}
            </div>
          </div>
        </div>

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
              if (e.target.value.trim()) {
                setFormErrors((prev) => ({
                  ...prev,
                  accountId: false,
                }));
              }
            }}
            placeholder="e.g., user123@example.com"
            className={`w-full p-2 bg-gray-700 border ${
              formErrors.accountId ? "border-red-500" : "border-gray-600"
            } rounded-md text-white`}
          />
          {formErrors.accountId && (
            <p className="text-red-400 text-xs mt-1">Account ID is required</p>
          )}
        </div>

        <div>
          <label className="block text-gray-400 text-sm mb-1">Password</label>
          <div className="relative">
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
            <button
              type="button"
              onClick={() => {
                const randomPassword =
                  Math.random().toString(36).slice(-8) +
                  Math.random().toString(36).toUpperCase().slice(-2) +
                  Math.floor(Math.random() * 10) +
                  "!";
                setAccountDetails((prev) => ({
                  ...prev,
                  password: randomPassword,
                }));
              }}
              className="absolute right-2 top-2 text-sm text-blue-400 hover:text-blue-300"
            >
              Generate
            </button>
          </div>
        </div>

        <button
          onClick={onSubmit}
          className="w-full px-4 py-3 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors flex items-center justify-center"
          disabled={
            isSubmitting || !selectedOrderId || !accountDetails.accountId
          }
        >
          {isSubmitting ? (
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
    );
  });

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
        <div className="max-w-6xl mx-auto px-4">
          <h1 className="text-2xl font-bold text-white mb-6">
            Admin Dashboard
          </h1>
          <DashboardSummary stats={stats} />
          <StatsDisplay />
        </div>

        <div className="backdrop-blur-md bg-black/30 p-6 rounded-2xl">
          {/* Batch Actions */}
          <AnimatePresence>
            {selectedOrders.size > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="mb-4 p-4 bg-white/5 rounded-lg flex items-center justify-between"
              >
                <div className="text-white">
                  {selectedOrders.size} orders selected
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleBatchAction("approve")}
                    className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30"
                    disabled={isBatchProcessing}
                  >
                    Approve All
                  </button>
                  <button
                    onClick={() => handleBatchAction("reject")}
                    className="px-3 py-1 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30"
                    disabled={isBatchProcessing}
                  >
                    Reject All
                  </button>
                  <button
                    onClick={() => handleBatchAction("export")}
                    className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30"
                    disabled={isBatchProcessing}
                  >
                    Export Selected
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

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
            <FilterPanel
              searchTerm={filteredSearchTerm}
              setSearchTerm={setFilteredSearchTerm}
              selectedStatuses={filteredSelectedStatuses}
              setSelectedStatuses={setFilteredSelectedStatuses}
              dateRange={filteredDateRange}
              setDateRange={setFilteredDateRange}
              clearFilters={clearFilteredFilters}
            />
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

                <AccountDetailsForm
                  accountDetails={accountDetails}
                  setAccountDetails={setAccountDetails}
                  formErrors={formErrors}
                  setFormErrors={setFormErrors}
                  onSubmit={handleAccountDetailsUpload}
                  isSubmitting={actionInProgress === "uploading"}
                  selectedOrderId={selectedOrderId}
                />
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
}: {
  order: Order;
  onPaymentAction: (orderId: string, status: string) => void;
  onImageView: (imageUrl: string) => void;
  onFileUpload: (orderId: string, fileUrl: string) => void;
  isSelected: boolean;
  onSelect: (selected: boolean) => void;
  actionInProgress: string | null;
  onApprove: (orderId: string) => void;
}) {
  const messageCount = order.messages?.length || 0;
  const hasUnreadMessages = order.messages?.some((m) => !m.is_read) || false;

  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={`relative bg-white/5 hover:bg-white/10 rounded-lg p-6 transition-colors ${
        isSelected ? "ring-2 ring-emerald-500" : ""
      } ${hasUnreadMessages ? "border-l-4 border-blue-400" : ""}`}
    >
      <div className="absolute top-2 right-2">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onSelect(e.target.checked)}
          className="w-4 h-4 accent-emerald-500"
        />
      </div>

      <div className="flex flex-wrap md:flex-nowrap items-start justify-between gap-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-white group flex items-center">
            {order.full_name}
            {hasUnreadMessages && (
              <span className="ml-2 bg-blue-500 text-white text-xs rounded-full px-2 py-0.5">
                New
              </span>
            )}
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
              <span
                className={`${
                  hasUnreadMessages
                    ? "bg-blue-400/40 text-blue-300"
                    : "bg-blue-400/20 text-blue-400"
                } px-2 py-1 rounded text-xs`}
              >
                {messageCount} MESSAGES
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-center gap-2">
          <div className="flex items-center gap-2">
            {order.payment_proofs?.map((proof) => (
              <button
                key={proof.id}
                onClick={() => onImageView(proof.image_url)}
                className="p-2 bg-white/5 hover:bg-white/10 rounded transition-colors flex items-center gap-1"
                title="View payment proof"
              >
                <Eye className="text-white" size={18} />
                <span className="text-xs text-white/80">View Proof</span>
              </button>
            ))}

            {order.status === "pending" && (
              <>
                <button
                  onClick={() => onApprove(order.id)}
                  disabled={actionInProgress !== null}
                  className="p-2 bg-green-500/20 hover:bg-green-500/30 rounded transition-colors flex items-center gap-1 disabled:opacity-50"
                  title="Approve order"
                >
                  <CheckCircle className="text-green-400" size={18} />
                  <span className="text-xs text-green-300">Approve</span>
                </button>
                <button
                  onClick={() => onPaymentAction(order.id, "rejected")}
                  disabled={!!actionInProgress}
                  className="p-2 bg-red-500/20 hover:bg-red-500/30 rounded transition-colors flex items-center gap-1 disabled:opacity-50"
                  title="Reject payment"
                >
                  <XCircle className="text-red-400" size={18} />
                  <span className="text-xs text-red-300">Reject</span>
                </button>
              </>
            )}
          </div>

          <Link
            to={`/chat?order=${order.id}`}
            className="p-2 bg-blue-500/20 hover:bg-blue-500/30 rounded transition-colors flex items-center gap-1"
            title="Open chat"
          >
            <MessageCircle className="text-blue-400" size={18} />
            <span className="text-xs text-blue-300">Chat</span>
            {hasUnreadMessages && (
              <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
            )}
          </Link>
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
