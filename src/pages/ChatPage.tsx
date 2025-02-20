import React, { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";
import Header from "../components/Header";
import { Send, RefreshCw } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { setPageTitle } from "../utils/title";
import PageContainer from "../components/PageContainer";
import LoadingSpinner from "../components/LoadingSpinner";

interface Message {
  id: string;
  content: string;
  user_name: string;
  user_avatar: string;
  is_admin: boolean;
  created_at: string;
  order_id: string;
}

interface ChatProps {
  orderId: string;
}

function ChatPage() {
  const [user, setUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userOrders, setUserOrders] = useState<
    { id: string; full_name: string }[]
  >([]);
  const [adminOrders, setAdminOrders] = useState<
    { id: string; full_name: string }[]
  >([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [showSidebar, setShowSidebar] = useState(false);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const subscribeToMessages = useCallback(() => {
    if (!selectedOrderId) return undefined;

    const channel = supabase
      .channel(`messages:${selectedOrderId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `order_id=eq.${selectedOrderId}`,
        },
        async (payload) => {
          if (payload.eventType === "INSERT") {
            const { data: orderData } = await supabase
              .from("orders")
              .select("user_id")
              .eq("id", selectedOrderId)
              .single();

            if (orderData) {
              const newMessage = payload.new as Message;
              setMessages((prev) => [
                ...prev,
                {
                  ...newMessage,
                  is_admin: newMessage.user_id !== orderData.user_id,
                },
              ]);
              scrollToBottom();
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedOrderId, scrollToBottom]);

  const handleSendMessage = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!user || !newMessage.trim() || sending || !selectedOrderId) return;

      setSending(true);
      try {
        // Get order details first
        const { data: orderData, error: orderError } = await supabase
          .from("orders")
          .select("user_id")
          .eq("id", selectedOrderId)
          .single();

        if (orderError) throw orderError;

        const { error: messageError } = await supabase.from("messages").insert([
          {
            content: newMessage.trim(),
            user_id: user.id,
            is_admin: user.id !== orderData.user_id,
            user_name: user.user_metadata.full_name || user.email,
            user_avatar: user.user_metadata.avatar_url,
            order_id: selectedOrderId,
          },
        ]);

        if (messageError) throw messageError;
        setNewMessage("");
      } catch (error) {
        console.error("Error sending message:", error);
        setError("Failed to send message");
      } finally {
        setSending(false);
      }
    },
    [user, newMessage, sending, selectedOrderId]
  );

  useEffect(() => {
    setPageTitle("Chat");
    checkUser();
  }, []);

  useEffect(() => {
    const cleanup = subscribeToMessages();
    return () => {
      if (cleanup && typeof cleanup === "function") {
        cleanup();
      }
    };
  }, [subscribeToMessages]);

  const checkUser = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        setInitialLoading(false);
        return;
      }

      setUser(session.user);

      // Fix admin check query
      const { data: adminData, error: adminError } = await supabase
        .from("admin_users")
        .select("*")
        .eq("user_id", session.user.id)
        .maybeSingle(); // Use maybeSingle instead of single to avoid errors

      if (adminError) {
        console.error("Error checking admin status:", adminError);
      }

      setIsAdmin(!!adminData);

      // Fetch orders based on user role
      if (adminData) {
        await fetchAdminOrders();
      } else {
        await fetchUserOrders(session.user.id);
      }

      setInitialLoading(false);
    } catch (error) {
      console.error("Error checking user:", error);
      setInitialLoading(false);
    }
  };

  const fetchUserOrders = async (userId: string) => {
    try {
      const { data: ordersData, error } = await supabase
        .from("orders")
        .select("id, full_name")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setUserOrders(ordersData || []);
      if (ordersData?.length > 0) {
        setSelectedOrderId(ordersData[0].id);
      }
    } catch (error) {
      console.error("Error fetching user orders:", error);
      setError("Failed to load orders");
    }
  };

  const fetchAdminOrders = async () => {
    try {
      const { data: ordersData, error } = await supabase
        .from("orders")
        .select(
          `
          id,
          full_name,
          messages (
            id,
            created_at
          )
        `
        )
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAdminOrders(ordersData || []);
      if (ordersData?.length > 0) {
        setSelectedOrderId(ordersData[0].id);
      }
    } catch (error) {
      console.error("Error fetching admin orders:", error);
      setError("Failed to load orders");
    }
  };

  const fetchMessages = async (orderId: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("messages")
        .select("*, orders(user_id)")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      // Compare message sender with order owner to determine admin status
      setMessages(
        data?.map((msg) => ({
          ...msg,
          is_admin: msg.user_id !== msg.orders.user_id,
          orders: undefined, // Remove orders data from message object
        })) || []
      );
      setTimeout(scrollToBottom, 100);
    } catch (error) {
      console.error("Error fetching messages:", error);
      setError("Failed to load messages");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedOrderId) {
      fetchMessages(selectedOrderId);
    }
  }, [selectedOrderId]);

  if (initialLoading) {
    return (
      <PageContainer title="CHAT" user={null}>
        <div className="h-screen flex items-center justify-center">
          <LoadingSpinner size="lg" light />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="CHAT" showBack user={user}>
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 relative">
          {/* Mobile Order Toggle */}
          <button
            className="md:hidden fixed bottom-4 right-4 z-20 bg-emerald-500 p-3 rounded-full shadow-lg"
            onClick={() => setShowSidebar(!showSidebar)}
          >
            <svg
              className="w-6 h-6 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16m-7 6h7"
              />
            </svg>
          </button>

          {/* Orders Sidebar */}
          <div
            className={`md:col-span-1 fixed md:relative inset-0 z-10 md:z-0 transform ${
              showSidebar ? "translate-x-0" : "-translate-x-full"
            } md:translate-x-0 transition-transform duration-200 ease-in-out`}
          >
            <div className="backdrop-blur-md bg-black/90 md:bg-black/30 h-full md:h-auto rounded-2xl p-4">
              {/* Mobile Close Button */}
              <div className="flex justify-between items-center mb-4 md:hidden">
                <h2 className="text-lg font-medium text-white">
                  {isAdmin ? "All Orders" : "Your Orders"}
                </h2>
                <button
                  onClick={() => setShowSidebar(false)}
                  className="p-2 hover:bg-white/10 rounded-lg"
                >
                  <svg
                    className="w-6 h-6 text-white"
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

              {/* Orders List */}
              <div className="space-y-2 max-h-[calc(100vh-8rem)] overflow-y-auto">
                {(isAdmin ? adminOrders : userOrders).map((order) => (
                  <button
                    key={order.id}
                    onClick={() => {
                      setSelectedOrderId(order.id);
                      setShowSidebar(false);
                    }}
                    className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                      selectedOrderId === order.id
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "text-white/70 hover:bg-white/10"
                    }`}
                  >
                    <div className="font-medium">{order.full_name}</div>
                    <div className="text-sm text-white/50">
                      Order #{order.id.slice(0, 8)}
                    </div>
                    {isAdmin && order.messages?.length > 0 && (
                      <div className="text-xs text-emerald-400 mt-1">
                        {order.messages.length} messages
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Chat Area */}
          <div className="md:col-span-3">
            <div className="backdrop-blur-md bg-black/30 rounded-2xl overflow-hidden">
              {selectedOrderId ? (
                <>
                  {/* Messages Container */}
                  <div className="h-[calc(100vh-16rem)] md:h-[600px] overflow-y-auto p-4 md:p-6 space-y-4">
                    {loading ? (
                      <div className="flex items-center justify-center h-full">
                        <LoadingSpinner size="lg" light />
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="flex items-center justify-center h-full text-white/50">
                        No messages yet. Start the conversation!
                      </div>
                    ) : (
                      messages.map((message) => (
                        <div
                          key={message.id}
                          className={`flex items-start gap-3 ${
                            message.is_admin ? "justify-start" : "justify-end"
                          }`}
                        >
                          {message.is_admin && (
                            <img
                              src={message.user_avatar || "/default-avatar.png"}
                              alt="Avatar"
                              className="w-8 h-8 rounded-full"
                            />
                          )}
                          <div
                            className={`max-w-[70%] ${
                              message.is_admin
                                ? "bg-white/10"
                                : "bg-emerald-500/20"
                            } rounded-lg p-3`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium text-white/90">
                                {message.user_name}
                              </span>
                              <span className="text-xs text-white/50">
                                {new Date(message.created_at).toLocaleString()}
                              </span>
                            </div>
                            <p className="text-white/90 whitespace-pre-wrap break-words">
                              {message.content}
                            </p>
                          </div>
                          {!message.is_admin && (
                            <img
                              src={message.user_avatar || "/default-avatar.png"}
                              alt="Avatar"
                              className="w-8 h-8 rounded-full"
                            />
                          )}
                        </div>
                      ))
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Message Input */}
                  <form
                    onSubmit={handleSendMessage}
                    className="border-t border-white/10 p-4"
                  >
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Type your message..."
                        className="flex-1 bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:border-white/40"
                      />
                      <button
                        type="submit"
                        disabled={!newMessage.trim() || sending}
                        className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {sending ? (
                          <RefreshCw className="w-5 h-5 animate-spin" />
                        ) : (
                          <Send className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <div className="h-[calc(100vh-16rem)] md:h-[600px] flex items-center justify-center text-white/50">
                  Select an order to start chatting
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </PageContainer>
  );
}

export default React.memo(ChatPage);
