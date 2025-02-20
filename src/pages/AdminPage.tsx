import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import Header from "../components/Header";
import {
  CheckCircle,
  XCircle,
  Eye,
  FileText,
  RefreshCw,
  Search,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import FileUpload from "../components/FileUpload";
import { getAuthHeaders } from "../lib/auth";
import { setPageTitle } from "../utils/title";

interface Order {
  id: string;
  full_name: string;
  email: string;
  status: string;
  created_at: string;
  account_file_url?: string;
  payment_proofs: {
    id: string;
    image_url: string;
    status: string;
  }[];
}

interface Admin {
  id: string;
  user_id: string;
  created_at: string;
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
  const navigate = useNavigate();

  useEffect(() => {
    setPageTitle("Admin");
    fetchOrders();
    checkAdminStatus();
  }, []);

  const fetchOrders = async () => {
    try {
      setError(null);
      const { data: ordersData, error: ordersError } = await supabase
        .from("orders")
        .select("*, payment_proofs(id, image_url, status)")
        .order("created_at", { ascending: false });

      if (ordersError) throw ordersError;
      setOrders(ordersData || []);
    } catch (error) {
      console.error("Error fetching orders:", error);
      setError("Failed to load orders");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

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

  const handlePaymentAction = async (
    orderId: string,
    status: "approved" | "rejected",
    notes?: string
  ) => {
    if (actionInProgress) return;

    setActionInProgress(orderId);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(
        "/.netlify/functions/discord-update-payment",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: headers.Authorization,
          },
          body: JSON.stringify({
            orderId,
            status,
            notes: notes || `Payment ${status} by admin`,
          }),
        }
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          data.details || data.error || "Failed to update payment status"
        );
      }

      // Update local state
      setOrders((prevOrders) =>
        prevOrders.map((order) =>
          order.id === orderId
            ? {
                ...order,
                payment_proofs: order.payment_proofs.map((proof) => ({
                  ...proof,
                  status,
                })),
                status: status === "approved" ? "active" : "rejected",
              }
            : order
        )
      );

      // Show success message
      alert(`Payment ${status} successfully!`);
    } catch (error) {
      console.error("Error updating payment status:", error);
      setError(
        error instanceof Error
          ? error.message
          : "Failed to update payment status"
      );
    } finally {
      setActionInProgress(null);
    }
  };

  const handleOrderSelect = (orderId: string) => {
    setSelectedOrderId(orderId);
    setUploadedFileUrl(null);
    setError(null);
  };

  const handleFileUploadSuccess = async (fileUrl: string) => {
    setUploadedFileUrl(fileUrl);
    if (!selectedOrderId) return;

    try {
      const headers = await getAuthHeaders();
      const response = await fetch("/.netlify/functions/admin-upload-file", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: headers.Authorization,
        },
        body: JSON.stringify({
          orderId: selectedOrderId,
          fileUrl: fileUrl,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to process file upload");
      }

      // Update local state
      setOrders((prevOrders) =>
        prevOrders.map((order) =>
          order.id === selectedOrderId
            ? { ...order, account_file_url: fileUrl }
            : order
        )
      );

      alert("File uploaded and sent to user's inbox successfully!");
      setSelectedOrderId(null);
    } catch (error) {
      console.error("Error updating order and sending to inbox:", error);
      setError(
        error instanceof Error ? error.message : "Failed to process file upload"
      );
    }
  };

  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      order.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.id.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFilter =
      filter === "all" ||
      (filter === "pending" &&
        order.payment_proofs?.[0]?.status === "pending") ||
      (filter === "approved" &&
        order.payment_proofs?.[0]?.status === "approved") ||
      (filter === "rejected" &&
        order.payment_proofs?.[0]?.status === "rejected");

    return matchesSearch && matchesFilter;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative">
      {/* Background Image */}
      <div
        className="absolute inset-0 z-0"
        style={{
          backgroundImage:
            'url("https://cdn.discordapp.com/attachments/1335202613913849857/1341847795807813815/wallpaperflare.com_wallpaper.jpg?ex=67b77ca4&is=67b62b24&hm=17f869720e0d7d178e5a1d6140243b37f248c32e837142aded205cd3c4453de1&")',
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "brightness(0.7)",
        }}
      />

      {/* Content */}
      <div className="relative z-10 min-h-screen">
        <Header title="ADMIN" showBack user={null} />

        <main className="max-w-6xl mx-auto px-4 py-8">
          {error && (
            <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-2 rounded-lg mb-6">
              {error}
            </div>
          )}

          <div className="backdrop-blur-md bg-black/30 p-6 rounded-2xl">
            {/* Controls */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="Search orders..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 pr-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-white/40"
                  />
                </div>
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as any)}
                  className="px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-white/40"
                >
                  <option value="all">All Orders</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-5 h-5 ${refreshing ? "animate-spin" : ""}`}
                />
                Refresh
              </button>
            </div>

            {/* Orders List */}
            <div className="space-y-6">
              {filteredOrders.length === 0 ? (
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
                  <div
                    key={order.id}
                    className="bg-white/5 hover:bg-white/10 rounded-lg p-6 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-white">
                          {order.full_name}
                        </h3>
                        <p className="text-white/70">{order.email}</p>
                        <p className="text-sm text-white/50">
                          {new Date(order.created_at).toLocaleString()}
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <span
                            className={`px-2 py-1 rounded text-xs ${
                              order.status === "active"
                                ? "bg-emerald-400/20 text-emerald-400"
                                : order.status === "rejected"
                                ? "bg-red-400/20 text-red-400"
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
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {order.payment_proofs?.map((proof) => (
                          <div
                            key={proof.id}
                            className="flex items-center gap-2"
                          >
                            <button
                              onClick={() => setSelectedImage(proof.image_url)}
                              className="p-2 hover:bg-white/10 rounded-full transition-colors"
                              title="View payment proof"
                            >
                              <Eye className="text-white" size={20} />
                            </button>
                            {proof.status === "pending" && (
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() =>
                                    handlePaymentAction(order.id, "approved")
                                  }
                                  disabled={!!actionInProgress}
                                  className="p-2 hover:bg-white/10 rounded-full transition-colors disabled:opacity-50"
                                  title="Approve payment"
                                >
                                  <CheckCircle
                                    className="text-emerald-400"
                                    size={20}
                                  />
                                </button>
                                <button
                                  onClick={() =>
                                    handlePaymentAction(order.id, "rejected")
                                  }
                                  disabled={!!actionInProgress}
                                  className="p-2 hover:bg-white/10 rounded-full transition-colors disabled:opacity-50"
                                  title="Reject payment"
                                >
                                  <XCircle className="text-red-400" size={20} />
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {selectedOrderId === order.id ? (
                      <div className="mt-4 border-t border-white/10 pt-4">
                        <h3 className="text-lg font-medium text-white mb-4">
                          Upload Account File
                        </h3>
                        <FileUpload
                          orderId={selectedOrderId}
                          onUploadSuccess={handleFileUploadSuccess}
                        />
                        {uploadedFileUrl && (
                          <div className="mt-4 text-white">
                            <p>File uploaded successfully:</p>
                            <a
                              href={uploadedFileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-emerald-400 hover:underline flex items-center gap-2"
                            >
                              <FileText size={16} />
                              View File
                            </a>
                          </div>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => handleOrderSelect(order.id)}
                        className="mt-4 text-emerald-400 hover:underline flex items-center gap-2"
                      >
                        <FileText size={16} />
                        Upload Account File
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Image Preview Modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="relative max-w-4xl w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={selectedImage}
              alt="Payment Proof"
              className="w-full rounded-lg"
            />
            <button
              className="absolute -top-4 -right-4 bg-white/10 hover:bg-white/20 rounded-full p-2 text-white transition-colors"
              onClick={() => setSelectedImage(null)}
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminPage;
