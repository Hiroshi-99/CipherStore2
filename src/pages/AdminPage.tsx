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
  characterId?: string;
  loginMethod?: string;
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
    characterId: "",
    loginMethod: "Receive code from email",
  });

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
    if (selectedOrders.size === 0 || isBatchProcessing) return;
    setIsBatchProcessing(true);

    try {
      switch (action) {
        case "approve":
        case "reject": {
          await Promise.all(
            Array.from(selectedOrders).map((orderId) =>
              handlePaymentAction(
                orderId,
                action === "approve" ? "approved" : "rejected"
              )
            )
          );
          toast.success(
            `Successfully ${action}ed ${selectedOrders.size} orders`
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
      toast.error(`Failed to ${action} orders`);
    } finally {
      setIsBatchProcessing(false);
      setSelectedOrders(new Set());
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

  // Update the handleFileUpload function
  const handleFileUpload = async (url: string) => {
    try {
      setActionInProgress("uploading");

      // Get the selected order
      const selectedOrder = orders.find(
        (order) => order.id === selectedOrderId
      );
      if (!selectedOrder) {
        toast.error("Please select an order first");
        return;
      }

      // Show progress
      const toastId = toast.loading("Updating order with account file...");

      // Update the order with the file URL
      const { error } = await supabase
        .from("orders")
        .update({
          account_file_url: url,
          account_uploaded_at: new Date().toISOString(),
        })
        .eq("id", selectedOrder.id);

      if (error) {
        console.error("Error updating order:", error);
        toast.error("Failed to update order with file URL", { id: toastId });
        throw error;
      }

      // Get current user info for the message
      const { data: userData } = await supabase.auth.getUser();
      const userName = userData?.user?.user_metadata?.full_name || "Admin";
      const userAvatar =
        userData?.user?.user_metadata?.avatar_url ||
        "/images/support-avatar.png";

      // Create a message to notify the user
      const { error: messageError } = await supabase.from("messages").insert({
        order_id: selectedOrder.id,
        user_id: userData?.user?.id,
        content:
          "Your account file has been uploaded and is now available in your Purchased Accounts section.",
        is_admin: true,
        created_at: new Date().toISOString(),
        user_name: userName,
        user_avatar: userAvatar,
        image_url: url,
      });

      if (messageError) {
        console.error("Error creating message:", messageError);
        // Continue anyway since the file was uploaded
      }

      // Update local state
      setOrders((prev) =>
        prev.map((order) =>
          order.id === selectedOrder.id
            ? {
                ...order,
                account_file_url: url,
                account_uploaded_at: new Date().toISOString(),
              }
            : order
        )
      );

      // Show success message
      toast.success(
        "Account file uploaded and attached to order successfully!",
        {
          id: toastId,
        }
      );

      // Close any open modals
      setShowImageModal(false);
    } catch (err) {
      console.error("Error handling file upload:", err);
      toast.error("Failed to process file upload. Please try again.");
    } finally {
      setActionInProgress(null);
    }
  };

  // Add this function for direct upload to Supabase
  const uploadDirectToSupabase = async (file: File): Promise<string | null> => {
    try {
      // Generate a unique file name
      const fileName = `account_${Date.now()}-${file.name.replace(
        /[^a-zA-Z0-9.]/g,
        "_"
      )}`;

      // Show progress in the toast
      const toastId = toast.loading("Uploading account file...");

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

      toast.success("Account file uploaded successfully!", { id: toastId });
      return urlData.publicUrl;
    } catch (err) {
      console.error("Error in direct Supabase upload:", err);
      toast.error("Upload failed. Please try again.");
      return null;
    }
  };

  // Add this local upload function for testing
  const uploadLocally = async (file: File): Promise<string | null> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        // This is a data URL that can be used directly in img src
        resolve(reader.result as string);
      };
      reader.readAsDataURL(file);
    });
  };

  // Add this simple image upload component
  const SimpleImageUpload = ({
    onUpload,
  }: {
    onUpload: (url: string) => void;
  }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [preview, setPreview] = useState<string | null>(null);

    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(true);
    };

    const handleDragLeave = () => {
      setIsDragging(false);
    };

    const handleDrop = async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        await handleFile(files[0]);
      }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        await handleFile(file);
      }
    };

    const handleFile = async (file: File) => {
      // Check file type
      if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
        toast.error("Please upload an image or PDF file");
        return;
      }

      // Check file size
      if (file.size > 10 * 1024 * 1024) {
        toast.error("File too large. Maximum size is 10MB.");
        return;
      }

      // Show preview for images
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (e) => {
          setPreview(e.target?.result as string);
        };
        reader.readAsDataURL(file);
      }

      // Upload the file
      const toastId = toast.loading("Uploading file...");

      try {
        // Generate a unique file name
        const fileName = `${Date.now()}-${file.name.replace(
          /[^a-zA-Z0-9.]/g,
          "_"
        )}`;

        // Upload directly to Supabase storage
        const { data, error } = await supabase.storage
          .from("images")
          .upload(`uploads/${fileName}`, file, {
            cacheControl: "3600",
            upsert: true,
          });

        if (error) {
          throw error;
        }

        // Get the public URL
        const { data: urlData } = supabase.storage
          .from("images")
          .getPublicUrl(`uploads/${fileName}`);

        toast.success("File uploaded successfully!", { id: toastId });
        onUpload(urlData.publicUrl);
      } catch (err) {
        console.error("Upload error:", err);

        // Try fallback to local preview if direct upload fails
        try {
          toast.loading("Trying local preview as fallback...", { id: toastId });

          // Convert to base64
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
          });

          toast.success("Created local preview as fallback", { id: toastId });
          onUpload(base64);
        } catch (fallbackErr) {
          console.error("Fallback error:", fallbackErr);
          toast.error("All upload methods failed. Please try again.", {
            id: toastId,
          });
        }
      }
    };

    return (
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          isDragging
            ? "border-blue-400 bg-blue-50/10"
            : "border-gray-300/30 hover:border-gray-300/50"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {preview ? (
          <div className="relative mb-4">
            <img
              src={preview}
              alt="Preview"
              className="max-h-40 mx-auto rounded"
            />
            <button
              onClick={() => setPreview(null)}
              className="absolute top-0 right-0 bg-black/50 rounded-full p-1 text-white"
            >
              <XCircle size={16} />
            </button>
          </div>
        ) : (
          <Upload className="mx-auto h-12 w-12 text-gray-400/50" />
        )}

        <div className="mt-4">
          <input
            type="file"
            id="simple-file-upload"
            onChange={handleFileChange}
            accept="image/*,application/pdf"
            className="hidden"
          />

          <label
            htmlFor="simple-file-upload"
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors cursor-pointer inline-block"
          >
            Choose File
          </label>

          <p className="mt-2 text-sm text-gray-400">
            or drag and drop a file here
          </p>
        </div>
      </div>
    );
  };

  // Add this function to handle account details upload
  const handleAccountDetailsUpload = async () => {
    try {
      if (!selectedOrderId) {
        toast.error("Please select an order first");
        return;
      }

      setActionInProgress("uploading");
      const toastId = toast.loading("Uploading account details...");

      // Get the selected order
      const selectedOrder = orders.find(
        (order) => order.id === selectedOrderId
      );
      if (!selectedOrder) {
        toast.error("Order not found", { id: toastId });
        return;
      }

      // Create a JSON representation of the account details
      const accountData = {
        accountId: accountDetails.accountId,
        password: accountDetails.password,
        characterId: accountDetails.characterId || "",
        loginMethod: accountDetails.loginMethod || "Receive code from email",
      };

      // Convert to JSON string
      const jsonData = JSON.stringify(accountData, null, 2);

      // Create a Blob from the JSON string
      const blob = new Blob([jsonData], { type: "application/json" });

      // Create a File from the Blob
      const file = new File([blob], `account_${Date.now()}.json`, {
        type: "application/json",
      });

      // Upload the file
      const url = await uploadDirectToSupabase(file);

      if (!url) {
        throw new Error("Failed to upload account details");
      }

      // Update the order with the account details
      const { error } = await supabase
        .from("orders")
        .update({
          account_file_url: url,
          account_uploaded_at: new Date().toISOString(),
          account_metadata: accountData,
        })
        .eq("id", selectedOrder.id);

      if (error) {
        console.error("Error updating order:", error);
        toast.error("Failed to update order with account details", {
          id: toastId,
        });
        throw error;
      }

      // Get current user info for the message
      const { data: userData } = await supabase.auth.getUser();
      const userName = userData?.user?.user_metadata?.full_name || "Admin";
      const userAvatar =
        userData?.user?.user_metadata?.avatar_url ||
        "/images/support-avatar.png";

      // Create a message to notify the user
      const { error: messageError } = await supabase.from("messages").insert({
        order_id: selectedOrder.id,
        user_id: userData?.user?.id,
        content:
          "Your account details have been uploaded and are now available in your Purchased Accounts section.",
        is_admin: true,
        created_at: new Date().toISOString(),
        user_name: userName,
        user_avatar: userAvatar,
      });

      if (messageError) {
        console.error("Error creating message:", messageError);
        // Continue anyway since the details were uploaded
      }

      // Update local state
      setOrders((prev) =>
        prev.map((order) =>
          order.id === selectedOrder.id
            ? {
                ...order,
                account_file_url: url,
                account_uploaded_at: new Date().toISOString(),
                account_metadata: accountData,
              }
            : order
        )
      );

      // Show success message
      toast.success(
        "Account details uploaded and attached to order successfully!",
        {
          id: toastId,
        }
      );

      // Reset form
      setAccountDetails({
        accountId: "",
        password: "",
        characterId: "",
        loginMethod: "Receive code from email",
      });
    } catch (err) {
      console.error("Error handling account details upload:", err);
      toast.error("Failed to upload account details. Please try again.");
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
                <OrderCard
                  key={order.id}
                  order={order}
                  onImageView={handleImagePreview}
                  onPaymentAction={handlePaymentAction}
                  onFileUpload={handleFileUploadSuccess}
                  actionInProgress={actionInProgress}
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

              <div className="bg-gray-800 rounded-lg p-4 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-white">Account File</h4>
                  {selectedOrder?.account_file_url && (
                    <span className="px-2 py-1 text-xs bg-green-500/20 text-green-400 rounded-full">
                      Uploaded
                    </span>
                  )}
                </div>

                {selectedOrder?.account_file_url ? (
                  <div className="mb-4">
                    <div className="flex items-center mb-2">
                      <FileText className="text-blue-400 mr-2" size={20} />
                      <a
                        href={selectedOrder.account_file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        View account file
                      </a>
                    </div>

                    <div className="text-xs text-gray-400">
                      {selectedOrder.viewed_at ? (
                        <div className="flex items-center text-green-400">
                          <Eye size={14} className="mr-1" />
                          Viewed by customer on{" "}
                          {new Date(selectedOrder.viewed_at).toLocaleString()}
                        </div>
                      ) : (
                        <div className="flex items-center text-yellow-400">
                          <Eye size={14} className="mr-1" />
                          Not viewed by customer yet
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-400 text-sm mb-3">
                    No account file has been uploaded for this order yet.
                  </p>
                )}

                <button
                  onClick={async () => {
                    if (!selectedOrderId) {
                      toast.error("Please select an order first");
                      return;
                    }

                    const input = document.createElement("input");
                    input.type = "file";
                    input.accept = "image/*,application/pdf";

                    input.onchange = async (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (!file) return;

                      // Check file size
                      if (file.size > 10 * 1024 * 1024) {
                        toast.error("File too large. Maximum size is 10MB.");
                        return;
                      }

                      setActionInProgress("uploading");

                      try {
                        const url = await uploadDirectToSupabase(file);
                        if (url) {
                          handleFileUpload(url);
                        } else {
                          throw new Error("Upload failed");
                        }
                      } catch (err) {
                        console.error("Upload error:", err);
                        toast.error("Failed to upload file. Please try again.");
                        setActionInProgress(null);
                      }
                    };

                    input.click();
                  }}
                  className="w-full px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors flex items-center justify-center"
                  disabled={
                    actionInProgress === "uploading" || !selectedOrderId
                  }
                >
                  {actionInProgress === "uploading" ? (
                    <span className="flex items-center justify-center">
                      <RefreshCw className="animate-spin mr-2 h-4 w-4" />
                      Uploading...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center">
                      <Upload className="mr-2 h-4 w-4" />
                      {selectedOrder?.account_file_url
                        ? "Replace Account File"
                        : "Upload Account File"}
                    </span>
                  )}
                </button>
              </div>

              {/* Account status section */}
              <div className="bg-gray-800 rounded-lg p-4">
                <h4 className="font-medium text-white mb-3">Account Status</h4>

                <div className="grid grid-cols-2 gap-2 mb-3">
                  <button
                    onClick={async () => {
                      if (!selectedOrderId) return;

                      try {
                        setActionInProgress("updating");
                        const { error } = await supabase
                          .from("orders")
                          .update({ status: "completed" })
                          .eq("id", selectedOrderId);

                        if (error) throw error;

                        // Update local state
                        setOrders((prev) =>
                          prev.map((order) =>
                            order.id === selectedOrderId
                              ? { ...order, status: "completed" }
                              : order
                          )
                        );

                        toast.success("Order marked as completed");
                      } catch (err) {
                        console.error("Error updating status:", err);
                        toast.error("Failed to update status");
                      } finally {
                        setActionInProgress(null);
                      }
                    }}
                    className="px-3 py-2 bg-green-500/20 text-green-400 rounded-md hover:bg-green-500/30 transition-colors"
                    disabled={actionInProgress !== null || !selectedOrderId}
                  >
                    Mark as Completed
                  </button>

                  <button
                    onClick={async () => {
                      if (!selectedOrderId) return;

                      try {
                        setActionInProgress("updating");
                        const { error } = await supabase
                          .from("orders")
                          .update({ status: "pending" })
                          .eq("id", selectedOrderId);

                        if (error) throw error;

                        // Update local state
                        setOrders((prev) =>
                          prev.map((order) =>
                            order.id === selectedOrderId
                              ? { ...order, status: "pending" }
                              : order
                          )
                        );

                        toast.success("Order marked as pending");
                      } catch (err) {
                        console.error("Error updating status:", err);
                        toast.error("Failed to update status");
                      } finally {
                        setActionInProgress(null);
                      }
                    }}
                    className="px-3 py-2 bg-yellow-500/20 text-yellow-400 rounded-md hover:bg-yellow-500/30 transition-colors"
                    disabled={actionInProgress !== null || !selectedOrderId}
                  >
                    Mark as Pending
                  </button>
                </div>

                <div className="text-xs text-gray-400">
                  Current status:
                  <span
                    className={`ml-1 font-medium ${
                      selectedOrder?.status === "completed"
                        ? "text-green-400"
                        : selectedOrder?.status === "rejected"
                        ? "text-red-400"
                        : "text-yellow-400"
                    }`}
                  >
                    {selectedOrder?.status || "Unknown"}
                  </span>
                </div>
              </div>

              {/* Account Details section */}
              <div className="bg-gray-800 rounded-lg p-4 mb-4">
                <h4 className="font-medium text-white mb-3">Account Details</h4>

                <div className="space-y-4">
                  <div>
                    <label className="block text-gray-400 text-sm mb-1">
                      Account ID / Email
                    </label>
                    <input
                      type="text"
                      value={accountDetails.accountId}
                      onChange={(e) =>
                        setAccountDetails((prev) => ({
                          ...prev,
                          accountId: e.target.value,
                        }))
                      }
                      placeholder="e.g., user123@example.com"
                      className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-400 text-sm mb-1">
                      Password
                    </label>
                    <input
                      type="text"
                      value={accountDetails.password}
                      onChange={(e) =>
                        setAccountDetails((prev) => ({
                          ...prev,
                          password: e.target.value,
                        }))
                      }
                      placeholder="Enter password or leave blank to use login method"
                      className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-400 text-sm mb-1">
                      Login Method
                    </label>
                    <select
                      value={accountDetails.loginMethod}
                      onChange={(e) =>
                        setAccountDetails((prev) => ({
                          ...prev,
                          loginMethod: e.target.value,
                        }))
                      }
                      className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                    >
                      <option value="Receive code from email">
                        Receive code from email
                      </option>
                      <option value="Use password">Use password</option>
                      <option value="Google login">Google login</option>
                      <option value="Facebook login">Facebook login</option>
                      <option value="Apple login">Apple login</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-gray-400 text-sm mb-1">
                      Character ID (Optional)
                    </label>
                    <input
                      type="text"
                      value={accountDetails.characterId}
                      onChange={(e) =>
                        setAccountDetails((prev) => ({
                          ...prev,
                          characterId: e.target.value,
                        }))
                      }
                      placeholder="Optional character ID"
                      className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                    />
                  </div>

                  <button
                    onClick={handleAccountDetailsUpload}
                    className="w-full px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors flex items-center justify-center"
                    disabled={
                      actionInProgress === "uploading" ||
                      !selectedOrderId ||
                      !accountDetails.accountId
                    }
                  >
                    {actionInProgress === "uploading" ? (
                      <span className="flex items-center justify-center">
                        <RefreshCw className="animate-spin mr-2 h-4 w-4" />
                        Uploading...
                      </span>
                    ) : (
                      <span className="flex items-center justify-center">
                        <Upload className="mr-2 h-4 w-4" />
                        Upload Account Details
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

const OrderCard = React.memo(function OrderCard({
  order,
  onImageView,
  onPaymentAction,
  onFileUpload,
  actionInProgress,
  isSelected,
  onSelect,
}: {
  order: Order;
  onImageView: (url: string) => void;
  onPaymentAction: (orderId: string, status: "approved" | "rejected") => void;
  onFileUpload: (orderId: string, fileUrl: string) => void;
  actionInProgress: string | null;
  isSelected: boolean;
  onSelect: (selected: boolean) => void;
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
                    icon={
                      <CheckCircle className="text-emerald-400" size={20} />
                    }
                    onClick={() => onPaymentAction(order.id, "approved")}
                    disabled={!!actionInProgress}
                    title="Approve payment"
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
