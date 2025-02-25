import React, { useState, useEffect, useRef, useCallback } from "react";
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
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messageSound = useRef<HTMLAudioElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [lastScrollHeight, setLastScrollHeight] = useState(0);
  const [lastScrollTop, setLastScrollTop] = useState(0);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [newMessagesBelowViewport, setNewMessagesBelowViewport] = useState(0);
  const [orderSearchTerm, setOrderSearchTerm] = useState("");
  const [filteredUserOrders, setFilteredUserOrders] = useState<
    typeof userOrders
  >([]);
  const [filteredAdminOrders, setFilteredAdminOrders] = useState<
    typeof adminOrders
  >([]);
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [isDragging, setIsDragging] = useState(false);

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

      setLoading(true);
      setError(null);

      try {
        // Fetch messages for the selected order
        const { data, error: messagesError } = await supabase
          .from("messages")
          .select("*")
          .eq("order_id", orderId)
          .order("created_at", { ascending: true });

        if (messagesError) {
          console.error("Error fetching messages:", messagesError);
          setError("Failed to load messages. Please try again.");
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

        // If no messages exist, send a welcome message
        if (processedMessages.length === 0) {
          await sendWelcomeMessage(orderId);
        }

        // Try to mark messages as read, but don't fail if it doesn't work
        try {
          const unreadIds =
            processedMessages
              ?.filter((m) => !m.is_read && m.is_admin !== isAdmin)
              .map((m) => m.id) || [];

          if (unreadIds.length > 0) {
            const { error: markReadError } = await supabase
              .from("messages")
              .update({ is_read: true })
              .in("id", unreadIds);

            if (markReadError) {
              console.error("Error marking messages as read:", markReadError);
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

  // Add these improved file handling functions

  // Enhanced file upload handler
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image size must be less than 5MB");
      return;
    }

    setSelectedImage(file);

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Reset the input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Add this fallback upload function
  const uploadImageToSupabaseDirectly = async (
    file: File,
    fileName: string
  ): Promise<string | null> => {
    try {
      // Upload directly to Supabase storage
      const { data, error } = await supabase.storage
        .from("images")
        .upload(`uploads/${fileName}`, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (error) {
        console.error("Error uploading to Supabase storage:", error);
        return null;
      }

      // Get the public URL
      const { data: urlData } = supabase.storage
        .from("images")
        .getPublicUrl(`uploads/${fileName}`);

      return urlData.publicUrl;
    } catch (err) {
      console.error("Error in direct Supabase upload:", err);
      return null;
    }
  };

  // Add this local upload function for testing
  const uploadImageLocally = async (file: File): Promise<string | null> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        // This is a data URL that can be used directly in img src
        resolve(reader.result as string);
      };
      reader.readAsDataURL(file);
    });
  };

  // Update the uploadImageFile function to include the local option
  const uploadImageFile = async (file: File): Promise<string | null> => {
    try {
      // Show upload progress
      toast.loading("Uploading image...");

      // For testing, use local upload
      if (import.meta.env.DEV) {
        const localUrl = await uploadImageLocally(file);
        toast.success("Image uploaded locally (development mode)");
        return localUrl;
      }

      // Get the current session for authentication
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        toast.error("You must be logged in to upload files");
        return null;
      }

      // Generate a unique file name
      const fileName = `${Date.now()}-${file.name.replace(
        /[^a-zA-Z0-9.]/g,
        "_"
      )}`;

      // Try the Netlify function first
      try {
        // Include the auth token in the upload request
        const { data, error } = await uploadImage(
          file,
          fileName,
          sessionData.session.access_token
        );

        if (!error) {
          // Get the public URL
          const imageUrl = data?.path
            ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/${
                data.path
              }`
            : null;

          toast.success("Image uploaded successfully");
          return imageUrl;
        }

        // If there's an error, log it but continue to the fallback
        console.error(
          "Error with Netlify function upload, trying fallback:",
          error
        );
      } catch (netlifyError) {
        console.error(
          "Netlify function upload failed, trying fallback:",
          netlifyError
        );
      }

      // Fallback to direct Supabase upload
      console.log("Using fallback upload method");
      const directUrl = await uploadImageToSupabaseDirectly(file, fileName);

      if (directUrl) {
        toast.success("Image uploaded successfully (fallback method)");
        return directUrl;
      } else {
        toast.error("Failed to upload image. Please try again.");
        return null;
      }
    } catch (err) {
      console.error("Error in uploadImageFile:", err);
      toast.error("An error occurred while uploading the image");
      return null;
    }
  };

  // Update the send message function to handle image uploads
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if ((!newMessage.trim() && !selectedImage) || !selectedOrderId || !user) {
      return;
    }

    // Use a proper UUID
    const tempId = crypto.randomUUID();

    try {
      setSending(true);

      // Upload image if selected
      let imageUrl: string | null = null;
      if (selectedImage) {
        imageUrl = await uploadImageFile(selectedImage);
        if (!imageUrl && !newMessage.trim()) {
          // If image upload failed and there's no text message, abort
          setSending(false);
          return;
        }
      }

      // Get user info
      const userName =
        user.user_metadata?.full_name || user.email?.split("@")[0] || "User";
      const userAvatar = user.user_metadata?.avatar_url || "";

      // Create message object
      const messageData = {
        id: tempId,
        content: newMessage.trim(),
        user_id: user.id,
        order_id: selectedOrderId,
        is_admin: isAdmin,
        created_at: new Date().toISOString(),
        is_read: false,
        image_url: imageUrl,
        user_name: userName,
        user_avatar: userAvatar || "",
      };

      // Add message to UI immediately (optimistic update)
      setMessages((prev) => [...prev, messageData as Message]);

      // Scroll to bottom
      scrollToBottom(true);

      // Clear input
      setNewMessage("");
      setSelectedImage(null);
      setImagePreview(null);

      // Send message to server
      const { error } = await supabase.from("messages").insert(messageData);

      if (error) {
        console.error("Error sending message:", error);

        // Store the failed message for retry
        pendingMessages.current.set(tempId, {
          ...messageData,
          error: error.message,
        });

        // Update UI to show error
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempId ? { ...m, error: error.message } : m
          )
        );

        toast.error("Failed to send message. You can retry sending.");
      }
    } catch (err) {
      console.error("Error in handleSendMessage:", err);
      toast.error("An error occurred while sending your message");
    } finally {
      setSending(false);
    }
  };

  // Add a retry function for failed uploads
  const handleRetry = async (messageId: string) => {
    const pendingMessage = pendingMessages.current.get(messageId);
    if (!pendingMessage) return;

    try {
      setSending(true);

      // If there's an image that failed to upload, try again
      let imageUrl = pendingMessage.image_url;
      if (pendingMessage.selectedImage && !imageUrl) {
        imageUrl = await uploadImageFile(pendingMessage.selectedImage);
      }

      // Update the message with the new image URL if applicable
      const messageToSend = {
        ...pendingMessage,
        image_url: imageUrl,
      };

      // Remove error from UI
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, error: undefined } : m))
      );

      // Send to server
      const { error } = await supabase.from("messages").insert(messageToSend);

      if (error) {
        throw error;
      }

      // Remove from pending messages
      pendingMessages.current.delete(messageId);

      toast.success("Message sent successfully");
    } catch (err) {
      console.error("Error retrying message:", err);

      // Update UI to show error
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, error: "Failed to send. Try again." } : m
        )
      );

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

  // Add this code to set up real-time chat functionality

  // Add this near your other useEffect hooks
  useEffect(() => {
    if (!selectedOrderId || !user) return;

    console.log(
      "Setting up real-time subscription for order:",
      selectedOrderId
    );

    // Set up real-time subscription for new messages
    const subscription = supabase
      .channel(`order-${selectedOrderId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `order_id=eq.${selectedOrderId}`,
        },
        (payload) => {
          // Make sure payload and payload.new exist
          if (!payload || !payload.new) {
            console.error("Invalid message payload:", payload);
            return;
          }

          // Only add the message if it's not from the current user
          // This prevents duplicate messages since we already add them optimistically
          const newMessage = payload.new as Message;

          if (newMessage.user_id !== user.id) {
            console.log("Received new message:", newMessage);

            // Add the message to the UI
            setMessages((prev) => {
              // Check if we already have this message (avoid duplicates)
              const exists = prev.some((m) => m.id === newMessage.id);
              if (exists) return prev;

              // Play sound if tab is not focused
              if (!isTabFocused && messageSound.current) {
                messageSound.current
                  .play()
                  .catch((err) => console.log("Error playing sound:", err));
              }

              // Add the new message with safe fallbacks for user_name and user_avatar
              return [
                ...prev,
                {
                  ...newMessage,
                  user_name:
                    newMessage.user_name ||
                    (newMessage.is_admin ? "Support" : "User"),
                  user_avatar: newMessage.user_avatar || "",
                },
              ];
            });

            // If the tab is not focused, add to unread messages
            if (!isTabFocused) {
              setUnreadMessages((prev) => new Set(prev).add(newMessage.id));

              // Show a notification
              if (
                "Notification" in window &&
                Notification.permission === "granted"
              ) {
                // Use safe fallbacks for notification content
                const senderName = newMessage.user_name || "Someone";
                const messageContent = newMessage.content || "Sent a message";

                new Notification("New Message", {
                  body: `${senderName}: ${messageContent}`,
                  icon: "/favicon.ico",
                });
              }
            }
          }
        }
      )
      .subscribe();

    // Clean up subscription when component unmounts or selectedOrderId changes
    return () => {
      console.log("Cleaning up real-time subscription");
      supabase.removeChannel(subscription);
    };
  }, [selectedOrderId, user, isTabFocused]);

  // Add this to track tab focus/blur
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsTabFocused(document.visibilityState === "visible");

      // If tab becomes visible, clear unread messages
      if (document.visibilityState === "visible") {
        setUnreadMessages(new Set());
      }
    };

    const handleFocus = () => setIsTabFocused(true);
    const handleBlur = () => setIsTabFocused(false);

    // Add event listeners
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);

    // Request notification permission
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    // Clean up
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  // Add this effect to listen for typing events
  useEffect(() => {
    if (!selectedOrderId || !user) return;

    const typingChannel = supabase
      .channel(`typing-${selectedOrderId}`)
      .on("broadcast", { event: "typing" }, (payload) => {
        // Make sure payload and payload.payload exist and have the expected properties
        if (!payload || !payload.payload || !payload.payload.user_id) {
          console.error("Invalid typing payload:", payload);
          return;
        }

        // Ignore own typing events
        if (payload.payload.user_id === user?.id) return;

        // Make sure user_name exists before adding to typing users
        const userName = payload.payload.user_name || "Someone";

        // Add user to typing users
        setTypingUsers((prev) => {
          const newSet = new Set(prev);
          newSet.add(userName);
          return newSet;
        });
      })
      .on("broadcast", { event: "stop_typing" }, (payload) => {
        // Make sure payload and payload.payload exist and have the expected properties
        if (!payload || !payload.payload || !payload.payload.user_id) {
          console.error("Invalid stop_typing payload:", payload);
          return;
        }

        // Get the user name from the payload or use the user_id as fallback
        const userName = payload.payload.user_name || payload.payload.user_id;

        // Remove user from typing users
        setTypingUsers((prev) => {
          const newSet = new Set(prev);
          newSet.delete(userName);
          return newSet;
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(typingChannel);
    };
  }, [selectedOrderId, user]);

  // Initialize the sound in useEffect
  useEffect(() => {
    // Create audio element for message notification sound
    try {
      messageSound.current = new Audio("/sounds/gg.mp3");
      messageSound.current.volume = 0.5;
    } catch (err) {
      console.error("Error initializing message sound:", err);
    }
  }, []);

  // Replace the simple scrollToBottom function with this improved version
  const scrollToBottom = (force = false) => {
    if (!messagesContainerRef.current) return;

    // Only auto-scroll if we're near the bottom or if forced
    if (shouldAutoScroll || force) {
      // Use requestAnimationFrame to ensure the DOM has updated
      requestAnimationFrame(() => {
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({
            behavior: force ? "auto" : "smooth",
            block: "end",
          });
        }
      });
    }
  };

  // Update the checkIfNearBottom function to also check for new messages
  const checkIfNearBottom = () => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const scrollBottom = scrollHeight - scrollTop - clientHeight;

    // Consider "near bottom" if within 100px of the bottom
    const nearBottom = scrollBottom < 100;
    setIsNearBottom(nearBottom);
    setShouldAutoScroll(nearBottom);

    // If we're not near bottom and there are unread messages, show indicator
    if (!nearBottom && unreadMessages.size > 0) {
      // Count messages that are below the viewport
      let count = 0;
      const visibleBottom = scrollTop + clientHeight;

      // This is a simplified approach - for a more accurate count,
      // you'd need to measure each message element's position
      const approximateMessageHeight = 80; // pixels
      const totalMessagesHeight = messages.length * approximateMessageHeight;
      const visibleRatio = clientHeight / totalMessagesHeight;
      const visibleMessages = Math.floor(messages.length * visibleRatio);
      const messagesBelow =
        messages.length -
        visibleMessages -
        Math.floor(scrollTop / approximateMessageHeight);

      count = Math.max(0, messagesBelow);
      setNewMessagesBelowViewport(count);
    } else {
      setNewMessagesBelowViewport(0);
    }
  };

  // Add this component for the new message indicator
  const NewMessagesIndicator = () => {
    if (newMessagesBelowViewport <= 0) return null;

    return (
      <button
        onClick={() => scrollToBottom(true)}
        className="absolute bottom-24 right-4 bg-blue-500 text-white rounded-full px-3 py-1 shadow-lg hover:bg-blue-600 transition-all z-10 flex items-center gap-2"
      >
        <span>
          {newMessagesBelowViewport} new message
          {newMessagesBelowViewport > 1 ? "s" : ""}
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 14l-7 7m0 0l-7-7m7 7V3"
          />
        </svg>
      </button>
    );
  };

  // Add the ScrollToBottomButton component definition
  const ScrollToBottomButton = () => {
    if (isNearBottom) return null;

    return (
      <button
        onClick={() => scrollToBottom(true)}
        className="absolute bottom-20 right-4 bg-emerald-500 text-white rounded-full p-2 shadow-lg hover:bg-emerald-600 transition-all z-10"
        aria-label="Scroll to bottom"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 14l-7 7m0 0l-7-7m7 7V3"
          />
        </svg>
      </button>
    );
  };

  // Add the missing useEffect for scroll event handling
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      checkIfNearBottom();

      // Save last scroll position
      setLastScrollTop(container.scrollTop);
      setLastScrollHeight(container.scrollHeight);
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  // Add the missing useEffect for handling messages changes
  useEffect(() => {
    if (messages.length === 0) return;

    const container = messagesContainerRef.current;
    if (!container) return;

    // If this is the first batch of messages, always scroll to bottom
    if (messages.length && lastScrollHeight === 0) {
      scrollToBottom(true);
      return;
    }

    // Check if new messages were added at the bottom (normal case)
    const isNewMessageAtBottom =
      messages.length > 0 &&
      (messages[messages.length - 1].id.startsWith("temp-") ||
        messages[messages.length - 1].user_id === user?.id);

    // If new message is from current user or we're near bottom, scroll down
    if (isNewMessageAtBottom || isNearBottom) {
      scrollToBottom();
    } else {
      // If we loaded older messages (pagination), maintain scroll position
      const heightDiff = container.scrollHeight - lastScrollHeight;
      if (heightDiff > 0 && !isNewMessageAtBottom) {
        container.scrollTop = lastScrollTop + heightDiff;
      }
    }

    // Update last scroll height
    setLastScrollHeight(container.scrollHeight);
  }, [messages, lastScrollHeight, lastScrollTop, isNearBottom, user?.id]);

  // Initialize isTabFocused
  useEffect(() => {
    // Set initial tab focus state
    setIsTabFocused(document.visibilityState === "visible");
  }, []);

  // Fix for the typing channel subscription
  const handleTyping = useCallback(() => {
    if (!selectedOrderId || !user) return;

    // Safely extract user name with fallbacks
    const userName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      (user.email ? user.email.split("@")[0] : "User");

    // Send typing event
    supabase.channel(`typing-${selectedOrderId}`).send({
      type: "broadcast",
      event: "typing",
      payload: {
        user_id: user.id,
        user_name: userName,
        is_admin: isAdmin,
      },
    });

    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set new timeout to stop typing after 3 seconds
    typingTimeoutRef.current = setTimeout(() => {
      supabase.channel(`typing-${selectedOrderId}`).send({
        type: "broadcast",
        event: "stop_typing",
        payload: {
          user_id: user.id,
          user_name: userName,
        },
      });
    }, [selectedOrderId, user, isAdmin]);
  }, [selectedOrderId, user, isAdmin]);

  // Add this effect to filter orders based on search term
  useEffect(() => {
    // Filter user orders
    if (userOrders.length > 0) {
      if (!debouncedSearchTerm.trim()) {
        setFilteredUserOrders(userOrders);
      } else {
        const searchTermLower = debouncedSearchTerm.toLowerCase();
        const filtered = userOrders.filter((order) => {
          // Search by order ID
          if (order.id.toLowerCase().includes(searchTermLower)) {
            return true;
          }

          // Search by full name
          if (
            order.full_name &&
            order.full_name.toLowerCase().includes(searchTermLower)
          ) {
            return true;
          }

          return false;
        });

        setFilteredUserOrders(filtered);
      }
    }

    // Filter admin orders
    if (adminOrders.length > 0) {
      if (!debouncedSearchTerm.trim()) {
        setFilteredAdminOrders(adminOrders);
      } else {
        const searchTermLower = debouncedSearchTerm.toLowerCase();
        const filtered = adminOrders.filter((order) => {
          // Search by order ID
          if (order.id.toLowerCase().includes(searchTermLower)) {
            return true;
          }

          // Search by full name
          if (
            order.full_name &&
            order.full_name.toLowerCase().includes(searchTermLower)
          ) {
            return true;
          }

          return false;
        });

        setFilteredAdminOrders(filtered);
      }
    }
  }, [debouncedSearchTerm, userOrders, adminOrders]);

  // Add this function to handle search input changes
  const handleOrderSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setOrderSearchTerm(e.target.value);
  };

  // Add this effect for debouncing
  useEffect(() => {
    const timerId = setTimeout(() => {
      setDebouncedSearchTerm(orderSearchTerm);
    }, 300); // 300ms delay

    return () => {
      clearTimeout(timerId);
    };
  }, [orderSearchTerm]);

  // Add this function to check the message schema
  const checkMessageSchema = async () => {
    try {
      // Get information about the messages table
      const { data, error } = await supabase.rpc("get_table_info", {
        table_name: "messages",
      });

      if (error) {
        console.error("Error getting message schema:", error);
        return null;
      }

      console.log("Message schema:", data);
      return data;
    } catch (err) {
      console.error("Error checking message schema:", err);
      return null;
    }
  };

  // Remove the duplicate sendWelcomeMessage function and combine the functionality
  // Replace both functions with this single implementation
  const sendWelcomeMessage = async (orderId: string) => {
    try {
      // Check if there are any messages in this chat
      const { data: existingMessages, error: checkError } = await supabase
        .from("messages")
        .select("id")
        .eq("order_id", orderId)
        .limit(1);

      if (checkError) {
        console.error("Error checking for existing messages:", checkError);
        return;
      }

      // Only send welcome message if this is the first message in the chat
      if (!existingMessages || existingMessages.length === 0) {
        try {
          // Check the message schema first
          const schema = await checkMessageSchema();
          console.log("Using message schema:", schema);

          // Get admin user to use as the sender
          const { data: adminUsers, error: adminError } = await supabase
            .from("users")
            .select("id")
            .eq("is_admin", true)
            .limit(1);

          // Use the first admin user or fall back to the current user's ID
          const adminId =
            adminUsers && adminUsers.length > 0
              ? adminUsers[0].id
              : user?.id || "00000000-0000-0000-0000-000000000000";

          // Create the welcome message with proper UUID
          const welcomeMessage = {
            id: crypto.randomUUID(),
            content:
              "Thank you for your order! Our support team will be with you shortly. Feel free to ask any questions about your order here.",
            user_id: adminId,
            order_id: orderId,
            is_admin: true,
            created_at: new Date().toISOString(),
            is_read: false,
            user_name: "Support Team",
            user_avatar: "https://i.imgur.com/eyaDC8l.png",
          };

          console.log("Sending welcome message:", welcomeMessage);

          // Insert the welcome message into the database
          const { error: insertError } = await supabase
            .from("messages")
            .insert(welcomeMessage);

          if (insertError) {
            console.error("Error sending welcome message:", insertError);
            // If the main approach fails, try the simpler approach
            await sendSimpleWelcomeMessage(orderId);
          } else {
            console.log("Welcome message sent successfully");

            // Add the message to the UI
            setMessages((prev) => [...prev, welcomeMessage as Message]);
          }
        } catch (err) {
          console.error("Error in sendWelcomeMessage:", err);
          // Try the simpler approach as a fallback
          await sendSimpleWelcomeMessage(orderId);
        }
      }
    } catch (err) {
      console.error("Error in sendWelcomeMessage:", err);
    }
  };

  // Add this simpler fallback approach
  const sendSimpleWelcomeMessage = async (orderId: string) => {
    try {
      // Create a minimal welcome message with only required fields
      const minimalMessage = {
        content:
          "Thank you for your order! Our support team will be with you shortly.",
        user_id: user?.id || "00000000-0000-0000-0000-000000000000",
        order_id: orderId,
        is_admin: true,
        created_at: new Date().toISOString(),
      };

      console.log("Sending minimal welcome message:", minimalMessage);

      // Insert the minimal message
      const { error: insertError } = await supabase
        .from("messages")
        .insert(minimalMessage);

      if (insertError) {
        console.error("Error sending minimal welcome message:", insertError);
      } else {
        console.log("Minimal welcome message sent successfully");

        // Add the message to the UI with additional fields for display
        setMessages((prev) => [
          ...prev,
          {
            ...minimalMessage,
            id: crypto.randomUUID(),
            user_name: "Support Team",
            user_avatar: "/images/support-avatar.png",
            is_read: false,
          } as Message,
        ]);
      }
    } catch (err) {
      console.error("Error in sendSimpleWelcomeMessage:", err);
    }
  };

  // Add this function to handle search input changes
  const handleOrderSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setOrderSearchTerm(e.target.value);
  };

  // Add this effect for debouncing
  useEffect(() => {
    const timerId = setTimeout(() => {
      setDebouncedSearchTerm(orderSearchTerm);
    }, 300); // 300ms delay

    return () => {
      clearTimeout(timerId);
    };
  }, [orderSearchTerm]);

  // Add this function to check the message schema
  const checkMessageSchema = async () => {
    try {
      // Get information about the messages table
      const { data, error } = await supabase.rpc("get_table_info", {
        table_name: "messages",
      });

      if (error) {
        console.error("Error getting message schema:", error);
        return null;
      }

      console.log("Message schema:", data);
      return data;
    } catch (err) {
      console.error("Error checking message schema:", err);
      return null;
    }
  };

  // Add this function to handle message scrolling
  const useMessageScroll = (messagesRef, messages, loadingMore) => {
    const [autoScroll, setAutoScroll] = useState(true);
    const prevMessagesLengthRef = useRef(messages.length);

    useEffect(() => {
      const messagesContainer = messagesRef.current;
      if (!messagesContainer) return;

      const handleScroll = () => {
        const { scrollTop, scrollHeight, clientHeight } = messagesContainer;
        const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
        setAutoScroll(isNearBottom);
      };

      messagesContainer.addEventListener("scroll", handleScroll);
      return () =>
        messagesContainer.removeEventListener("scroll", handleScroll);
    }, [messagesRef]);

    useEffect(() => {
      const messagesContainer = messagesRef.current;
      if (!messagesContainer) return;

      // Only auto-scroll if new messages were added (not when loading more)
      if (
        autoScroll &&
        messages.length > prevMessagesLengthRef.current &&
        !loadingMore
      ) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }

      prevMessagesLengthRef.current = messages.length;
    }, [messages, autoScroll, messagesRef, loadingMore]);

    return { autoScroll, setAutoScroll };
  };

  // Add this function to handle typing indicators
  const useTypingIndicator = (supabase, orderId, userId) => {
    const [typingUsers, setTypingUsers] = useState(new Set());
    const typingTimeoutRef = useRef(null);

    const updateTypingStatus = useCallback(
      (isTyping) => {
        if (!orderId || !userId) return;

        // Clear any existing timeout
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }

        // Send typing status to server
        supabase
          .from("typing_indicators")
          .upsert(
            {
              order_id: orderId,
              user_id: userId,
              is_typing: isTyping,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "order_id, user_id" }
          )
          .then(({ error }) => {
            if (error) {
              console.error("Error updating typing status:", error);
            }
          });

        // If user is typing, set a timeout to clear the typing status
        if (isTyping) {
          typingTimeoutRef.current = setTimeout(() => {
            updateTypingStatus(false);
          }, 3000);
        }
      },
      [orderId, userId]
    );

    // Subscribe to typing indicators
    useEffect(() => {
      if (!orderId) return;

      const subscription = supabase
        .from(`typing_indicators:order_id=eq.${orderId}`)
        .on("*", (payload) => {
          const { user_id, is_typing } = payload.new;

          // Don't show typing indicator for current user
          if (user_id === userId) return;

          setTypingUsers((prev) => {
            const newSet = new Set(prev);
            if (is_typing) {
              newSet.add(user_id);
            } else {
              newSet.delete(user_id);
            }
            return newSet;
          });
        })
        .subscribe();

      return () => {
        supabase.removeSubscription(subscription);
      };
    }, [orderId, userId]);

    return { typingUsers, updateTypingStatus };
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
                    id: crypto.randomUUID(),
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
                      id: crypto.randomUUID(),
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
                    onChange={(e) => {
                      setNewMessage(e.target.value);
                      handleTyping();
                    }}
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
            className={`fixed inset-y-0 left-0 w-80 bg-gray-900 transform transition-transform duration-300 ease-in-out z-20 ${
              showSidebar ? "translate-x-0" : "-translate-x-full"
            } md:translate-x-0 md:static md:w-80 md:min-w-[320px] flex flex-col`}
          >
            <div className="p-4 border-b border-white/10">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-medium text-white">
                  Orders
                  <span className="ml-2 text-sm text-white/50">
                    (
                    {isAdmin
                      ? filteredAdminOrders.length
                      : filteredUserOrders.length}
                    )
                  </span>
                </h2>
                <button
                  onClick={() => setShowSidebar(false)}
                  className="text-white/50 hover:text-white md:hidden"
                >
                  <XIcon className="w-6 h-6" />
                </button>
              </div>

              {/* Add search input */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search orders..."
                  value={orderSearchTerm}
                  onChange={handleOrderSearch}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:border-white/40"
                />
                <div className="absolute right-3 top-2.5 text-white/50">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="h-32 flex items-center justify-center">
                  <LoadingSpinner size="md" light />
                </div>
              ) : isAdmin ? (
                // Admin orders list
                filteredAdminOrders.length > 0 ? (
                  <div className="divide-y divide-white/10">
                    {filteredAdminOrders.map((order) => (
                      <button
                        key={order.id}
                        onClick={() => handleOrderSelect(order.id)}
                        className={`w-full text-left p-4 hover:bg-white/5 transition-colors ${
                          selectedOrderId === order.id ? "bg-white/10" : ""
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-white font-medium">
                              {order.full_name || "Customer"}
                            </p>
                            <p className="text-white/50 text-sm">
                              Order #{order.id.slice(0, 8)}
                            </p>
                          </div>
                          {order.messages && order.messages.length > 0 && (
                            <span className="bg-emerald-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                              {order.messages.length}
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center text-white/50">
                    {orderSearchTerm ? (
                      <>
                        <p>No orders matching "{orderSearchTerm}"</p>
                        <button
                          onClick={() => setOrderSearchTerm("")}
                          className="mt-2 px-4 py-2 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-colors"
                        >
                          Clear search
                        </button>
                      </>
                    ) : (
                      <p>No orders found</p>
                    )}
                  </div>
                )
              ) : // User orders list
              filteredUserOrders.length > 0 ? (
                <div className="divide-y divide-white/10">
                  {filteredUserOrders.map((order) => (
                    <button
                      key={order.id}
                      onClick={() => handleOrderSelect(order.id)}
                      className={`w-full text-left p-4 hover:bg-white/5 transition-colors ${
                        selectedOrderId === order.id ? "bg-white/10" : ""
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-white font-medium">
                            Order #{order.id.slice(0, 8)}
                          </p>
                          <p className="text-white/50 text-sm">
                            {new Date().toLocaleDateString()}
                          </p>
                        </div>
                        {order.messages && order.messages.length > 0 && (
                          <span className="bg-emerald-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                            {order.messages.length}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-white/50">
                  {orderSearchTerm ? (
                    <>
                      <p>No orders matching "{orderSearchTerm}"</p>
                      <button
                        onClick={() => setOrderSearchTerm("")}
                        className="mt-2 px-4 py-2 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-colors"
                      >
                        Clear search
                      </button>
                    </>
                  ) : (
                    <p>No orders found</p>
                  )}
                </div>
              )}
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
                <div
                  className="flex-1 overflow-y-auto p-4 relative"
                  ref={messagesContainerRef}
                >
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
                    <>
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
                      {/* Messages end ref */}
                      <div ref={messagesEndRef} />
                    </>
                  )}

                  {/* Scroll to bottom button */}
                  <ScrollToBottomButton />

                  {/* New messages indicator */}
                  <NewMessagesIndicator />
                </div>

                {/* Message input */}
                <div
                  className={`p-4 border-t border-white/10 ${
                    isDragging ? "bg-emerald-500/10" : ""
                  }`}
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                >
                  {isDragging && (
                    <div className="absolute inset-0 bg-emerald-500/10 flex items-center justify-center z-10 pointer-events-none">
                      <div className="bg-gray-800 rounded-lg p-4 shadow-lg text-white">
                        <p>Drop image here</p>
                      </div>
                    </div>
                  )}

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
                        aria-label="Attach image"
                      >
                        <ImageIcon className="w-6 h-6" />
                      </button>

                      <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => {
                          setNewMessage(e.target.value);
                          handleTyping();
                        }}
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
                        aria-label="Send message"
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

                {/* Typing indicator */}
                {typingUsers.size > 0 && (
                  <div className="px-4 py-2 text-sm text-white/60 italic">
                    {Array.from(typingUsers).join(", ")}{" "}
                    {typingUsers.size === 1 ? "is" : "are"} typing...
                    <span className="inline-block ml-1">
                      <span className="animate-bounce">.</span>
                      <span className="animate-bounce delay-100">.</span>
                      <span className="animate-bounce delay-200">.</span>
                    </span>
                  </div>
                )}
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
