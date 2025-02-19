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
  const navigate = useNavigate();
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(null);

  useEffect(() => {
    const checkAuthAndFetch = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.user) {
          navigate("/");
          return;
        }

        await fetchOrders();
        await checkOwner();
        if (isOwner) {
          await fetchAdmins();
        }
      } catch (error) {
        console.error("Error initializing admin page:", error);
      }
    };

    checkAuthAndFetch();
  }, [navigate]);

  const fetchOrders = async () => {
    try {
      const { data, error } = await supabase
        .from("orders")
        .select(
          `
          *,
          payment_proofs (
            id,
            image_url,
            status
          )
        `
        )
        .order("created_at", { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error("Error fetching orders:", error);
    } finally {
      setLoading(false);
    }
  };

  const checkOwner = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setIsOwner(user?.user_metadata?.sub === import.meta.env.VITE_OWNER_ID);
  };

  const fetchAdmins = async () => {
    const { data } = await supabase
      .from("admin_users")
      .select("*")
      .order("created_at", { ascending: false });

    setAdmins(data || []);
  };

  const removeAdmin = async (adminId: string) => {
    const confirmed = window.confirm(
      "Are you sure you want to remove this admin?"
    );
    if (!confirmed) return;

    const { error } = await supabase
      .from("admin_users")
      .delete()
      .eq("id", adminId);

    if (error) {
      console.error("Error removing admin:", error);
      alert("Error removing admin. Please try again.");
      return;
    }

    fetchAdmins();
  };

  const handleOrderAction = async (
    orderId: string,
    action: "approve" | "reject"
  ) => {
    try {
      setActionInProgress(orderId);

      const { error: orderError } = await supabase
        .from("orders")
        .update({
          status: action === "approve" ? "approved" : "rejected",
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId);

      if (orderError) {
        console.error("Failed to update order status:", orderError);
        throw new Error(`Failed to update order status: ${orderError.message}`);
      }

      const { data: order, error: orderFetchError } = await supabase
        .from("orders")
        .select("user_id, payment_proofs (id)")
        .eq("id", orderId)
        .single();

      if (orderFetchError) {
        console.error("Failed to fetch order details:", orderFetchError);
        throw new Error(
          `Failed to fetch order details: ${orderFetchError.message}`
        );
      }

      if (!order) {
        throw new Error("Order not found after status update");
      }

      if (order.payment_proofs?.[0]?.id) {
        const { error: proofError } = await supabase
          .from("payment_proofs")
          .update({
            status: action === "approve" ? "approved" : "rejected",
            updated_at: new Date().toISOString(),
          })
          .eq("id", order.payment_proofs[0].id);

        if (proofError) {
          console.error("Failed to update payment proof:", proofError);
          throw new Error(
            `Failed to update payment proof: ${proofError.message}`
          );
        }
      }

      const { error: notificationError } = await supabase
        .from("inbox_messages")
        .insert([
          {
            user_id: order.user_id,
            title: action === "approve" ? "Order Approved" : "Order Rejected",
            content:
              action === "approve"
                ? "Your payment has been verified and your order has been approved. Your account will be activated shortly."
                : "Your payment proof has been rejected. Please submit a new payment proof or contact support for assistance.",
            type: "payment_status",
          },
        ]);

      if (notificationError) {
        console.error("Failed to send notification:", notificationError);
      }

      try {
        const { data: channel, error: channelError } = await supabase
          .from("discord_channels")
          .select("thread_id, webhook_url")
          .eq("order_id", orderId)
          .single();

        if (channelError) {
          console.error("Failed to fetch Discord channel:", channelError);
          return;
        }

        if (channel?.webhook_url) {
          const response = await fetch("/.netlify/functions/discord-webhook", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              webhookUrl: channel.webhook_url,
              message: {
                content: `Order ${orderId} has been ${action}ed`,
                embeds: [
                  {
                    title: `Order ${
                      action === "approve" ? "Approved" : "Rejected"
                    }`,
                    description: `Order ID: ${orderId}`,
                    color: action === "approve" ? 0x00ff00 : 0xff0000,
                    timestamp: new Date().toISOString(),
                  },
                ],
              },
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error("Discord webhook error:", errorText);
          }
        }
      } catch (webhookError) {
        console.error("Failed to send Discord notification:", webhookError);
      }

      await fetchOrders();
      alert(`Order successfully ${action}ed!`);
    } catch (error) {
      console.error(`Error ${action}ing order:`, error);
      alert(
        error instanceof Error
          ? error.message
          : `Failed to ${action} order. Please try again.`
      );
    } finally {
      setActionInProgress(null);
    }
  };

  const handleOrderSelect = (orderId: string) => {
    setSelectedOrderId(orderId);
    setUploadedFileUrl(null);
  };

  const handleFileUploadSuccess = async (fileUrl: string) => {
    setUploadedFileUrl(fileUrl);
    if (selectedOrderId) {
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

        alert("File uploaded and sent to user's inbox successfully!");
      } catch (error) {
        console.error("Error updating order and sending to inbox:", error);
        alert(
          `There was an error uploading the file and sending it to the inbox: ${
            error instanceof Error ? error.message : "Unknown error occurred"
          }`
        );
      }
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
        <div className="space-y-6">
          {orders.map((order) => (
            <div
              key={order.id}
              className="bg-black/30 backdrop-blur-md rounded-lg p-6"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white mb-2">
                    Order #{order.id.slice(0, 8)}
                  </h3>
                  <div className="space-y-1 text-white/70">
                    <p>Customer: {order.full_name}</p>
                    <p>Email: {order.email}</p>
                    <p>
                      Status:{" "}
                      <span
                        className={`${
                          order.status === "approved"
                            ? "text-emerald-400"
                            : order.status === "rejected"
                            ? "text-red-400"
                            : "text-yellow-400"
                        }`}
                      >
                        {order.status.toUpperCase()}
                      </span>
                    </p>
                    <p>Date: {new Date(order.created_at).toLocaleString()}</p>
                  </div>
                </div>

                {order.status === "pending" && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleOrderAction(order.id, "approve")}
                      className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 p-2 rounded-lg transition-colors disabled:opacity-50"
                      disabled={actionInProgress === order.id}
                    >
                      {actionInProgress === order.id ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-emerald-400" />
                      ) : (
                        <CheckCircle size={20} />
                      )}
                    </button>
                    <button
                      onClick={() => handleOrderAction(order.id, "reject")}
                      className="bg-red-500/20 hover:bg-red-500/30 text-red-400 p-2 rounded-lg transition-colors disabled:opacity-50"
                      disabled={actionInProgress === order.id}
                    >
                      {actionInProgress === order.id ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-red-400" />
                      ) : (
                        <XCircle size={20} />
                      )}
                    </button>
                  </div>
                )}
              </div>

              {order.payment_proofs?.[0] && (
                <div className="mt-4">
                  <div className="relative group inline-block">
                    <img
                      src={order.payment_proofs[0].image_url}
                      alt="Payment Proof"
                      className="h-32 rounded-lg cursor-pointer hover:opacity-75 transition-opacity"
                      onClick={() =>
                        setSelectedImage(order.payment_proofs[0].image_url)
                      }
                    />
                    <button
                      className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg"
                      onClick={() =>
                        setSelectedImage(order.payment_proofs[0].image_url)
                      }
                    >
                      <Eye className="w-6 h-6 text-white" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Admin Management Section (only visible to owner) */}
        {isOwner && (
          <div className="mt-12">
            <h2 className="text-2xl font-bold text-white mb-6">
              Admin Management
            </h2>
            <div className="space-y-4">
              {admins.map((admin) => (
                <div
                  key={admin.id}
                  className="bg-black/30 backdrop-blur-md rounded-lg p-4 flex items-center justify-between"
                >
                  <div className="text-white">
                    <p>Admin ID: {admin.user_id}</p>
                    <p className="text-sm text-white/70">
                      Added: {new Date(admin.created_at).toLocaleString()}
                    </p>
                  </div>
                  <button
                    onClick={() => removeAdmin(admin.id)}
                    className="bg-red-500/20 hover:bg-red-500/30 text-red-400 p-2 rounded-lg transition-colors"
                  >
                    <XCircle size={20} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-12">
          <h2 className="text-2xl font-bold text-white mb-6">
            Admin Dashboard
          </h2>
          <div className="space-y-6">
            <div className="overflow-x-auto">
              <table className="w-full text-white">
                <thead>
                  <tr>
                    <th className="text-left py-2">Order ID</th>
                    <th className="text-left py-2">Customer Name</th>
                    <th className="text-left py-2">Email</th>
                    <th className="text-left py-2">Status</th>
                    <th className="text-left py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id} className="border-t border-white/20">
                      <td className="py-2">{order.id}</td>
                      <td className="py-2">{order.full_name}</td>
                      <td className="py-2">{order.email}</td>
                      <td className="py-2">{order.status}</td>
                      <td className="py-2">
                        <button
                          onClick={() => handleOrderSelect(order.id)}
                          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-md transition-colors"
                        >
                          Select
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selectedOrderId && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-white">
                  Selected Order: {selectedOrderId}
                </h3>
                <FileUpload
                  orderId={selectedOrderId}
                  onUploadSuccess={handleFileUploadSuccess}
                />
                {uploadedFileUrl && (
                  <div className="text-white">
                    <p>File uploaded successfully:</p>
                    <a
                      href={uploadedFileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-400 hover:underline"
                    >
                      {uploadedFileUrl}
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Image Modal */}
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
