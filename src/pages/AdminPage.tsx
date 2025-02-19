import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import Header from "../components/Header";
import { CheckCircle, XCircle, Eye } from "lucide-react";
import { useNavigate } from "react-router-dom";
import FileUpload from "../components/FileUpload";
import { getAuthHeaders } from "../lib/auth";

interface Order {
  id: string;
  full_name: string;
  email: string;
  status: string;
  created_at: string;
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
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchOrders();
    checkAdminStatus();
  }, []);

  const fetchOrders = async () => {
    try {
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

  const handlePaymentAction = async (
    orderId: string,
    status: "approved" | "rejected",
    notes?: string
  ) => {
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
          body: JSON.stringify({ orderId, status, notes }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to update payment status");
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
              }
            : order
        )
      );
    } catch (error) {
      console.error("Error updating payment status:", error);
      setError("Failed to update payment status");
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
    } catch (error) {
      console.error("Error updating order and sending to inbox:", error);
      setError(
        error instanceof Error ? error.message : "Failed to process file upload"
      );
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
    <div className="min-h-screen bg-gray-900">
      <Header title="ADMIN" showBack user={null} />

      <main className="max-w-6xl mx-auto px-4 py-8">
        {error && (
          <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-2 rounded-lg mb-6">
            {error}
          </div>
        )}

        <div className="space-y-6">
          {orders.map((order) => (
            <div
              key={order.id}
              className="bg-black/30 backdrop-blur-md rounded-lg p-6"
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
                </div>
                <div className="flex items-center gap-4">
                  {order.payment_proofs?.map((proof) => (
                    <div key={proof.id} className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedImage(proof.image_url)}
                        className="p-2 hover:bg-white/10 rounded-full transition-colors"
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
                          >
                            <XCircle className="text-red-400" size={20} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {selectedOrderId === order.id && (
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
                        className="text-emerald-400 hover:underline"
                      >
                        View File
                      </a>
                    </div>
                  )}
                </div>
              )}

              {!selectedOrderId && (
                <button
                  onClick={() => handleOrderSelect(order.id)}
                  className="mt-4 text-emerald-400 hover:underline"
                >
                  Upload Account File
                </button>
              )}
            </div>
          ))}
        </div>
      </main>

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
