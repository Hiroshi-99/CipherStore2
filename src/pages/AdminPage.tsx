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

  // Filter and sort orders
  const filteredOrders = useMemo(() => {
    return orders
      .filter((order) => {
        const matchesSearch =
          order.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          order.email.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesDateRange =
          (!dateRange.start || new Date(order.created_at) >= dateRange.start) &&
          (!dateRange.end || new Date(order.created_at) <= dateRange.end);

        const matchesStatus =
          selectedStatuses.length === 0 ||
          selectedStatuses.includes(order.status);

        return matchesSearch && matchesDateRange && matchesStatus;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case "date":
            return sortOrder === "asc"
              ? new Date(a.created_at).getTime() -
                  new Date(b.created_at).getTime()
              : new Date(b.created_at).getTime() -
                  new Date(a.created_at).getTime();
          case "status":
            return sortOrder === "asc"
              ? a.status.localeCompare(b.status)
              : b.status.localeCompare(a.status);
          case "name":
            return sortOrder === "asc"
              ? a.full_name.localeCompare(b.full_name)
              : b.full_name.localeCompare(a.full_name);
          default:
            return 0;
        }
      });
  }, [orders, searchTerm, dateRange, selectedStatuses, sortBy, sortOrder]);

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
