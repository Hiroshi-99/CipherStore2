import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import Header from "../components/Header";
import { Send, RefreshCw } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { setPageTitle } from "../utils/title";

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
  const [orders, setOrders] = useState<{ id: string; full_name: string }[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  useEffect(() => {
    setPageTitle("Chat");
    checkUser();
    fetchOrders();
    const messagesSubscription = subscribeToMessages();
    return () => {
      messagesSubscription?.unsubscribe();
    };
  }, []);

  const checkUser = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.user) {
      setUser(session.user);
      // Check if user is admin
      const { data: adminData } = await supabase
        .from("admin_users")
        .select("*")
        .eq("user_id", session.user.id)
        .single();
      setIsAdmin(!!adminData);
    }
  };

  const fetchOrders = async () => {
    try {
      const { data: ordersData, error } = await supabase
        .from("orders")
        .select("id, full_name")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setOrders(ordersData || []);
      if (ordersData?.length > 0) {
        setSelectedOrderId(ordersData[0].id);
      }
    } catch (error) {
      console.error("Error fetching orders:", error);
    }
  };

  const fetchMessages = async (orderId: string) => {
    try {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setMessages(data || []);
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

  const subscribeToMessages = () => {
    return supabase
      .channel("messages")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setMessages((prev) => [...prev, payload.new as Message]);
            scrollToBottom();
          }
        }
      )
      .subscribe();
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newMessage.trim() || sending || !selectedOrderId) return;

    setSending(true);
    try {
      const { error: messageError } = await supabase.from("messages").insert([
        {
          content: newMessage.trim(),
          user_id: user.id,
          is_admin: isAdmin,
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
  };

  return (
    <div className="min-h-screen relative">
      {/* Background */}
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
      <div className="relative z-10">
        <Header title="CHAT" showBack user={user} />

        <main className="max-w-6xl mx-auto px-4 py-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Orders Sidebar */}
            <div className="md:col-span-1">
              <div className="backdrop-blur-md bg-black/30 rounded-2xl p-4">
                <h2 className="text-lg font-medium text-white mb-4">Orders</h2>
                <div className="space-y-2">
                  {orders.map((order) => (
                    <button
                      key={order.id}
                      onClick={() => setSelectedOrderId(order.id)}
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
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Chat Area */}
            <div className="md:col-span-3">
              <div className="backdrop-blur-md bg-black/30 rounded-2xl overflow-hidden">
                {/* Messages Container */}
                <div className="h-[600px] overflow-y-auto p-6 space-y-4">
                  {messages.map((message) => (
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
                          message.is_admin ? "bg-white/10" : "bg-emerald-500/20"
                        } rounded-lg p-3`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-white/90">
                            {message.user_name}
                          </span>
                          <span className="text-xs text-white/50">
                            {new Date(message.created_at).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-white/90">{message.content}</p>
                      </div>
                      {!message.is_admin && (
                        <img
                          src={message.user_avatar || "/default-avatar.png"}
                          alt="Avatar"
                          className="w-8 h-8 rounded-full"
                        />
                      )}
                    </div>
                  ))}
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
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default ChatPage;
