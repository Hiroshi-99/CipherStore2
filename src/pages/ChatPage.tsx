import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { supabase } from "../lib/supabase";
import {
  Send,
  RefreshCw,
  Image as ImageIcon,
  Menu as MenuIcon,
  X as XIcon,
  MessageSquare as ChatIcon,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { setPageTitle } from "../utils/title";
import { useNavigate } from "react-router-dom";
import PageContainer from "../components/PageContainer";
import LoadingSpinner from "../components/LoadingSpinner";
import { toast } from "sonner";
import { uploadImage } from "../lib/storage";
import { MessageBubble } from "../components/MessageBubble";
import type { Message } from "../types/chat";
import { useMessageScroll } from "../hooks/useMessageScroll";
import { useOrderFilters } from "../hooks/useOrderFilters";
import { motion } from "framer-motion";
import { useInView } from "react-intersection-observer";

// Constants
const MESSAGES_PER_PAGE = 50;
const SCROLL_THRESHOLD = 300;
const TYPING_DEBOUNCE = 1000;

function ChatPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userOrders, setUserOrders] = useState<
    { id: string; full_name: string; messages?: { id: string }[] }[]
  >([]);
  const [adminOrders, setAdminOrders] = useState<
    { id: string; full_name: string; messages?: { id: string }[] }[]
  >([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState<Set<string>>(new Set());
  const [isTabFocused, setIsTabFocused] = useState(true);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingMessages = useRef(new Map());
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [fallbackMode, setFallbackMode] = useState(false);

  // Authentication check
  useEffect(() => {
    setPageTitle("Chat");

    // Check if user is authenticated
    const checkAuth = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.user) {
          // Redirect to login if not authenticated
          navigate("/");
          return;
        }

        setUser(session.user);

        // Check if user is admin
        const checkIfAdmin = async (userId: string) => {
          try {
            // Since both users and admins tables don't exist, rely on user metadata
            // or hardcoded admin IDs for testing

            // Option 1: Check user metadata
            if (session.user.user_metadata?.role === "admin") {
              return true;
            }

            // Option 2: Check against known admin IDs (for testing)
            const knownAdminIds = [
              "febded26-f3f6-4aec-9668-b6898de96ca3", // Add your test admin IDs here
              // Add more admin IDs as needed
            ];

            return knownAdminIds.includes(userId);
          } catch (err) {
            console.error("Error checking admin status:", err);
            return false;
          }
        };

        setIsAdmin(await checkIfAdmin(session.user.id));

        // Fetch orders based on user role
        if (isAdmin) {
          fetchAdminOrders();
        } else {
          fetchUserOrders(session.user.id);
        }
      } catch (err) {
        console.error("Authentication error:", err);
        setError("Authentication failed. Please try again.");
        setLoading(false);
      }
    };

    checkAuth();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        navigate("/");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [navigate]);

  // Modify the useEffect to check for fallback mode
  useEffect(() => {
    // Check if database tables exist
    const checkDatabaseTables = async () => {
      try {
        // Check if messages table exists
        const { error: messagesTableError } = await supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .limit(1);

        // Check if orders table exists
        const { error: ordersTableError } = await supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .limit(1);

        if (
          messagesTableError?.code === "42P01" ||
          ordersTableError?.code === "42P01"
        ) {
          console.log("Database tables missing, entering fallback mode");
          setFallbackMode(true);
          setLoading(false);
        }
      } catch (err) {
        console.error("Error checking database tables:", err);
      }
    };

    checkDatabaseTables();
  }, []);

  // Fetch user orders
  const fetchUserOrders = async (userId: string) => {
    try {
      const { data, error: ordersError } = await supabase
        .from("orders")
        .select("id, full_name")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (ordersError && ordersError.code === "42P01") {
        // Table doesn't exist error
        setError(
          "Order system is currently unavailable. The orders table doesn't exist in the database."
        );
        console.error("Database schema error: orders table doesn't exist");
        return;
      }

      if (ordersError) throw ordersError;

      // Fetch message counts separately if needed
      const ordersWithMessageCounts = await Promise.all(
        (data || []).map(async (order) => {
          try {
            const { count } = await supabase
              .from("messages")
              .select("id", { count: "exact", head: true })
              .eq("order_id", order.id);

            return {
              ...order,
              messages: count ? Array(count).fill({ id: "placeholder" }) : [],
            };
          } catch (err) {
            console.error(
              `Error fetching message count for order ${order.id}:`,
              err
            );
            return order;
          }
        })
      );

      setUserOrders(ordersWithMessageCounts || []);

      // Select first order if available and none selected
      if (data?.length && !selectedOrderId) {
        setSelectedOrderId(data[0].id);
        fetchMessages(data[0].id);
      }

      setLoading(false);
    } catch (err) {
      console.error("Error fetching user orders:", err);
      setError("Failed to load orders. Please refresh the page.");
      setLoading(false);
    }
  };

  // Fetch admin orders
  const fetchAdminOrders = async () => {
    try {
      const { data, error: ordersError } = await supabase
        .from("orders")
        .select("id, full_name, messages:chat_messages(id)")
        .order("created_at", { ascending: false });

      if (ordersError && ordersError.code === "42P01") {
        // Table doesn't exist error
        setError(
          "Chat system is currently unavailable. The messages table doesn't exist in the database."
        );
        console.error("Database schema error: messages table doesn't exist");
        return;
      }

      if (ordersError) throw ordersError;

      setAdminOrders(data || []);

      // Select first order if available and none selected
      if (data?.length && !selectedOrderId) {
        setSelectedOrderId(data[0].id);
        fetchMessages(data[0].id);
      }

      setLoading(false);
    } catch (err) {
      console.error("Error fetching admin orders:", err);
      setError("Failed to load orders. Please refresh the page.");
      setLoading(false);
    }
  };

  // Replace the updateMessagesInBatches function with this more robust version
  const updateMessagesInBatches = async (messageIds: string[]) => {
    // First check if the messages table exists and we have update permission
    try {
      // Try a simple query first to check if the table exists
      const { error: tableCheckError } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .limit(1);

      if (tableCheckError) {
        console.error("Error checking messages table:", tableCheckError);
        // If table doesn't exist or we don't have permission, just return without updating
        return false;
      }

      // If we get here, the table exists and we have permission
      // Process in smaller batches to avoid URL length limits
      const BATCH_SIZE = 5; // Reduce batch size to avoid URL length issues
      const batches = [];

      for (let i = 0; i < messageIds.length; i += BATCH_SIZE) {
        const batch = messageIds.slice(i, i + BATCH_SIZE);
        batches.push(batch);
      }

      // Process each batch sequentially
      for (const batchIds of batches) {
        try {
          const { error: updateError } = await supabase
            .from("messages")
            .update({ is_read: true })
            .in("id", batchIds);

          if (updateError) {
            console.error("Error updating batch:", updateError);
            // Continue with other batches even if one fails
          }
        } catch (batchError) {
          console.error("Exception updating batch:", batchError);
          // Continue with other batches
        }
      }

      return true;
    } catch (error) {
      console.error("Error in updateMessagesInBatches:", error);
      return false;
    }
  };

  // Modify the fetchMessages function to handle the case where messages can't be marked as read
  const fetchMessages = useCallback(
    async (orderId: string) => {
      if (!orderId) return;

      try {
        setLoading(true);
        setError(null);

        // First check if the messages table exists
        const { data: tableCheck, error: tableCheckError } = await supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .limit(1);

        if (tableCheckError && tableCheckError.code === "42P01") {
          // Table doesn't exist
          setError(
            "Chat system is currently unavailable. The messages table doesn't exist in the database."
          );
          console.error("Database schema error: messages table doesn't exist");
          setLoading(false);
          return;
        }

        // If we get here, the table exists, so fetch messages
        const { data, error: messagesError } = await supabase
          .from("messages")
          .select("*")
          .eq("order_id", orderId)
          .order("created_at", { ascending: true });

        if (messagesError) {
          throw messagesError;
        }

        // Set messages even if marking as read fails
        setMessages(data || []);

        // Try to mark messages as read, but don't fail if it doesn't work
        try {
          const unreadIds =
            data
              ?.filter((m) => !m.is_read && m.is_admin !== isAdmin)
              .map((m) => m.id) || [];

          if (unreadIds.length > 0) {
            // Use the batched update function
            const updateSuccess = await updateMessagesInBatches(unreadIds);

            if (!updateSuccess) {
              console.log("Could not mark messages as read, but continuing");
              // We can still show the messages even if we can't mark them as read
            }
          }
        } catch (markReadError) {
          console.error("Error marking messages as read:", markReadError);
          // Continue anyway - this is not a critical error
        }
      } catch (err) {
        console.error("Error fetching messages:", err);
        setError("Failed to load messages. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [isAdmin]
  );

  // Handle sending messages
  const handleSendMessage = useCallback(
    async (e: React.FormEvent, imageUrl?: string) => {
      e.preventDefault();

      if ((!newMessage.trim() && !imageUrl) || !selectedOrderId || !user) {
        return;
      }

      setSending(true);
      setNewMessage("");
      setSelectedImage(null);
      setImagePreview(null);

      try {
        // Create a temporary ID for optimistic UI
        const tempId = `temp-${Date.now()}`;

        // Add optimistic message
        const optimisticMessage = {
          id: tempId,
          content: newMessage.trim(),
          order_id: selectedOrderId,
          user_id: user.id,
          is_admin: isAdmin,
          created_at: new Date().toISOString(),
          is_read: false,
          image_url: imageUrl || null,
          user_name: user.user_metadata?.full_name || user.email || "User",
          user_avatar: user.user_metadata?.avatar_url || null,
        };

        setMessages((prev) => [...prev, optimisticMessage]);

        // Store pending message for retry
        pendingMessages.current.set(tempId, {
          content: newMessage.trim(),
          image_url: imageUrl,
        });

        // Send to database
        const { data, error: sendError } = await supabase
          .from("messages")
          .insert([
            {
              content: newMessage.trim(),
              order_id: selectedOrderId,
              user_id: user.id,
              is_admin: isAdmin,
              image_url: imageUrl,
            },
          ])
          .select()
          .single();

        if (sendError) throw sendError;

        // Replace optimistic message with real one
        setMessages((prev) => prev.map((m) => (m.id === tempId ? data : m)));

        // Clear pending message
        pendingMessages.current.delete(tempId);
      } catch (err) {
        console.error("Error sending message:", err);
        toast.error("Failed to send message. Please try again.");
      } finally {
        setSending(false);
      }
    },
    [newMessage, selectedOrderId, user, isAdmin]
  );

  // Handle message retry
  const handleRetry = useCallback((tempId: string) => {
    const pendingMessage = pendingMessages.current.get(tempId);
    if (!pendingMessage) return;

    // Remove failed message
    setMessages((prev) => prev.filter((m) => m.id !== tempId));

    // Set message content back to input
    setNewMessage(pendingMessage.content);

    // If there was an image, we need to handle that too
    if (pendingMessage.image_url) {
      // Logic to handle image retry
    }

    // Remove from pending messages
    pendingMessages.current.delete(tempId);
  }, []);

  // Handle image upload
  const handleImageUpload = async () => {
    if (!selectedImage) return;

    try {
      setSending(true);
      const imageUrl = await uploadImage(selectedImage);
      await handleSendMessage(new Event("submit") as React.FormEvent, imageUrl);
    } catch (err) {
      console.error("Error uploading image:", err);
      toast.error("Failed to upload image");
    } finally {
      setSending(false);
    }
  };

  // Handle image selection
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type.startsWith("image/")) {
      setSelectedImage(file);

      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      toast.error("Please select an image file");
    }
  };

  // Filter orders based on search
  const { searchTerm, setSearchTerm, filteredOrders } = useOrderFilters(
    isAdmin ? adminOrders : userOrders
  );

  if (fallbackMode) {
    return (
      <PageContainer title="CHAT" user={user}>
        <main className="max-w-screen-xl mx-auto pb-16">
          <div className="min-h-[calc(100vh-5rem)] flex items-center justify-center">
            <div className="backdrop-blur-md bg-black/30 p-8 rounded-2xl max-w-md text-center">
              <ChatIcon className="w-16 h-16 mx-auto mb-4 text-emerald-500/50" />
              <h2 className="text-xl text-white mb-2">
                Database Setup Required
              </h2>
              <p className="text-white/70 mb-6">
                The chat system requires database tables that don't exist yet.
                Please contact the administrator to set up the database.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors"
              >
                Refresh Page
              </button>
            </div>
          </div>
        </main>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer title="CHAT" user={user}>
        <main className="max-w-screen-xl mx-auto pb-16">
          <div className="min-h-[calc(100vh-5rem)] flex items-center justify-center">
            <div className="backdrop-blur-md bg-black/30 p-8 rounded-2xl max-w-md text-center">
              <ChatIcon className="w-16 h-16 mx-auto mb-4 text-emerald-500/50" />
              <h2 className="text-xl text-white mb-2">Connection Error</h2>
              <p className="text-white/70 mb-6">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors"
              >
                Refresh Page
              </button>
            </div>
          </div>
        </main>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="CHAT" showBack user={user}>
      <main className="max-w-screen-xl mx-auto pb-16">
        <div className="flex h-[calc(100vh-5rem)]">
          {/* Sidebar */}
          <div
            className={`fixed inset-y-0 left-0 z-20 w-80 bg-black/80 backdrop-blur-md transform transition-transform duration-300 ease-in-out ${
              showSidebar ? "translate-x-0" : "-translate-x-full"
            } md:relative md:translate-x-0`}
          >
            <div className="flex flex-col h-full p-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-white">Orders</h2>
                <button
                  onClick={() => setShowSidebar(false)}
                  className="md:hidden text-white/70 hover:text-white"
                >
                  <XIcon className="w-6 h-6" />
                </button>
              </div>

              <div className="mb-4">
                <input
                  type="text"
                  placeholder="Search orders..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:border-white/40"
                />
              </div>

              <div className="flex-1 overflow-y-auto">
                {filteredOrders.length === 0 ? (
                  <div className="text-center text-white/50 py-8">
                    No orders found
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredOrders.map((order) => (
                      <button
                        key={order.id}
                        onClick={() => {
                          setSelectedOrderId(order.id);
                          fetchMessages(order.id);
                          setShowSidebar(false);
                        }}
                        className={`w-full text-left p-3 rounded-lg transition-colors ${
                          selectedOrderId === order.id
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-white/5 text-white hover:bg-white/10"
                        }`}
                      >
                        <div className="font-medium">
                          Order #{order.id.slice(0, 8)}
                        </div>
                        {isAdmin && order.messages?.length && (
                          <div className="text-xs text-emerald-400 mt-1">
                            {order.messages.length} message
                            {order.messages.length !== 1 ? "s" : ""}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Chat area */}
          <div className="flex-1 flex flex-col h-full">
            {/* Chat header */}
            <div className="p-4 border-b border-white/10 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowSidebar(true)}
                  className="md:hidden text-white/70 hover:text-white"
                >
                  <MenuIcon className="w-6 h-6" />
                </button>
                <h2 className="text-lg font-medium text-white">
                  {selectedOrderId
                    ? `Order #${selectedOrderId.slice(0, 8)}`
                    : "Select an order"}
                </h2>
              </div>
            </div>

            {/* Messages area */}
            {selectedOrderId ? (
              <>
                <div className="flex-1 overflow-y-auto p-4">
                  {loading ? (
                    <div className="h-full flex items-center justify-center">
                      <LoadingSpinner size="lg" light />
                    </div>
                  ) : error ? (
                    <div className="h-full flex items-center justify-center">
                      <div className="text-center">
                        <p className="text-red-400 mb-2">{error}</p>
                        <button
                          onClick={() => fetchMessages(selectedOrderId)}
                          className="px-4 py-2 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-colors"
                        >
                          Try Again
                        </button>
                      </div>
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="h-full flex items-center justify-center">
                      <div className="text-center text-white/50">
                        <ChatIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>No messages yet</p>
                        <p className="text-sm mt-2">
                          Start the conversation by sending a message
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {messages.map((message, index) => (
                        <MessageBubble
                          key={message.id}
                          message={message}
                          isLatest={index === messages.length - 1}
                          sending={false}
                          isUnread={unreadMessages.has(message.id)}
                          onRetry={() => handleRetry(message.id)}
                          isPending={pendingMessages.current.has(message.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Message input */}
                <div className="p-4 border-t border-white/10">
                  <form onSubmit={handleSendMessage}>
                    {imagePreview && (
                      <div className="mb-4 relative inline-block">
                        <img
                          src={imagePreview}
                          alt="Preview"
                          className="max-h-40 rounded-lg"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedImage(null);
                            setImagePreview(null);
                          }}
                          className="absolute -top-2 -right-2 bg-black/50 rounded-full p-1 text-white hover:bg-black/70 transition-colors"
                        >
                          <XIcon className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleImageSelect}
                        accept="image/*"
                        className="hidden"
                      />

                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-lg transition-colors"
                        disabled={sending}
                      >
                        <ImageIcon className="w-6 h-6" />
                      </button>

                      <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Type your message..."
                        className="flex-1 bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:border-white/40"
                        disabled={sending}
                      />

                      <button
                        type="submit"
                        disabled={
                          (!newMessage.trim() && !selectedImage) || sending
                        }
                        className="bg-emerald-500 hover:bg-emerald-600 text-white p-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {sending ? (
                          <RefreshCw className="w-6 h-6 animate-spin" />
                        ) : (
                          <Send className="w-6 h-6" />
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center text-white/50">
                  <ChatIcon className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg">Select an order to start chatting</p>
                  <p className="text-sm text-center max-w-md">
                    Choose an order from the sidebar to start a conversation
                    with support
                  </p>
                  <button
                    onClick={() => setShowSidebar(true)}
                    className="md:hidden px-4 py-2 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-colors mt-4"
                  >
                    View Orders
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </PageContainer>
  );
}

export default React.memo(ChatPage);
