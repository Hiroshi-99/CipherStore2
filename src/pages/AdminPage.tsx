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

  // Define handleApprove early in the component
  const handleApprove = async (orderId: string) => {
    try {
      setActionInProgress(orderId);

      // Update the order status to active
      const { error } = await supabase
        .from("orders")
        .update({ status: "active" })
        .eq("id", orderId);

      if (error) {
        console.error("Error approving order:", error);
        toast.error("Failed to approve order");
        return;
      }

      // Update local state
      setOrders(
        orders.map((order) =>
          order.id === orderId ? { ...order, status: "active" } : order
        )
      );

      toast.success("Order approved successfully");

      // Refresh orders to get the latest data
      fetchOrders();
    } catch (err) {
      console.error("Error in handleApprove:", err);
      toast.error("Failed to approve order");
    } finally {
      setActionInProgress(null);
    }
  };

  // Add this function to handle rejecting orders
  const handleReject = async (orderId: string) => {
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
        console.error("Error rejecting order:", error);
        toast.error("Failed to reject order");
        return;
      }

      // Update local state
      setOrders(
        orders.map((order) =>
          order.id === orderId ? { ...order, status: "rejected" } : order
        )
      );

      toast.success("Order rejected successfully");

      // Refresh orders to get the latest data
      fetchOrders();
    } catch (err) {
      console.error("Error in handleReject:", err);
      toast.error("Failed to reject order");
    } finally {
      setActionInProgress(null);
    }
  };

  useEffect(() => {
    setPageTitle("ADMIN");
    fetchOrders();
    checkAdminStatus();
  }, []);

  // Optimize the fetchOrders function to properly retrieve all orders
  const fetchOrders = async () => {
    setRefreshing(true);

    try {
      // Use a more efficient query with pagination and proper relations
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
        .limit(100); // Limit to 100 orders for better performance

      if (ordersError) {
        console.error("Error fetching orders:", ordersError);
        toast.error("Failed to load orders");
        return;
      }

      if (ordersData) {
        console.log("Fetched orders:", ordersData); // Debug log

        // Cache the orders
        localStorage.setItem("admin_orders_cache", JSON.stringify(ordersData));
        localStorage.setItem("admin_orders_timestamp", Date.now().toString());

        // Use a more efficient way to update state
        setOrders(ordersData);

        // Calculate statistics more efficiently
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
      } else {
        console.log("No orders data returned"); // Debug log
      }
    } catch (err) {
      console.error("Error in fetchOrders:", err);
      toast.error("Failed to load orders");
    } finally {
      setRefreshing(false);
    }
  };

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
    const checkAuthAndAdmin = async () => {
      try {
        setLoading(true);

        // Get the current user
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          console.error("No user found");
          setIsAdmin(false);
          navigate("/");
          return;
        }

        // Check if the user is an admin
        const adminStatus = await checkIfAdmin(user.id);
        console.log("Admin status:", adminStatus);
        setIsAdmin(adminStatus);

        if (adminStatus) {
          // Set current user
          setCurrentUser({
            id: user.id,
            email: user.email || "",
            fullName: user.user_metadata?.full_name || "",
            isAdmin: true,
            lastSignIn: user.last_sign_in_at,
            createdAt: user.created_at,
          });

          // Fetch orders and users
          await fetchOrders();
          await fetchUsers(user.id);
        } else {
          // Not an admin
          toast.error(
            "You don't have admin privileges. Creating tables may help..."
          );
        }
      } catch (err) {
        console.error("Error checking auth and admin status:", err);
        toast.error("Failed to check authentication and admin status");
      } finally {
        setLoading(false);
      }
    };

    checkAuthAndAdmin();
  }, []);

  // Add this function to fetch users
  const fetchUsers = async (adminUserId: string) => {
    if (!adminUserId) {
      console.error("No admin user ID provided");
      return;
    }

    try {
      // First try to get users with admin status
      const result = await getAllUsersClientSide();

      if (result.success && result.data) {
        setUsers(result.data);

        // Set current user
        const currentUserData = result.data.find(
          (user) => user.id === adminUserId
        );
        if (currentUserData) {
          setCurrentUser(currentUserData);
        }
      } else {
        console.error("Error fetching users:", result.error);

        // Fallback to local user only
        const localResult = await getLocalUsers(adminUserId);

        if (localResult.success && localResult.data) {
          setUsers(localResult.data);

          // Set current user
          const currentUserData = localResult.data.find(
            (user) => user.id === adminUserId
          );
          if (currentUserData) {
            setCurrentUser(currentUserData);
          }
        } else {
          console.error("Error fetching local users:", localResult.error);

          // Last resort: just use the current user
          const {
            data: { user },
          } = await supabase.auth.getUser();

          if (user) {
            const currentUserData = {
              id: user.id,
              email: user.email || "",
              fullName: user.user_metadata?.full_name || "",
              isAdmin: true, // We know they're admin if they got this far
              lastSignIn: null,
              createdAt: user.created_at,
            };

            setUsers([currentUserData]);
            setCurrentUser(currentUserData);
          }
        }
      }
    } catch (err) {
      console.error("Error in fetchUsers:", err);
      toast.error("Failed to fetch users");

      // Last resort: just use the current user
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          const currentUserData = {
            id: user.id,
            email: user.email || "",
            fullName: user.user_metadata?.full_name || "",
            isAdmin: true, // We know they're admin if they got this far
            lastSignIn: null,
            createdAt: user.created_at,
          };

          setUsers([currentUserData]);
          setCurrentUser(currentUserData);
        }
      } catch (fallbackErr) {
        console.error("Error in fallback:", fallbackErr);
      }
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

  // Filter users based on search term
  const filteredUsers = users.filter((user) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      user.email?.toLowerCase().includes(searchLower) ||
      user.fullName?.toLowerCase().includes(searchLower) ||
      user.id.toLowerCase().includes(searchLower)
    );
  });

  // Add this function to add an admin by email
  const addAdminByEmail = async () => {
    if (!newAdminEmail.trim()) {
      toast.error("Please enter an email address");
      return;
    }

    try {
      setActionInProgress("adding-admin");

      // First check if the user exists
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("id")
        .eq("email", newAdminEmail)
        .single();

      if (userError) {
        // User not found in users table, try to find in auth
        const { data: authData, error: authError } = await supabase.rpc(
          "find_user_by_email",
          {
            email_to_find: newAdminEmail,
          }
        );

        if (authError || !authData) {
          console.error("Error finding user:", authError);
          toast.error("User not found with that email address");
          setActionInProgress(null);
          return;
        }

        // User found in auth, add to users table
        const { error: insertError } = await supabase.from("users").insert({
          id: authData.id,
          email: newAdminEmail,
          is_admin: true,
          created_at: new Date().toISOString(),
        });

        if (insertError) {
          console.error("Error adding user to users table:", insertError);
          toast.error("Failed to add user to users table");
          setActionInProgress(null);
          return;
        }

        // Add to admin_users table
        const { error: adminError } = await supabase
          .from("admin_users")
          .insert({
            user_id: authData.id,
            granted_by: currentUser?.id,
            granted_at: new Date().toISOString(),
          });

        if (adminError) {
          console.error("Error adding user to admin_users table:", adminError);
          toast.error("Failed to add user as admin");
          setActionInProgress(null);
          return;
        }

        toast.success(`Added ${newAdminEmail} as admin`);
        setNewAdminEmail("");

        // Refresh users list
        fetchUsers(currentUser?.id || "");
      } else {
        // User found in users table, update is_admin flag
        const { error: updateError } = await supabase
          .from("users")
          .update({ is_admin: true })
          .eq("id", userData.id);

        if (updateError) {
          console.error("Error updating user as admin:", updateError);
          toast.error("Failed to update user as admin");
          setActionInProgress(null);
          return;
        }

        // Add to admin_users table
        const { error: adminError } = await supabase
          .from("admin_users")
          .insert({
            user_id: userData.id,
            granted_by: currentUser?.id,
            granted_at: new Date().toISOString(),
          });

        if (adminError) {
          console.error("Error adding user to admin_users table:", adminError);
          toast.error("Failed to add user as admin");
          setActionInProgress(null);
          return;
        }

        toast.success(`Added ${newAdminEmail} as admin`);
        setNewAdminEmail("");

        // Refresh users list
        fetchUsers(currentUser?.id || "");
      }
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
        <h2 className="text-xl text-white mb-6">Settings</h2>

        <div className="space-y-6">
          {/* Database Settings */}
          <div className="bg-white/5 rounded-lg p-6">
            <h3 className="text-lg font-medium text-white mb-4">
              Database Management
            </h3>

            <div className="space-y-4">
              <button
                onClick={createRequiredTables}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
              >
                Create/Repair Database Tables
              </button>

              <button
                onClick={checkDatabaseAccess}
                className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded transition-colors ml-2"
              >
                Check Database Access
              </button>

              <button
                onClick={debugAdminPermissions}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded transition-colors ml-2"
              >
                Fix Admin Permissions
              </button>
            </div>

            <div className="mt-4 text-white/70 text-sm">
              <p>
                Use these tools to manage database tables and fix permissions
                issues.
              </p>
            </div>
          </div>

          {/* Cache Settings */}
          <div className="bg-white/5 rounded-lg p-6">
            <h3 className="text-lg font-medium text-white mb-4">
              Cache Management
            </h3>

            <div className="space-y-4">
              <button
                onClick={() => {
                  localStorage.removeItem("admin_orders_cache");
                  localStorage.removeItem("admin_orders_timestamp");
                  toast.success("Cache cleared");
                  fetchOrders();
                }}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded transition-colors"
              >
                Clear Cache
              </button>
            </div>

            <div className="mt-4 text-white/70 text-sm">
              <p>Clear the local cache to fetch fresh data from the server.</p>
            </div>
          </div>

          {/* User Settings */}
          <div className="bg-white/5 rounded-lg p-6">
            <h3 className="text-lg font-medium text-white mb-4">
              User Settings
            </h3>

            {currentUser && (
              <div className="text-white/70">
                <p>
                  <span className="text-white">Email:</span> {currentUser.email}
                </p>
                <p>
                  <span className="text-white">Name:</span>{" "}
                  {currentUser.fullName || "Not set"}
                </p>
                <p>
                  <span className="text-white">Admin:</span>{" "}
                  {currentUser.isAdmin ? "Yes" : "No"}
                </p>
                <p>
                  <span className="text-white">Created:</span>{" "}
                  {new Date(currentUser.createdAt).toLocaleString()}
                </p>
              </div>
            )}

            <div className="mt-4">
              <button
                onClick={() => {
                  supabase.auth.signOut();
                  navigate("/");
                }}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Add this function to render the orders tab
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

        {/* Search and Filter Controls */}
        <div className="mb-6">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search orders..."
                  className="w-full bg-white/10 border border-white/20 rounded-lg pl-10 pr-4 py-2 text-white placeholder-white/50 focus:outline-none focus:border-white/40"
                />
                <Search
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/50"
                  size={18}
                />
              </div>
            </div>

            {/* Debug button */}
            <button
              onClick={checkDatabaseAccess}
              className="px-4 py-2 bg-purple-500/20 text-purple-400 rounded hover:bg-purple-500/30 transition-colors"
            >
              Check DB Access
            </button>

            <button
              onClick={fetchOrders}
              className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 transition-colors flex items-center gap-2"
            >
              <RefreshCw
                className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
          </div>
        </div>

        {/* Orders List */}
        {filteredOrdersToShow.length === 0 ? (
          <div className="bg-white/5 rounded-lg p-8 text-center">
            <p className="text-white/70 mb-4">No orders found</p>
            <button
              onClick={fetchOrders}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
            >
              Refresh Orders
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredOrdersToShow.map((order) => (
              <div
                key={order.id}
                className="bg-white/5 hover:bg-white/10 rounded-lg p-6 transition-colors"
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
                    {order.payment_proofs &&
                      order.payment_proofs.length > 0 && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setCurrentImageUrl(
                                order.payment_proofs[0].image_url
                              );
                              setShowImageModal(true);
                            }}
                            className="p-2 hover:bg-white/10 rounded-full transition-colors"
                            title="View payment proof"
                          >
                            <Eye className="text-white" size={20} />
                          </button>
                          {order.status === "pending" && (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleApprove(order.id)}
                                disabled={!!actionInProgress}
                                className="p-2 hover:bg-white/10 rounded-full transition-colors disabled:opacity-50"
                                title="Approve order"
                              >
                                <CheckCircle
                                  className="text-green-400"
                                  size={20}
                                />
                              </button>
                              <button
                                onClick={() => handleReject(order.id)}
                                disabled={!!actionInProgress}
                                className="p-2 hover:bg-white/10 rounded-full transition-colors disabled:opacity-50"
                                title="Reject order"
                              >
                                <XCircle className="text-red-400" size={20} />
                              </button>
                            </div>
                          )}
                        </div>
                      )}

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
                  </div>
                </div>

                {order.status === "active" && !order.account_file_url && (
                  <div className="mt-4">
                    <FileUpload
                      orderId={order.id}
                      onUploadSuccess={(fileUrl) =>
                        onFileUpload(order.id, fileUrl)
                      }
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Update the OrderDetailModal component
  const OrderDetailModal = () => {
    if (!selectedOrderDetail) return null;

    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
        <div className="bg-gray-900 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <div className="p-6">
            <div className="flex justify-between items-start mb-6">
              <h2 className="text-xl font-bold text-white">Order Details</h2>
              <button
                onClick={() => setSelectedOrderDetail(null)}
                className="text-white/70 hover:text-white"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <h3 className="text-white/70 mb-2">Customer Information</h3>
                <div className="bg-white/5 rounded-lg p-4">
                  <p className="text-white">
                    <span className="text-white/70">Name:</span>{" "}
                    {selectedOrderDetail.full_name}
                  </p>
                  <p className="text-white">
                    <span className="text-white/70">Email:</span>{" "}
                    {selectedOrderDetail.email}
                  </p>
                  <p className="text-white">
                    <span className="text-white/70">Status:</span>
                    <span
                      className={`ml-2 px-2 py-0.5 rounded text-xs ${
                        selectedOrderDetail.status === "active"
                          ? "bg-green-500/20 text-green-400"
                          : selectedOrderDetail.status === "rejected"
                          ? "bg-red-500/20 text-red-400"
                          : selectedOrderDetail.status === "delivered"
                          ? "bg-blue-500/20 text-blue-400"
                          : "bg-yellow-500/20 text-yellow-400"
                      }`}
                    >
                      {selectedOrderDetail.status.toUpperCase()}
                    </span>
                  </p>
                  <p className="text-white">
                    <span className="text-white/70">Created:</span>{" "}
                    {new Date(selectedOrderDetail.created_at).toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Payment Proofs Section */}
              {selectedOrderDetail.payment_proofs &&
                selectedOrderDetail.payment_proofs.length > 0 && (
                  <div>
                    <h3 className="text-white/70 mb-2">Payment Proofs</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {selectedOrderDetail.payment_proofs.map(
                        (proof, index) => (
                          <div
                            key={index}
                            className="bg-white/5 rounded-lg p-4"
                          >
                            <img
                              src={proof.image_url}
                              alt={`Payment proof ${index + 1}`}
                              className="w-full h-auto rounded-lg mb-2 cursor-pointer"
                              onClick={() => {
                                setCurrentImageUrl(proof.image_url);
                                setShowImageModal(true);
                              }}
                            />
                            <p className="text-white/70 text-sm">
                              Status:{" "}
                              <span
                                className={`${
                                  proof.status === "approved"
                                    ? "text-green-400"
                                    : proof.status === "rejected"
                                    ? "text-red-400"
                                    : "text-yellow-400"
                                }`}
                              >
                                {proof.status.toUpperCase()}
                              </span>
                            </p>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}

              {/* Account Details Section */}
              {selectedOrderDetail.account_id ? (
                <div>
                  <h3 className="text-white/70 mb-2">Account Details</h3>
                  <div className="bg-white/5 rounded-lg p-4">
                    <p className="text-white">
                      <span className="text-white/70">Account ID:</span>{" "}
                      {selectedOrderDetail.account_id}
                    </p>
                    {selectedOrderDetail.account_password && (
                      <p className="text-white">
                        <span className="text-white/70">Password:</span>{" "}
                        {selectedOrderDetail.account_password}
                      </p>
                    )}
                    {selectedOrderDetail.delivery_date && (
                      <p className="text-white">
                        <span className="text-white/70">Delivered:</span>{" "}
                        {new Date(
                          selectedOrderDetail.delivery_date
                        ).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              ) : selectedOrderDetail.status === "active" ? (
                <AccountDetailsForm orderId={selectedOrderDetail.id} />
              ) : null}

              {/* Account File Section */}
              {selectedOrderDetail.account_file_url ? (
                <div>
                  <h3 className="text-white/70 mb-2">Account File</h3>
                  <div className="bg-white/5 rounded-lg p-4 flex items-center justify-between">
                    <div>
                      <p className="text-white">Account file uploaded</p>
                      <p className="text-white/70 text-sm">
                        {new URL(selectedOrderDetail.account_file_url).pathname
                          .split("/")
                          .pop()}
                      </p>
                    </div>
                    <a
                      href={selectedOrderDetail.account_file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 transition-colors"
                    >
                      <Download className="w-5 h-5" />
                    </a>
                  </div>
                </div>
              ) : selectedOrderDetail.status === "active" &&
                !selectedOrderDetail.account_id ? (
                <div>
                  <h3 className="text-white/70 mb-2">Account File</h3>
                  <div className="bg-white/5 rounded-lg p-4">
                    <p className="text-white/70 mb-2">
                      No account file uploaded yet
                    </p>
                    <FileUpload
                      orderId={selectedOrderDetail.id}
                      onUploadSuccess={(fileUrl) => {
                        onFileUpload(selectedOrderDetail.id, fileUrl);
                        setSelectedOrderDetail({
                          ...selectedOrderDetail,
                          account_file_url: fileUrl,
                        });
                      }}
                    />
                  </div>
                </div>
              ) : null}

              <div className="flex justify-end gap-3 mt-6">
                <Link
                  to={`/chat?order=${selectedOrderDetail.id}`}
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
                >
                  Open Chat
                </Link>
                <button
                  onClick={() => setSelectedOrderDetail(null)}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Add this function to handle file uploads
  const onFileUpload = async (orderId: string, fileUrl: string) => {
    try {
      // Update the order with the file URL
      const { error } = await supabase
        .from("orders")
        .update({ account_file_url: fileUrl })
        .eq("id", orderId);

      if (error) {
        console.error("Error updating order with file URL:", error);
        toast.error("Failed to save file URL to order");
        return;
      }

      // Update local state
      setOrders(
        orders.map((order) =>
          order.id === orderId ? { ...order, account_file_url: fileUrl } : order
        )
      );

      toast.success("File uploaded and linked to order successfully");

      // Set the uploaded file URL for reference
      setUploadedFileUrl(fileUrl);

      // Refresh orders to get the latest data
      fetchOrders();
    } catch (err) {
      console.error("Error in onFileUpload:", err);
      toast.error("Failed to process file upload");
    }
  };

  // Add this function to handle viewing order details
  const handleViewOrderDetails = (orderId: string) => {
    setSelectedOrderId(orderId);
    const order = orders.find((o) => o.id === orderId);
    if (order) {
      setSelectedOrderDetail(order);
    }
  };

  // Add this function to check database tables and permissions
  const checkDatabaseAccess = async () => {
    try {
      // Check if we can access the orders table
      const { data: orderCheck, error: orderError } = await supabase
        .from("orders")
        .select("id")
        .limit(1);

      console.log("Order check:", { data: orderCheck, error: orderError });

      // Check if we can access the payment_proofs table
      const { data: proofCheck, error: proofError } = await supabase
        .from("payment_proofs")
        .select("id")
        .limit(1);

      console.log("Payment proof check:", {
        data: proofCheck,
        error: proofError,
      });

      // Check if we can access the messages table
      const { data: messageCheck, error: messageError } = await supabase
        .from("messages")
        .select("id")
        .limit(1);

      console.log("Message check:", {
        data: messageCheck,
        error: messageError,
      });

      // Get the current user's role
      const {
        data: { user },
      } = await supabase.auth.getUser();
      console.log("Current user:", user);

      toast.success("Database access check complete. See console for details.");
    } catch (err) {
      console.error("Error checking database access:", err);
      toast.error("Failed to check database access");
    }
  };

  // Add this effect to check database access on component mount
  useEffect(() => {
    const checkInitialAccess = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          // Check if we can access the orders table
          const { data: orderCheck, error: orderError } = await supabase
            .from("orders")
            .select("id")
            .limit(1);

          if (orderError) {
            console.error("Error accessing orders table:", orderError);
            toast.error(
              "Error accessing orders table. Check console for details."
            );
          } else {
            console.log("Successfully accessed orders table:", orderCheck);
          }
        }
      } catch (err) {
        console.error("Error in initial access check:", err);
      }
    };

    checkInitialAccess();
  }, []);

  // Update the useEffect that fetches orders
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setLoading(true);

        // Check if the user is an admin
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setIsAdmin(false);
          setLoading(false);
          return;
        }

        const isAdminResult = await checkIfAdmin(user.id);
        setIsAdmin(isAdminResult.isAdmin);

        if (isAdminResult.isAdmin) {
          // Fetch orders
          await fetchOrders();

          // Fetch users
          await fetchUsers(user.id);
        }
      } catch (err) {
        console.error("Error fetching initial data:", err);
        toast.error("Failed to load data. Please refresh the page.");
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
  }, []);

  // Add this function to create necessary database tables
  const createRequiredTables = async () => {
    try {
      toast.info("Creating required database tables...");

      // Get the current user
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        toast.error("No user found. Please log in.");
        return;
      }

      // Try to create admin_users table
      const createAdminUsersSQL = `
        CREATE TABLE IF NOT EXISTS admin_users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL,
          granted_by UUID,
          granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          UNIQUE(user_id)
        );
      `;

      // Try to create users table
      const createUsersSQL = `
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY,
          email TEXT,
          full_name TEXT,
          is_admin BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `;

      // Try to execute SQL
      try {
        // Create admin_users table
        const { error: adminError } = await supabase.rpc("execute_sql", {
          sql: createAdminUsersSQL,
        });

        if (adminError) {
          console.error("Error creating admin_users table:", adminError);
          toast.error(
            `Error creating admin_users table: ${adminError.message}`
          );
        } else {
          toast.success("Admin users table created successfully");
        }

        // Create users table
        const { error: usersError } = await supabase.rpc("execute_sql", {
          sql: createUsersSQL,
        });

        if (usersError) {
          console.error("Error creating users table:", usersError);
          toast.error(`Error creating users table: ${usersError.message}`);
        } else {
          toast.success("Users table created successfully");
        }
      } catch (sqlError) {
        console.error("SQL execution error:", sqlError);
        toast.error("Error executing SQL. You might not have permission.");

        // Fallback: try direct table creation via insert
        try {
          // Try to insert the current user as an admin
          const { error: insertError } = await supabase
            .from("admin_users")
            .insert({
              user_id: user.id,
              granted_at: new Date().toISOString(),
            });

          if (insertError && !insertError.message.includes("already exists")) {
            console.error("Error inserting admin user:", insertError);
            toast.error(`Error adding admin user: ${insertError.message}`);
          } else {
            toast.success("You were added as an admin user");
          }
        } catch (insertError) {
          console.error("Insert error:", insertError);
          toast.error("Failed to create tables via insert");
        }
      }

      // Add current user to users table
      const { error: upsertError } = await supabase.from("users").upsert(
        {
          id: user.id,
          email: user.email,
          full_name: user.user_metadata?.full_name || "",
          is_admin: true,
          created_at: user.created_at,
        },
        { onConflict: "id" }
      );

      if (upsertError) {
        console.error("Error adding user to users table:", upsertError);
        toast.error(`Error adding user: ${upsertError.message}`);
      } else {
        toast.success("User details updated successfully");
      }

      // Add current user to admin_users table
      const { error: adminInsertError } = await supabase
        .from("admin_users")
        .upsert(
          {
            user_id: user.id,
            granted_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );

      if (adminInsertError) {
        console.error(
          "Error adding user to admin_users table:",
          adminInsertError
        );
        toast.error(`Error adding admin: ${adminInsertError.message}`);
      } else {
        toast.success("Admin privileges granted successfully");
      }

      // Refresh the page after a delay
      toast.info("Refreshing page in 3 seconds...");
      setTimeout(() => {
        window.location.reload();
      }, 3000);
    } catch (err) {
      console.error("Error creating required tables:", err);
      toast.error("Failed to create database tables");
    }
  };

  // Add this function to debug and fix admin permissions
  const debugAdminPermissions = async () => {
    try {
      toast.info("Checking admin permissions...");

      // Get the current user
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        toast.error("No user found. Please log in.");
        return;
      }

      console.log("Current user:", user);

      // Check if the user exists in the users table
      const { data: existingUser, error: userError } = await supabase
        .from("users")
        .select("*")
        .eq("id", user.id)
        .single();

      if (userError) {
        console.error("Error checking user in users table:", userError);

        // Add the user to the users table
        const { error: insertError } = await supabase.from("users").insert({
          id: user.id,
          email: user.email,
          full_name: user.user_metadata?.full_name || "",
          is_admin: true,
          created_at: user.created_at,
        });

        if (insertError) {
          console.error("Error adding user to users table:", insertError);
          toast.error("Failed to add user to users table");
        } else {
          toast.success("Added user to users table");
        }
      } else {
        console.log("User found in users table:", existingUser);

        // Update the user's admin status
        const { error: updateError } = await supabase
          .from("users")
          .update({ is_admin: true })
          .eq("id", user.id);

        if (updateError) {
          console.error("Error updating user admin status:", updateError);
          toast.error("Failed to update user admin status");
        } else {
          toast.success("Updated user admin status");
        }
      }

      // Check if the user exists in the admin_users table
      const { data: adminUser, error: adminError } = await supabase
        .from("admin_users")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (adminError) {
        console.error("Error checking user in admin_users table:", adminError);

        // Add the user to the admin_users table
        const { error: insertError } = await supabase
          .from("admin_users")
          .insert({
            user_id: user.id,
            granted_at: new Date().toISOString(),
          });

        if (insertError) {
          console.error("Error adding user to admin_users table:", insertError);
          toast.error("Failed to add user to admin_users table");
        } else {
          toast.success("Added user to admin_users table");
        }
      } else {
        console.log("User found in admin_users table:", adminUser);
        toast.success("User already has admin privileges");
      }

      // Refresh the page to apply changes
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (err) {
      console.error("Error debugging admin permissions:", err);
      toast.error("Failed to debug admin permissions");
    }
  };

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
      <PageContainer>
        <div className="flex items-center justify-center min-h-[calc(100vh-5rem)]">
          <div className="text-center max-w-md">
            <h2 className="text-xl text-white mb-4">Access Denied</h2>
            <p className="text-white/70 mb-6">
              You don't have permission to access this page. If you believe this
              is an error, you can try the following options:
            </p>
            <div className="flex flex-col gap-4 items-center">
              <button
                onClick={createRequiredTables}
                className="w-full px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
              >
                Create Database Tables
              </button>

              <button
                onClick={debugAdminPermissions}
                className="w-full px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors"
              >
                Fix Admin Permissions
              </button>

              <button
                onClick={() => navigate("/")}
                className="w-full px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors"
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
