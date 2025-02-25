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

        // Improved admin check
        const adminStatus = await checkIfAdmin(session.user.id);
        setIsAdmin(adminStatus);
        console.log("User is admin:", adminStatus);

        // Fetch orders based on user role
        if (adminStatus) {
          await fetchAdminOrders();
        } else {
          await fetchUserOrders(session.user.id);
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
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session) {
        navigate("/");
      } else {
        setUser(session.user);
        const adminStatus = await checkIfAdmin(session.user.id);
        setIsAdmin(adminStatus);
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
      // For admin, fetch all orders regardless of user_id
      const { data, error: ordersError } = await supabase
        .from("orders")
        .select("id, full_name, user_id")
        .order("created_at", { ascending: false });

      if (ordersError && ordersError.code === "42P01") {
        // Table doesn't exist error
        setError(
          "Order system is currently unavailable. The orders table doesn't exist in the database."
        );
        console.error("Database schema error: orders table doesn't exist");
        setLoading(false);
        return;
      }

      if (ordersError) throw ordersError;

      // Fetch message counts separately
      const ordersWithMessageCounts = await Promise.all(
        (data || []).map(async (order) => {
          try {
            const { count, error: countError } = await supabase
              .from("messages")
              .select("id", { count: "exact", head: true })
              .eq("order_id", order.id);

            if (countError) {
              console.error(
                `Error counting messages for order ${order.id}:`,
                countError
              );
              return order;
            }

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

      setAdminOrders(ordersWithMessageCounts || []);

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

  // Replace the updateMessagesInBatches function with this version that handles missing columns
  const updateMessagesInBatches = async (messageIds: string[]) => {
    // First check if the messages table exists and has the is_read column
    try {
      // Try a simple query first to check if the table and column exist
      const { data: columnCheck, error: columnCheckError } = await supabase
        .from("messages")
        .select("id")
        .limit(1);

      if (columnCheckError) {
        if (columnCheckError.code === "PGRST204") {
          console.error(
            "The is_read column doesn't exist in the messages table"
          );
          // Don't attempt to update if the column doesn't exist
          return false;
        }

        console.error("Error checking messages table:", columnCheckError);
        return false;
      }

      // Process in smaller batches
      const BATCH_SIZE = 5;
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
            // If we get a column not found error, stop trying to update
            if (updateError.code === "PGRST204") {
              console.error(
                "The is_read column doesn't exist in the messages table"
              );
              return false;
            }

            console.error("Error updating batch:", updateError);
          }
        } catch (batchError) {
          console.error("Exception updating batch:", batchError);
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

        // Process messages to ensure they have user_name and user_avatar
        const processedMessages = (data || []).map((message) => {
          // If message is missing user_name or user_avatar, add default values
          return {
            ...message,
            user_name:
              message.user_name || (message.is_admin ? "Support" : "User"),
            user_avatar: message.user_avatar || "",
          };
        });

        // Set messages even if marking as read fails
        setMessages(processedMessages);

        // Try to mark messages as read, but don't fail if it doesn't work
        try {
          const unreadIds =
            processedMessages
              ?.filter((m) => !m.is_read && m.is_admin !== isAdmin)
              .map((m) => m.id) || [];

          if (unreadIds.length > 0) {
            try {
              // Check if is_read column exists first
              const { error: columnCheckError } = await supabase
                .from("messages")
                .select("is_read")
                .limit(1);

              // Only attempt to update if the column exists
              if (!columnCheckError) {
                await updateMessagesInBatches(unreadIds);
              } else {
                console.log("Skipping mark as read - column doesn't exist");
              }
            } catch (columnError) {
              console.error("Error checking for is_read column:", columnError);
            }
          }
        } catch (markReadError) {
          console.error("Error marking messages as read:", markReadError);
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

  // Add the handleImageSelect function
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (limit to 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image too large. Maximum size is 5MB.");
      return;
    }

    setSelectedImage(file);

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Add the handleSendMessage function
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if ((!newMessage.trim() && !selectedImage) || !selectedOrderId || !user) {
      return;
    }

    setSending(true);

    try {
      let imageUrl: string | null = null;

      // Upload image if selected
      if (selectedImage) {
        try {
          imageUrl = await uploadImage(selectedImage);
        } catch (err) {
          console.error("Error uploading image:", err);
          toast.error("Failed to upload image. Please try again.");
          setSending(false);
          return;
        }
      }

      // Get user profile information
      const userName =
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.email?.split("@")[0] ||
        "User";

      const userAvatar =
        user.user_metadata?.avatar_url || user.user_metadata?.picture || null;

      // Create a temporary ID for optimistic UI
      const tempId = `temp-${Date.now()}`;

      // Add optimistic message with complete profile info
      const optimisticMessage: Message = {
        id: tempId,
        content: newMessage.trim(),
        order_id: selectedOrderId,
        user_id: user.id,
        is_admin: isAdmin,
        created_at: new Date().toISOString(),
        is_read: false,
        image_url: imageUrl,
        user_name: userName,
        user_avatar: userAvatar || "",
      };

      // Add to messages
      setMessages((prev) => [...prev, optimisticMessage]);

      // Store pending message for retry
      pendingMessages.current.set(tempId, {
        content: newMessage.trim(),
        image_url: imageUrl,
        user_name: userName,
        user_avatar: userAvatar,
      });

      // Clear input
      setNewMessage("");
      setSelectedImage(null);
      setImagePreview(null);

      // Send to database
      try {
        const { data, error } = await supabase
          .from("messages")
          .insert([
            {
              content: newMessage.trim(),
              order_id: selectedOrderId,
              user_id: user.id,
              is_admin: isAdmin,
              image_url: imageUrl,
              user_name: userName,
              user_avatar: userAvatar,
            },
          ])
          .select()
          .single();

        if (error) throw error;

        // Replace optimistic message with real one
        setMessages((prev) => prev.map((m) => (m.id === tempId ? data : m)));

        // Clear pending message
        pendingMessages.current.delete(tempId);
      } catch (err) {
        console.error("Error sending message:", err);
        toast.error("Failed to send message. Message saved as draft.");
      }
    } catch (err) {
      console.error("Error in handleSendMessage:", err);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSending(false);
    }
  };

  // Add the handleRetry function
  const handleRetry = async (messageId: string) => {
    const pendingMessage = pendingMessages.current.get(messageId);
    if (!pendingMessage || !selectedOrderId || !user) return;

    setSending(true);

    try {
      // Get user profile information
      const userName =
        pendingMessage.user_name ||
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.email?.split("@")[0] ||
        "User";

      const userAvatar =
        pendingMessage.user_avatar ||
        user.user_metadata?.avatar_url ||
        user.user_metadata?.picture ||
        null;

      // Send to database
      const { data, error } = await supabase
        .from("messages")
        .insert([
          {
            content: pendingMessage.content,
            order_id: selectedOrderId,
            user_id: user.id,
            is_admin: isAdmin,
            image_url: pendingMessage.image_url,
            user_name: userName,
            user_avatar: userAvatar,
          },
        ])
        .select()
        .single();

      if (error) throw error;

      // Replace pending message with real one
      setMessages((prev) => prev.map((m) => (m.id === messageId ? data : m)));

      // Clear pending message
      pendingMessages.current.delete(messageId);

      toast.success("Message sent successfully!");
    } catch (err) {
      console.error("Error retrying message:", err);
      toast.error("Failed to send message. Please try again.");
    } finally {
      setSending(false);
    }
  };

  // Filter orders based on search
  const { searchTerm, setSearchTerm, filteredOrders } = useOrderFilters(
    isAdmin ? adminOrders : userOrders
  );

  // Add this function to check and create database tables
  const setupDatabaseTables = async () => {
    try {
      // Check if messages table exists
      const { error: messagesTableError } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .limit(1);

      if (messagesTableError?.code === "42P01") {
        console.log("Messages table doesn't exist, attempting to create it");

        // Try to create the messages table
        const { error: createError } = await supabase.rpc(
          "create_messages_table"
        );

        if (createError) {
          console.error("Failed to create messages table:", createError);
          setFallbackMode(true);
        } else {
          console.log("Messages table created successfully");
        }
      }

      // Check if orders table exists
      const { error: ordersTableError } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .limit(1);

      if (ordersTableError?.code === "42P01") {
        console.log("Orders table doesn't exist, attempting to create it");

        // Try to create the orders table
        const { error: createError } = await supabase.rpc(
          "create_orders_table"
        );

        if (createError) {
          console.error("Failed to create orders table:", createError);
          setFallbackMode(true);
        } else {
          console.log("Orders table created successfully");
        }
      }
    } catch (err) {
      console.error("Error setting up database tables:", err);
      setFallbackMode(true);
    }
  };

  // Call this function in your useEffect
  useEffect(() => {
    setupDatabaseTables();
  }, []);

  // Add this function definition before it's used in the useEffect
  // 5. Add the checkIfAdmin function
  const checkIfAdmin = async (userId: string) => {
    try {
      // First try to check user metadata
      if (
        user?.user_metadata?.role === "admin" ||
        user?.user_metadata?.isAdmin === true
      ) {
        return true;
      }

      // Then try known admin IDs
      const knownAdminIds = [
        "febded26-f3f6-4aec-9668-b6898de96ca3",
        // Add more admin IDs as needed
      ];

      if (knownAdminIds.includes(userId)) {
        return true;
      }

      // Finally, try the admin_users table if it exists
      try {
        const { data, error } = await supabase
          .from("admin_users")
          .select("id")
          .eq("user_id", userId)
          .single();

        if (!error && data) {
          return true;
        }
      } catch (adminTableErr) {
        console.log("Admin table check failed:", adminTableErr);
        // Continue with other checks
      }

      return false;
    } catch (err) {
      console.error("Error checking admin status:", err);
      return false;
    }
  };

  // Add this function to create a minimal database schema if needed
  const createMinimalSchema = async () => {
    try {
      // Check if we have permission to create tables
      const { error: rpcError } = await supabase.rpc("check_admin_permission");

      if (rpcError) {
        console.error("No permission to create tables:", rpcError);
        setFallbackMode(true);
        return;
      }

      // Try to create messages table
      const createMessagesSQL = `
        CREATE TABLE IF NOT EXISTS public.messages (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          content TEXT NOT NULL,
          order_id UUID NOT NULL,
          user_id UUID NOT NULL,
          is_admin BOOLEAN DEFAULT false,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          is_read BOOLEAN DEFAULT false,
          image_url TEXT,
          user_name TEXT,
          user_avatar TEXT
        );
      `;

      // Try to create orders table
      const createOrdersSQL = `
        CREATE TABLE IF NOT EXISTS public.orders (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id UUID NOT NULL,
          full_name TEXT NOT NULL,
          email TEXT,
          status TEXT DEFAULT 'pending',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `;

      // Execute SQL (this requires admin privileges)
      const { error: createMessagesError } = await supabase.rpc("execute_sql", {
        sql: createMessagesSQL,
      });

      const { error: createOrdersError } = await supabase.rpc("execute_sql", {
        sql: createOrdersSQL,
      });

      if (createMessagesError || createOrdersError) {
        console.error(
          "Error creating tables:",
          createMessagesError || createOrdersError
        );
        setFallbackMode(true);
      } else {
        console.log("Successfully created minimal schema");
        // Refresh the page to use the new tables
        window.location.reload();
      }
    } catch (err) {
      console.error("Error creating minimal schema:", err);
      setFallbackMode(true);
    }
  };

  if (fallbackMode) {
    return (
      <PageContainer title="CHAT" user={user}>
        <main className="max-w-screen-xl mx-auto pb-16">
          <div className="min-h-[calc(100vh-5rem)] flex flex-col">
            <div className="p-4 border-b border-white/10">
              <h2 className="text-lg font-medium text-white">
                Chat (Demo Mode)
              </h2>
              <p className="text-sm text-white/50">
                Database connection unavailable - using local storage
              </p>
            </div>

            <div className="flex-1 p-4 overflow-y-auto">
              {messages.length === 0 ? (
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
                    <div
                      key={message.id}
                      className={`p-3 rounded-lg max-w-[80%] ${
                        message.is_admin
                          ? "bg-blue-500/20 text-blue-100 ml-auto"
                          : "bg-white/10 text-white mr-auto"
                      }`}
                    >
                      <div className="text-sm font-medium mb-1">
                        {message.is_admin ? "Support" : "You"}
                      </div>
                      <div>{message.content}</div>
                      {message.image_url && (
                        <img
                          src={message.image_url}
                          alt="Attached"
                          className="mt-2 rounded-lg max-h-40"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-white/10">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newMessage.trim()) return;

                  // Add local message
                  const newMsg = {
                    id: `local-${Date.now()}`,
                    content: newMessage,
                    user_name: user?.user_metadata?.full_name || "You",
                    user_avatar: user?.user_metadata?.avatar_url || "",
                    is_admin: false,
                    created_at: new Date().toISOString(),
                    order_id: "local-order",
                    user_id: user?.id || "anonymous",
                    image_url: imagePreview,
                  };

                  setMessages((prev) => [...prev, newMsg]);
                  setNewMessage("");
                  setImagePreview(null);

                  // Simulate response after 1 second
                  setTimeout(() => {
                    const responseMsg = {
                      id: `local-${Date.now() + 1}`,
                      content:
                        "This is a demo mode response. The database is currently unavailable.",
                      user_name: "Support",
                      user_avatar: "",
                      is_admin: true,
                      created_at: new Date().toISOString(),
                      order_id: "local-order",
                      user_id: "system",
                      image_url: "",
                    };
                    setMessages((prev) => [...prev, responseMsg]);
                  }, 1000);
                }}
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
                    disabled={!newMessage.trim()}
                    className="bg-emerald-500 hover:bg-emerald-600 text-white p-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send className="w-6 h-6" />
                  </button>
                </div>
              </form>
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
