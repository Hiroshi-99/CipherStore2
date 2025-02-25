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

// Add account detail templates
const accountTemplates = [
  {
    name: "Template 1",
    accountId: "user@example.com",
    password: "DemoPass123",
  },
  {
    name: "Template 2",
    accountId: "game_account",
    password: "GamePass456",
  },
];

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
  const QuickStatsDashboard = () => (
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

  // Improved filters component
  const ImprovedFilters = () => {
    return (
      <div className="bg-gray-800 rounded-lg p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              size={18}
            />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setFilteredSearchTerm(e.target.value)}
              placeholder="Search by name or email..."
              className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setFilteredSelectedStatuses(["pending"])}
              className={`px-3 py-1.5 rounded-md ${
                filteredSelectedStatuses.includes("pending")
                  ? "bg-yellow-500 text-white"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              Pending
            </button>
            <button
              onClick={() => setFilteredSelectedStatuses(["approved"])}
              className={`px-3 py-1.5 rounded-md ${
                filteredSelectedStatuses.includes("approved")
                  ? "bg-green-500 text-white"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              Approved
            </button>
            <button
              onClick={() => setFilteredSelectedStatuses(["rejected"])}
              className={`px-3 py-1.5 rounded-md ${
                filteredSelectedStatuses.includes("rejected")
                  ? "bg-red-500 text-white"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              Rejected
            </button>
            <button
              onClick={clearFilteredFilters}
              className="px-3 py-1.5 bg-gray-700 text-gray-300 hover:bg-gray-600 rounded-md"
            >
              All
            </button>
          </div>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className="px-3 py-1.5 bg-gray-700 text-gray-300 hover:bg-gray-600 rounded-md flex items-center gap-1"
          >
            <Filter size={18} />
            <span>More Filters</span>
          </button>
        </div>

        {showFilters && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Additional filters here */}
          </div>
        )}
      </div>
    );
  };

  // Add useEffect for keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent shortcuts when typing in input fields
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Shortcut for approving selected orders: Alt+A
      if (e.altKey && e.key === "a" && selectedOrders.size > 0) {
        handleBatchAction("approve");
        e.preventDefault();
      }

      // Shortcut for rejecting selected orders: Alt+R
      if (e.altKey && e.key === "r" && selectedOrders.size > 0) {
        handleBatchAction("reject");
        e.preventDefault();
      }

      // Shortcut for selecting all orders: Alt+S
      if (e.altKey && e.key === "s") {
        const allOrderIds = filteredOrders.map((order) => order.id);
        if (selectedOrders.size === allOrderIds.length) {
          setSelectedOrders(new Set());
        } else {
          setSelectedOrders(new Set(allOrderIds));
        }
        e.preventDefault();
      }

      // Shortcut for clearing filters: Alt+C
      if (e.altKey && e.key === "c") {
        clearFilteredFilters();
        e.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedOrders, filteredOrders, handleBatchAction, clearFilteredFilters]);

  // Improved account details form
  const ImprovedAccountDetailsForm = () => {
    return (
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
                <MessageCircle className="text-blue-400 mr-2" size={20} />
                <p className="text-blue-300 text-sm">
                  <span className="font-medium">Action required:</span> Please
                  enter the account details below to send them to the customer.
                </p>
              </div>
            </div>
          )}

        {selectedOrder?.account_details_sent ? (
          // Display sent account details
          <div className="mb-4">
            <div className="flex items-center mb-2">
              <MessageCircle className="text-blue-400 mr-2" size={20} />
              <span className="text-gray-300 text-sm">
                Account details sent on{" "}
                {new Date(
                  selectedOrder.account_details_sent_at
                ).toLocaleString()}
              </span>
            </div>

            {/* Display the account details if available */}
          </div>
        ) : selectedOrder ? (
          <div className="space-y-4">
            {/* Templates dropdown */}
            <div>
              <label className="block text-gray-400 text-sm mb-1">
                Use Template
              </label>
              <select
                onChange={(e) => {
                  const template = accountTemplates.find(
                    (t) => t.name === e.target.value
                  );
                  if (template) {
                    setAccountDetails({
                      accountId: template.accountId,
                      password: template.password,
                    });
                  }
                }}
                className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white"
              >
                <option value="">Select a template...</option>
                {accountTemplates.map((template) => (
                  <option key={template.name} value={template.name}>
                    {template.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Account ID field */}
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
                  formErrors.accountId ? "border-red-500" : "border-gray-600"
                } rounded-md text-white`}
              />
              {formErrors.accountId && (
                <p className="text-red-400 text-xs mt-1">
                  Account ID is required
                </p>
              )}
            </div>

            {/* Password field */}
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

            {/* Message preview */}
            <div>
              <label className="block text-gray-400 text-sm mb-1">
                Preview
              </label>
              <div className="p-3 bg-gray-700 border border-gray-600 rounded-md text-white text-sm">
                <div className="font-medium mb-2">Account Details</div>
                <div className="space-y-2">
                  <div>
                    <span className="text-gray-400">Account ID:</span>{" "}
                    <span className="font-mono">
                      {accountDetails.accountId || "[Account ID]"}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400">Password:</span>{" "}
                    <span>{accountDetails.password || "[Password]"}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Send button */}
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
        ) : (
          <div className="text-center py-6 text-gray-400">
            Select an order to enter account details
          </div>
        )}
      </div>
    );
  };

  // Improved batch actions section
  const ImprovedBatchActions = () => {
    const selectedCount = selectedOrders.size;

    if (selectedCount === 0) return null;

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-gray-800 rounded-lg shadow-lg p-4 z-10 flex items-center gap-4"
      >
        <div className="text-white">
          <span className="font-medium">{selectedCount}</span> orders selected
        </div>

        <div className="h-6 border-r border-gray-600"></div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleBatchAction("approve")}
            disabled={isBatchProcessing}
            className="px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white rounded flex items-center gap-1"
            title="Approve selected orders (Alt+A)"
          >
            <CheckCircle size={18} />
            <span>Approve</span>
          </button>

          <button
            onClick={() => handleBatchAction("reject")}
            disabled={isBatchProcessing}
            className="px-3 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded flex items-center gap-1"
            title="Reject selected orders (Alt+R)"
          >
            <XCircle size={18} />
            <span>Reject</span>
          </button>

          <button
            onClick={() => setSelectedOrders(new Set())}
            disabled={isBatchProcessing}
            className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 disabled:opacity-50 text-white rounded"
          >
            Clear
          </button>
        </div>

        {isBatchProcessing && (
          <div className="ml-2">
            <LoadingSpinner size="sm" light />
          </div>
        )}
      </motion.div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return (
    <PageContainer title="Admin Dashboard" user={null}>
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">Order Management</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              className="p-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md transition-colors flex items-center gap-1"
              disabled={refreshing}
            >
              <RefreshCw
                className={refreshing ? "animate-spin" : ""}
                size={18}
              />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Add keyboard shortcuts info */}
        <div className="bg-blue-500/20 border border-blue-500/30 rounded-md p-3 mb-6">
          <h3 className="text-blue-300 font-medium mb-1">Keyboard Shortcuts</h3>
          <div className="grid grid-cols-2 gap-2 text-sm text-blue-200">
            <div className="flex items-center">
              <kbd className="px-2 py-1 bg-gray-700 rounded text-xs mr-2">
                Alt+A
              </kbd>
              <span>Approve selected</span>
            </div>
            <div className="flex items-center">
              <kbd className="px-2 py-1 bg-gray-700 rounded text-xs mr-2">
                Alt+R
              </kbd>
              <span>Reject selected</span>
            </div>
            <div className="flex items-center">
              <kbd className="px-2 py-1 bg-gray-700 rounded text-xs mr-2">
                Alt+S
              </kbd>
              <span>Select/deselect all</span>
            </div>
            <div className="flex items-center">
              <kbd className="px-2 py-1 bg-gray-700 rounded text-xs mr-2">
                Alt+C
              </kbd>
              <span>Clear filters</span>
            </div>
          </div>
        </div>

        <QuickStatsDashboard />
        <ImprovedFilters />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2">
            <h2 className="text-xl font-semibold text-white mb-4">Orders</h2>

            {loading ? (
              <div className="flex justify-center py-10">
                <LoadingSpinner />
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="bg-gray-800 rounded-lg p-10 text-center">
                <p className="text-gray-400">No orders found</p>
                {filteredSelectedStatuses.length > 0 || searchTerm ? (
                  <button
                    onClick={clearFilteredFilters}
                    className="mt-2 text-blue-400 hover:underline"
                  >
                    Clear filters
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-gray-400 text-sm">
                    Showing {filteredOrders.length} of {orders.length} orders
                  </p>

                  <button
                    onClick={() => {
                      const allOrderIds = filteredOrders.map(
                        (order) => order.id
                      );
                      if (selectedOrders.size === allOrderIds.length) {
                        setSelectedOrders(new Set());
                      } else {
                        setSelectedOrders(new Set(allOrderIds));
                      }
                    }}
                    className="text-sm text-blue-400 hover:underline"
                  >
                    {selectedOrders.size === filteredOrders.length
                      ? "Deselect all"
                      : "Select all"}
                  </button>
                </div>

                {filteredOrders.map((order) => (
                  <ImprovedOrderItem
                    key={order.id}
                    order={order}
                    onPaymentAction={handlePaymentAction}
                    onImageView={(imageUrl) => {
                      setCurrentImageUrl(imageUrl);
                      setShowImageModal(true);
                    }}
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
                ))}
              </div>
            )}
          </div>

          <div>
            <h2 className="text-xl font-semibold text-white mb-4">
              Order Details
            </h2>

            {selectedOrder ? (
              <div>
                <div className="bg-gray-800 rounded-lg p-4 mb-4">
                  <h3 className="text-lg font-medium text-white mb-3">
                    {selectedOrder.full_name}
                  </h3>

                  <div className="space-y-2 text-sm">
                    <div className="flex items-start">
                      <span className="text-gray-400 w-24">Email:</span>
                      <span className="text-white">{selectedOrder.email}</span>
                    </div>
                    <div className="flex items-start">
                      <span className="text-gray-400 w-24">Status:</span>
                      <StatusBadge status={selectedOrder.status} />
                    </div>
                    <div className="flex items-start">
                      <span className="text-gray-400 w-24">Created:</span>
                      <span className="text-white">
                        {new Date(selectedOrder.created_at).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-start">
                      <span className="text-gray-400 w-24">Messages:</span>
                      <span className="text-white">
                        {selectedOrder.messages?.length || 0}
                      </span>
                    </div>
                  </div>
                </div>

                <ImprovedAccountDetailsForm />

                <div className="flex flex-col gap-2">
                  <Link
                    to={`/chat?order=${selectedOrder.id}`}
                    className="w-full px-4 py-3 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors flex items-center justify-center"
                  >
                    <MessageCircle className="mr-2 h-5 w-5" />
                    Open Chat
                  </Link>
                </div>
              </div>
            ) : (
              <div className="bg-gray-800 rounded-lg p-10 text-center">
                <p className="text-gray-400">Select an order to view details</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Batch actions */}
      <AnimatePresence>
        {selectedOrders.size > 0 && <ImprovedBatchActions />}
      </AnimatePresence>

      {/* Image modal */}
      {showImageModal && (
        <ImageModal
          imageUrl={currentImageUrl}
          onClose={() => setShowImageModal(false)}
        />
      )}

      <Toaster position="top-right" />
    </PageContainer>
  );
}

const ImprovedOrderItem = React.memo(function ImprovedOrderItem({
  order,
  onPaymentAction,
  onImageView,
  isSelected,
  onSelect,
  actionInProgress,
  onApprove,
}: {
  order: Order;
  onPaymentAction: (orderId: string, status: string) => void;
  onImageView: (imageUrl: string) => void;
  isSelected: boolean;
  onSelect: (selected: boolean) => void;
  actionInProgress: string | null;
  onApprove: (orderId: string) => void;
}) {
  const messageCount = order.messages?.length || 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={`relative bg-white/5 hover:bg-white/10 rounded-lg p-5 transition-colors ${
        isSelected ? "ring-2 ring-emerald-500" : ""
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => onSelect(e.target.checked)}
              className="w-4 h-4 accent-emerald-500 mr-3"
            />
            <h3 className="text-lg font-semibold text-white">
              {order.full_name}
            </h3>
          </div>
          <p className="text-white/70 ml-7">{order.email}</p>
          <div className="ml-7 mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={order.status} />
            {messageCount > 0 && (
              <Link
                to={`/chat?order=${order.id}`}
                className="inline-flex items-center bg-blue-500/20 text-blue-400 px-2 py-1 rounded text-xs gap-1 hover:bg-blue-500/30 transition-colors"
              >
                <MessageCircle size={14} />
                {messageCount} {messageCount === 1 ? "MESSAGE" : "MESSAGES"}
              </Link>
            )}
            <span className="text-gray-400 text-xs">
              {new Date(order.created_at).toLocaleString()}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {order.payment_proofs?.map((proof) => (
            <div key={proof.id} className="flex items-center">
              <button
                onClick={() => onImageView(proof.image_url)}
                className="bg-gray-700 hover:bg-gray-600 p-2 rounded-l-md transition-colors flex items-center gap-1"
                title="View payment proof"
              >
                <Eye size={16} />
                <span className="text-sm">View Proof</span>
              </button>
              {order.status === "pending" && (
                <>
                  <button
                    onClick={() => onApprove(order.id)}
                    disabled={actionInProgress !== null}
                    className="bg-green-600 hover:bg-green-500 disabled:opacity-50 p-2 transition-colors"
                    title="Approve order"
                  >
                    <CheckCircle size={16} />
                  </button>
                  <button
                    onClick={() => onPaymentAction(order.id, "rejected")}
                    disabled={!!actionInProgress}
                    className="bg-red-600 hover:bg-red-500 disabled:opacity-50 p-2 rounded-r-md transition-colors"
                    title="Reject payment"
                  >
                    <XCircle size={16} />
                  </button>
                </>
              )}
            </div>
          ))}

          {!order.payment_proofs?.length && (
            <Link
              to={`/chat?order=${order.id}`}
              className="bg-blue-600 hover:bg-blue-500 p-2 rounded-md transition-colors flex items-center gap-1"
              title="Open chat"
            >
              <MessageCircle size={16} />
              <span className="text-sm">Chat</span>
            </Link>
          )}
        </div>
      </div>
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
