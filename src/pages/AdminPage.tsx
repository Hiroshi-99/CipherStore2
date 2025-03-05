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
    setPageTitle("ADMIN");
    fetchOrders();
    checkAdminStatus();
  }, []);

  // Optimize the fetchOrders function to properly retrieve all orders
  const fetchOrders = async (page = 1, append = false) => {
    const pageToFetch = page || currentPage;

    if (page === 1) {
      setRefreshing(true);
    } else {
      setIsFetchingNextPage(true);
    }

    try {
      // Calculate range for pagination
      const from = (pageToFetch - 1) * pageSize;
      const to = from + pageSize - 1;

      // Use a more efficient query with pagination
      const { data: ordersData, error: ordersError } = await supabase
        .from("orders")
        .select(
          `
          *,
          payment_proofs:payment_proofs(*),
          messages:messages(id)
        `
        )
        .order("created_at", { ascending: false })
        .range(from, to);

      if (ordersError) {
        console.error("Error fetching orders:", ordersError);
        toast.error("Failed to load orders");
        return;
      }

      if (ordersData) {
        // If we got fewer items than requested, there are no more pages
        setHasMoreOrders(ordersData.length === pageSize);

        // Update state based on whether we're appending or replacing
        if (append) {
          setOrders((prevOrders) => [...prevOrders, ...ordersData]);
        } else {
          setOrders(ordersData);
        }

        // Update the current page
        setCurrentPage(pageToFetch);

        // Calculate statistics more efficiently
        if (!append) {
          const statusCounts = ordersData.reduce((counts, order) => {
            counts[order.status] = (counts[order.status] || 0) + 1;
            return counts;
          }, {} as Record<string, number>);

          setStats({
            total: ordersData.length,
            pending: statusCounts.pending || 0,
            approved: statusCounts.active || 0,
            rejected: statusCounts.rejected || 0,
          });
        }
      }
    } catch (err) {
      console.error("Error in fetchOrders:", err);
      toast.error("Failed to load orders");
    } finally {
      setRefreshing(false);
      setIsFetchingNextPage(false);
    }
  };

  // Add a function to load more orders
  const loadMoreOrders = () => {
    if (hasMoreOrders && !isFetchingNextPage) {
      fetchOrders(currentPage + 1, true);
    }
  };

  // Add an intersection observer to load more data when scrolling down
  useEffect(() => {
    const options = {
      root: null,
      rootMargin: "0px",
      threshold: 0.5,
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && hasMoreOrders && !isFetchingNextPage) {
          loadMoreOrders();
        }
      });
    }, options);

    const loadMoreTrigger = document.getElementById("load-more-trigger");
    if (loadMoreTrigger) {
      observer.observe(loadMoreTrigger);
    }

    return () => {
      if (loadMoreTrigger) {
        observer.unobserve(loadMoreTrigger);
      }
    };
  }, [hasMoreOrders, isFetchingNextPage]);

  const checkAdminStatus = async () => {
    try {
      setLoading(true);

      // Get the current user
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        console.error("No user found");
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      console.log("Current user:", user);

      // Check if the user is an admin
      const adminResult = await checkIfAdmin(user.id);
      console.log("Admin check result:", adminResult);

      if (adminResult.isAdmin) {
        setIsAdmin(true);

        // Set current user
        setCurrentUser({
          id: user.id,
          email: user.email || "",
          fullName: user.user_metadata?.full_name || "",
          isAdmin: true,
          lastSignIn: null,
          createdAt: user.created_at,
        });

        // Fetch orders and users
        await fetchOrders();
        await fetchUsers(user.id);
      } else {
        setIsAdmin(false);
        toast.error("You don't have admin privileges");

        // Try to grant admin privileges if this is the first user
        if (adminResult.error && adminResult.error.includes("first user")) {
          const grantResult = await grantAdminPrivileges(
            user.id,
            user.email || ""
          );

          if (grantResult.success) {
            setIsAdmin(true);
            toast.success("Admin privileges granted automatically");

            // Fetch orders and users
            await fetchOrders();
            await fetchUsers(user.id);
          }
        }
      }
    } catch (err) {
      console.error("Error checking admin status:", err);
      toast.error("Failed to check admin status");
    } finally {
      setLoading(false);
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
  const deliverAccountDetails = async (
    orderId: string,
    accountDetails: AccountDetails
  ) => {
    try {
      setActionInProgress(orderId);

      // Validate account details
      if (!accountDetails.accountId.trim()) {
        toast.error("Account ID is required");
        return false;
      }

      // Update the order with account details
      const { error: updateError } = await supabase
        .from("orders")
        .update({
          account_id: accountDetails.accountId,
          account_password: accountDetails.password,
          delivery_date: new Date().toISOString(),
          status: "delivered",
        })
        .eq("id", orderId);

      if (updateError) {
        console.error(
          "Error updating order with account details:",
          updateError
        );
        toast.error("Failed to deliver account details");
        return false;
      }

      // Send a message to the user with their account details
      const { data: orderData } = await supabase
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .single();

      if (orderData) {
        // Create a message with the account details
        const message = {
          id: generateUUID(),
          order_id: orderId,
          content: `Your account is ready! Here are your login details:\n\nAccount ID: ${accountDetails.accountId}\nPassword: ${accountDetails.password}\n\nPlease save these details securely.`,
          created_at: new Date().toISOString(),
          user_id: null, // System message
          is_read: false,
          user_name: "Support Team",
          user_avatar: "https://i.imgur.com/eyaDC8l.png",
        };

        // Insert the message
        const { error: messageError } = await supabase
          .from("messages")
          .insert(message);

        if (messageError) {
          console.error("Error sending account details message:", messageError);
          // Continue anyway since the order was updated
        }
      }

      // Update local state
      setOrders(
        orders.map((order) =>
          order.id === orderId
            ? {
                ...order,
                status: "delivered",
                account_id: accountDetails.accountId,
                account_password: accountDetails.password,
              }
            : order
        )
      );

      toast.success("Account details delivered successfully");

      // Reset the account details form
      setAccountDetails({
        accountId: "",
        password: "",
      });

      // Close any modals
      setSelectedOrderId(null);

      // Refresh orders to get the latest data
      fetchOrders();

      return true;
    } catch (err) {
      console.error("Error in deliverAccountDetails:", err);
      toast.error("Failed to deliver account details");
      return false;
    } finally {
      setActionInProgress(null);
    }
  };

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.user) {
          navigate("/");
          return;
        }

        setCurrentUser(session.user);

        // Check if user is admin
        const adminStatus = await checkIfAdmin(session.user.id);
        setIsAdmin(adminStatus);

        if (!adminStatus) {
          toast.error("You don't have permission to access the admin page");
          navigate("/");
          return;
        }

        // Fetch users with admin status
        await fetchUsers(session.user.id);
      } catch (err) {
        console.error("Error checking authentication:", err);
        toast.error("Authentication error");
        navigate("/");
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [navigate]);

  const fetchUsers = async (adminUserId: string) => {
    if (!adminUserId) {
      console.error("No admin user ID provided");
      return;
    }

    setLoading(true);

    try {
      // Get the current user first
      const {
        data: { user: currentAuthUser },
      } = await supabase.auth.getUser();

      if (!currentAuthUser) {
        toast.error("You must be logged in to view users");
        setLoading(false);
        return;
      }

      // Get admin users from the admin_users table - use a more efficient query
      const { data: adminUsers, error: adminError } = await supabase
        .from("admin_users")
        .select("user_id, user_email")
        .order("granted_at", { ascending: false });

      if (adminError) {
        console.error("Error fetching admin users:", adminError);
      }

      // Create sets for quick lookups - more efficient than arrays for lookups
      const adminUserIds = new Set(
        (adminUsers || [])
          .filter((admin) => admin.user_id)
          .map((admin) => admin.user_id)
      );

      const adminEmails = new Set(
        (adminUsers || [])
          .filter((admin) => admin.user_email)
          .map((admin) => admin.user_email)
      );

      // Create a user object for the current user
      const currentUserData = {
        id: currentAuthUser.id,
        email: currentAuthUser.email || "",
        fullName: currentAuthUser.user_metadata?.full_name || "",
        isAdmin: true, // Current user is admin since they're viewing this page
        lastSignIn: null,
        createdAt: currentAuthUser.created_at,
      };

      // Add any admin users we know about by email - use a more efficient approach
      const knownAdminUsers = Array.from(adminEmails)
        .filter((email) => email !== currentAuthUser.email) // Exclude current user
        .map((email) => ({
          id: "unknown-" + Math.random().toString(36).substring(2, 15),
          email: email,
          fullName: "Admin User",
          isAdmin: true,
          lastSignIn: null,
          createdAt: new Date().toISOString(),
        }));

      // Use a more efficient way to update state
      setUsers([currentUserData, ...knownAdminUsers]);
      setCurrentUser(currentUserData);

      toast.success("Admin users loaded");
    } catch (err) {
      console.error("Error in fetchUsers:", err);
      toast.error("Failed to load user data");

      // Fallback to just the current user
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          const currentUserData = {
            id: user.id,
            email: user.email || "",
            fullName: user.user_metadata?.full_name || "",
            isAdmin: true,
            lastSignIn: null,
            createdAt: user.created_at,
          };

          setUsers([currentUserData]);
          setCurrentUser(currentUserData);
        }
      } catch (fallbackErr) {
        console.error("Error in fallback:", fallbackErr);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGrantAdmin = async (userId: string) => {
    setActionInProgress(userId);

    try {
      const result = await grantAdminPrivileges(currentUser.id, userId);

      if (result.success) {
        toast.success("Admin privileges granted successfully");
        // Update the local state
        setUsers(
          users.map((user) =>
            user.id === userId ? { ...user, isAdmin: true } : user
          )
        );
      } else {
        toast.error(result.error);
      }
    } catch (err) {
      console.error("Error granting admin privileges:", err);
      toast.error("Failed to grant admin privileges");
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRevokeAdmin = async (userId: string) => {
    // Prevent revoking your own admin privileges
    if (userId === currentUser?.id) {
      toast.error("You cannot revoke your own admin privileges");
      return;
    }

    if (!confirm("Are you sure you want to revoke admin privileges?")) {
      return;
    }

    try {
      setActionInProgress(userId);

      // Find the user's email
      const userToRevoke = users.find((u) => u.id === userId);

      if (!userToRevoke) {
        toast.error("User not found");
        setActionInProgress(null);
        return;
      }

      // Delete from admin_users table by user_id or email
      let deleteResult;

      if (userId.startsWith("unknown-") && userToRevoke.email) {
        // Delete by email
        deleteResult = await supabase
          .from("admin_users")
          .delete()
          .eq("user_email", userToRevoke.email);
      } else {
        // Delete by user_id
        deleteResult = await supabase
          .from("admin_users")
          .delete()
          .eq("user_id", userId);
      }

      if (deleteResult.error) {
        toast.error(
          `Error revoking admin privileges: ${deleteResult.error.message}`
        );
        return;
      }

      toast.success("Admin privileges revoked successfully");

      // Update local state
      setUsers(users.filter((user) => user.id !== userId));

      // Refresh the users list
      fetchUsers(currentUser?.id || "");
    } catch (err) {
      console.error("Error revoking admin privileges:", err);
      toast.error("Failed to revoke admin privileges");
    } finally {
      setActionInProgress(null);
    }
  };

  // Memoize filtered users
  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      if (!searchTerm) return true;

      const searchLower = searchTerm.toLowerCase();
      return (
        user.email.toLowerCase().includes(searchLower) ||
        (user.fullName && user.fullName.toLowerCase().includes(searchLower))
      );
    });
  }, [users, searchTerm]);

  const addAdminByEmail = async () => {
    if (!newAdminEmail.trim()) {
      toast.error("Please enter an email address");
      return;
    }

    try {
      setActionInProgress("adding-admin");

      // First check if the user exists in auth
      const {
        data: { user: currentAuthUser },
      } = await supabase.auth.getUser();

      if (!currentAuthUser) {
        toast.error("You must be logged in to add an admin");
        setActionInProgress(null);
        return;
      }

      // Add the admin directly by email
      const { data: adminData, error: adminError } = await supabase
        .from("admin_users")
        .insert({
          user_email: newAdminEmail.trim(),
          granted_by: currentAuthUser.id,
          granted_at: new Date().toISOString(),
        })
        .select();

      if (adminError) {
        console.error("Error adding admin:", adminError);
        toast.error("Failed to add admin: " + adminError.message);
        setActionInProgress(null);
        return;
      }

      toast.success(`Admin privileges granted to ${newAdminEmail}`);
      setNewAdminEmail("");

      // Refresh the users list
      fetchUsers(currentAuthUser.id);
    } catch (err) {
      console.error("Error adding admin by email:", err);
      toast.error("Failed to add admin");
    } finally {
      setActionInProgress(null);
    }
  };

  // Add this function to handle batch actions on orders
  const handleOrderBatchAction = async (action: BatchAction) => {
    if (selectedOrderIds.size === 0) {
      toast.error("No orders selected");
      return;
    }

    setIsOrderActionInProgress(true);

    try {
      const orderIds = Array.from(selectedOrderIds);

      switch (action) {
        case "approve":
          toast.info(`Approving ${orderIds.length} orders...`);

          // Use a more efficient batch update
          if (orderIds.length > 0) {
            const { error } = await supabase
              .from("orders")
              .update({ status: "active" })
              .in("id", orderIds);

            if (error) {
              throw error;
            }
          }

          toast.success(`${orderIds.length} orders approved`);
          break;

        case "reject":
          toast.info(`Rejecting ${orderIds.length} orders...`);

          // Use a more efficient batch update
          if (orderIds.length > 0) {
            const { error } = await supabase
              .from("orders")
              .update({ status: "rejected" })
              .in("id", orderIds);

            if (error) {
              throw error;
            }
          }

          toast.success(`${orderIds.length} orders rejected`);
          break;

        case "export":
          toast.info("Preparing export...");
          setIsExporting(true);

          // Get the selected orders
          const { data: selectedOrders } = await supabase
            .from("orders")
            .select("*")
            .in("id", orderIds);

          if (selectedOrders && selectedOrders.length > 0) {
            // Format the data for export
            const exportData = selectedOrders.map((order) => ({
              ID: order.id,
              Name: order.full_name,
              Email: order.email,
              Status: order.status,
              Created: new Date(order.created_at).toLocaleString(),
              // Add other fields as needed
            }));

            // Convert to CSV
            const headers = Object.keys(exportData[0]);
            const csvContent = [
              headers.join(","),
              ...exportData.map((row) =>
                headers
                  .map((header) =>
                    JSON.stringify(row[header as keyof typeof row])
                  )
                  .join(",")
              ),
            ].join("\n");

            // Create download link
            const blob = new Blob([csvContent], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `orders-export-${
              new Date().toISOString().split("T")[0]
            }.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            toast.success(`Exported ${selectedOrders.length} orders`);
          } else {
            toast.error("No orders found to export");
          }

          setIsExporting(false);
          break;

        case "delete":
          if (
            confirm(
              `Are you sure you want to delete ${orderIds.length} orders? This action cannot be undone.`
            )
          ) {
            toast.info(`Deleting ${orderIds.length} orders...`);

            const { error } = await supabase
              .from("orders")
              .delete()
              .in("id", orderIds);

            if (error) {
              toast.error(`Error deleting orders: ${error.message}`);
            } else {
              toast.success(`${orderIds.length} orders deleted`);
            }
          }
          break;
      }

      // Refresh orders to get the latest data
      fetchOrders();

      // Clear selection after action
      setSelectedOrderIds(new Set());
    } catch (err) {
      console.error(`Error performing batch action ${action}:`, err);
      toast.error(`Failed to ${action} orders`);
    } finally {
      setIsOrderActionInProgress(false);
    }
  };

  // Add this function to filter orders
  const getFilteredOrders = () => {
    return orders.filter((order) => {
      // Filter by status
      if (orderStatusFilter !== "all" && order.status !== orderStatusFilter) {
        return false;
      }

      // Filter by search query
      if (
        orderSearchQuery &&
        !order.full_name
          .toLowerCase()
          .includes(orderSearchQuery.toLowerCase()) &&
        !order.email.toLowerCase().includes(orderSearchQuery.toLowerCase())
      ) {
        return false;
      }

      // Filter by date range
      if (
        orderDateRange.start &&
        new Date(order.created_at) < orderDateRange.start
      ) {
        return false;
      }

      if (orderDateRange.end) {
        const endDate = new Date(orderDateRange.end);
        endDate.setHours(23, 59, 59, 999); // Set to end of day
        if (new Date(order.created_at) > endDate) {
          return false;
        }
      }

      return true;
    });
  };

  // Add this function to calculate order statistics
  const calculateOrderStats = () => {
    const total = orders.length;
    const pending = orders.filter((order) => order.status === "pending").length;
    const active = orders.filter((order) => order.status === "active").length;
    const rejected = orders.filter(
      (order) => order.status === "rejected"
    ).length;
    const withAccountFiles = orders.filter(
      (order) => order.account_file_url
    ).length;

    return { total, pending, active, rejected, withAccountFiles };
  };

  // Add this function to view order details
  const viewOrderDetails = (order: Order) => {
    setSelectedOrderDetail(order);
  };

  // Add this component for the account details form
  const AccountDetailsForm = ({ orderId }: { orderId: string }) => {
    const [localAccountDetails, setLocalAccountDetails] = useState({
      accountId: "",
      password: "",
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();

      if (!localAccountDetails.accountId.trim()) {
        toast.error("Account ID is required");
        return;
      }

      setIsSubmitting(true);

      const success = await deliverAccountDetails(orderId, localAccountDetails);

      if (success) {
        // Reset form
        setLocalAccountDetails({
          accountId: "",
          password: "",
        });
      }

      setIsSubmitting(false);
    };

    const generateRandomPassword = () => {
      const chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
      let password = "";
      for (let i = 0; i < 12; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      setLocalAccountDetails((prev) => ({ ...prev, password }));
    };

    return (
      <div className="bg-white/5 rounded-lg p-6 mt-4">
        <h3 className="text-lg font-medium text-white mb-4">
          Deliver Account Details
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="accountId" className="block text-white/70 mb-2">
              Account ID / Email <span className="text-red-400">*</span>
            </label>
            <input
              id="accountId"
              type="text"
              value={localAccountDetails.accountId}
              onChange={(e) =>
                setLocalAccountDetails((prev) => ({
                  ...prev,
                  accountId: e.target.value,
                }))
              }
              className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:border-white/40"
              placeholder="Enter account ID or email"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-white/70 mb-2">
              Password
            </label>
            <div className="flex gap-2">
              <input
                id="password"
                type="text"
                value={localAccountDetails.password}
                onChange={(e) =>
                  setLocalAccountDetails((prev) => ({
                    ...prev,
                    password: e.target.value,
                  }))
                }
                className="flex-1 bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:border-white/40"
                placeholder="Enter password (optional)"
              />
              <button
                type="button"
                onClick={generateRandomPassword}
                className="px-3 py-2 bg-purple-500/20 text-purple-400 rounded hover:bg-purple-500/30 transition-colors"
              >
                Generate
              </button>
            </div>
            <p className="text-white/50 text-sm mt-1">
              Leave blank to only deliver the account ID
            </p>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={() => setSelectedOrderId(null)}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded transition-colors"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded transition-colors flex items-center gap-2"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Delivering...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Deliver Account
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    );
  };

  // Add this function to render the settings tab
  const renderSettingsTab = () => {
    return (
      <div>
        <h2 className="text-xl text-white mb-6">Admin Settings</h2>

        <div className="space-y-6">
          {/* System Settings */}
          <div className="bg-white/5 rounded-lg p-6">
            <h3 className="text-lg text-white mb-4">System Settings</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-white/70 mb-2">Site Name</label>
                <input
                  type="text"
                  value="Cipher Admin"
                  onChange={() => {}}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:border-white/40"
                />
              </div>

              <div>
                <label className="block text-white/70 mb-2">
                  Support Email
                </label>
                <input
                  type="email"
                  value="support@example.com"
                  onChange={() => {}}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:border-white/40"
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="maintenance-mode"
                  checked={false}
                  onChange={() => {}}
                  className="w-4 h-4 accent-emerald-500"
                />
                <label htmlFor="maintenance-mode" className="ml-2 text-white">
                  Enable Maintenance Mode
                </label>
              </div>
            </div>

            <div className="mt-6">
              <button
                onClick={() => toast.info("Settings saved (demo)")}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded transition-colors"
              >
                Save Settings
              </button>
            </div>
          </div>

          {/* Database Management */}
          <div className="bg-white/5 rounded-lg p-6">
            <h3 className="text-lg text-white mb-4">Database Management</h3>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-white">Backup Database</h4>
                  <p className="text-white/70 text-sm">
                    Create a backup of the current database
                  </p>
                </div>
                <button
                  onClick={() => toast.info("Database backup initiated (demo)")}
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
                >
                  Create Backup
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-white">Clear Cache</h4>
                  <p className="text-white/70 text-sm">
                    Clear the system cache
                  </p>
                </div>
                <button
                  onClick={() => toast.success("Cache cleared (demo)")}
                  className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded transition-colors"
                >
                  Clear Cache
                </button>
              </div>
            </div>
          </div>

          {/* Danger Zone */}
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-6">
            <h3 className="text-lg text-red-400 mb-4">Danger Zone</h3>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-white">Reset All Settings</h4>
                  <p className="text-white/70 text-sm">
                    Reset all settings to default values
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (
                      confirm(
                        "Are you sure you want to reset all settings? This cannot be undone."
                      )
                    ) {
                      toast.success("Settings reset to defaults (demo)");
                    }
                  }}
                  className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded transition-colors"
                >
                  Reset Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Create a memoized order item renderer
  const OrderRow = React.memo(
    ({ index, style }: { index: number; style: React.CSSProperties }) => {
      const order = filteredOrders[index];
      return (
        <div style={style} className="px-4">
          <div
            key={order.id}
            className="bg-white/5 hover:bg-white/10 rounded-lg p-4 transition-colors my-2"
          >
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
                  <span
                    className={`px-2 py-1 rounded text-xs ${
                      order.status === "active"
                        ? "bg-emerald-400/20 text-emerald-400"
                        : order.status === "rejected"
                        ? "bg-red-400/20 text-red-400"
                        : order.status === "delivered"
                        ? "bg-blue-400/20 text-blue-400"
                        : "bg-yellow-400/20 text-yellow-400"
                    }`}
                  >
                    {order.status.toUpperCase()}
                  </span>
                  {order.account_file_url && (
                    <span className="bg-purple-400/20 text-purple-400 px-2 py-1 rounded text-xs">
                      HAS ACCOUNT FILE
                    </span>
                  )}
                  {order.messages && order.messages.length > 0 && (
                    <span className="bg-blue-400/20 text-blue-400 px-2 py-1 rounded text-xs">
                      {order.messages.length} MESSAGES
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Action buttons */}
                <button
                  onClick={() => handleViewOrderDetails(order.id)}
                  className="p-2 bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 transition-colors"
                  title="View order details"
                >
                  <Eye className="w-5 h-5" />
                </button>

                <Link
                  to={`/chat?order=${order.id}`}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                  title="Open chat"
                >
                  <MessageSquare className="text-white" size={20} />
                </Link>

                {order.status === "pending" && (
                  <>
                    <button
                      onClick={() => handleApprove(order.id)}
                      className="p-2 bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30 transition-colors"
                      title="Approve order"
                    >
                      <CheckCircle className="w-5 h-5" />
                    </button>

                    <button
                      onClick={() => handleReject(order.id)}
                      className="p-2 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors"
                      title="Reject order"
                    >
                      <XCircle className="w-5 h-5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }
  );

  // Update the renderOrdersTab function to use virtualization
  const renderOrdersTab = () => {
    const filteredOrdersToShow = filteredOrders || [];

    return (
      <div>
        <h2 className="text-xl text-white mb-6">Order Management</h2>

        {/* Order Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          {Object.entries(stats).map(([key, value]) => (
            <div key={key} className="bg-white/5 rounded-lg p-4">
              <h3 className="text-white/70 text-sm uppercase">
                {key.replace(/([A-Z])/g, " $1").trim()}
              </h3>
              <p className="text-2xl font-bold text-white mt-1">{value}</p>
            </div>
          ))}
        </div>

        {/* Search and Filter Controls - keep existing code */}
        <div className="mb-6">
          {/* ... your existing search/filter controls ... */}
        </div>

        {/* Orders List with virtualization */}
        {loading && orders.length === 0 ? (
          <OrdersSkeleton />
        ) : filteredOrdersToShow.length === 0 ? (
          <div className="bg-white/5 rounded-lg p-8 text-center">
            <p className="text-white/70 mb-4">No orders found</p>
            <button
              onClick={() => fetchOrders(1, false)}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
            >
              Refresh Orders
            </button>
          </div>
        ) : (
          <>
            {/* Virtualized list implementation */}
            <div className="h-[calc(100vh-300px)] w-full">
              <AutoSizer>
                {({ height, width }) => (
                  <List
                    height={height}
                    width={width}
                    itemCount={filteredOrdersToShow.length}
                    itemSize={180} // Adjust based on your row height
                    overscanCount={5} // Pre-render additional items for smoother scrolling
                  >
                    {OrderRow}
                  </List>
                )}
              </AutoSizer>
            </div>

            {/* Load more indicator */}
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
          </>
        )}
      </div>
    );
  };

  // Add this function to create required database tables
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

      toast.success("Admin tables set up successfully. Refreshing...");

      // Reload the page after a short delay
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (err) {
      console.error("Error setting up admin tables:", err);
      toast.error("Failed to set up admin tables");
    }
  };

  // Add this function to handle file uploads from the OrderDetailModal
  const onFileUpload = useCallback(async (orderId: string, fileUrl: string) => {
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
          order.id === orderId ? { ...order, account_file_url: fileUrl } : order
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
  }, []);

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
              is an error, you can try to set up the admin database tables.
            </p>
            <div className="flex flex-col gap-4 items-center">
              <button
                onClick={setupAdminTables}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors w-full"
              >
                Set Up Admin Tables
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
      />
    </PageContainer>
  );
}

export default AdminPage;
