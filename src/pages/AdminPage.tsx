import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import Header from "../components/Header";
import { CheckCircle, XCircle, Eye } from "lucide-react";
import type { User } from "@supabase/supabase-js";

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
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    fetchOrders();
    checkOwner();
    if (isOwner) {
      fetchAdmins();
    }
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
    });
  }, [isOwner]);

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
      setLoading(true);

      // Update order status
      const { error: orderError } = await supabase
        .from("orders")
        .update({
          status: action === "approve" ? "approved" : "rejected",
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId);

      if (orderError) throw orderError;

      // Get order details for notifications
      const { data: order, error: orderFetchError } = await supabase
        .from("orders")
        .select("user_id, payment_proofs (id)")
        .eq("id", orderId)
        .single();

      if (orderFetchError) throw orderFetchError;

      // Update payment proof status
      if (order?.payment_proofs?.[0]?.id) {
        const { error: proofError } = await supabase
          .from("payment_proofs")
          .update({
            status: action === "approve" ? "approved" : "rejected",
            updated_at: new Date().toISOString(),
          })
          .eq("id", order.payment_proofs[0].id);

        if (proofError) throw proofError;
      }

      // Create inbox message for user
      if (order?.user_id) {
        const { error: inboxError } = await supabase
          .from("inbox_messages")
          .insert([
            {
              user_id: order.user_id,
              title: action === "approve" ? "Order Approved" : "Order Rejected",
              content:
                action === "approve"
                  ? "Your payment has been verified and your order has been approved."
                  : "Your payment proof has been rejected. Please submit a new payment proof.",
              type: "payment_status",
            },
          ]);

        if (inboxError) throw inboxError;
      }

      // Refresh orders list
      await fetchOrders();
      alert(`Order ${action}ed successfully`);
    } catch (error) {
      console.error(`Error ${action}ing order:`, error);
      alert(`Error ${action}ing order. Please try again.`);
    } finally {
      setLoading(false);
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
      <Header title="ADMIN" showBack user={user} />

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
                      disabled={loading}
                    >
                      {loading ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-emerald-400" />
                      ) : (
                        <CheckCircle size={20} />
                      )}
                    </button>
                    <button
                      onClick={() => handleOrderAction(order.id, "reject")}
                      className="bg-red-500/20 hover:bg-red-500/30 text-red-400 p-2 rounded-lg transition-colors disabled:opacity-50"
                      disabled={loading}
                    >
                      {loading ? (
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
