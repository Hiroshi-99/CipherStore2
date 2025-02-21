import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { supabase } from "../lib/supabase";
import Header from "../components/Header";
import { Send, RefreshCw } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { setPageTitle } from "../utils/title";
import PageContainer from "../components/PageContainer";
import LoadingSpinner from "../components/LoadingSpinner";
import { Toaster, toast } from "sonner";

interface Message {
  id: string;
  content: string;
  user_name: string;
  user_avatar: string;
  is_admin: boolean;
  created_at: string;
  order_id: string;
  user_id: string;
}

interface Order {
  id: string;
  full_name: string;
  messages?: { id: string; created_at: string }[];
}

interface ChatProps {
  orderId: string;
}

// Add message queue for better performance
const MESSAGE_QUEUE = new Map<string, RetryableMessage>();
const RETRY_DELAY = 3000;

interface RetryableMessage {
  content: string;
  retryCount: number;
  timeoutId?: NodeJS.Timeout;
}

// Add message status type
type MessageStatus = "sending" | "sent" | "error";

// Add message status tracking
interface MessageWithStatus extends Message {
  status?: MessageStatus;
}

// Add debounced message input
const useDebounce = (value: string, delay: number) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

// Create separate components for better performance
const MessageBubble = React.memo(function MessageBubble({
  message,
  isLatest,
  sending,
  isUnread,
  onRetry,
  isPending,
}: {
  message: Message;
  isLatest: boolean;
  sending: boolean;
  isUnread: boolean;
  onRetry: () => void;
  isPending: boolean;
}) {
  return (
    <div
      className={`flex items-start gap-3 ${
        message.is_admin ? "justify-start" : "justify-end"
      } ${isLatest && sending ? "opacity-50" : ""} ${
        isUnread ? "animate-highlight-fade" : ""
      }`}
    >
      {message.is_admin && (
        <img
          src={message.user_avatar || "/default-avatar.png"}
          alt="Avatar"
          className="w-8 h-8 rounded-full"
          loading="lazy"
        />
      )}
      <div
        className={`max-w-[70%] ${
          message.is_admin ? "bg-white/10" : "bg-emerald-500/20"
        } rounded-lg p-3 relative group`}
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
        {isPending && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRetry();
            }}
            className="absolute -bottom-6 left-0 text-xs text-red-400 hover:text-red-300 transition-colors bg-black/50 px-2 py-1 rounded"
          >
            Retry
          </button>
        )}
        {sending && (
          <div className="absolute right-2 bottom-2">
            <LoadingSpinner size="sm" light />
          </div>
        )}
      </div>
      {!message.is_admin && (
        <img
          src={message.user_avatar || "/default-avatar.png"}
          alt="Avatar"
          className="w-8 h-8 rounded-full"
          loading="lazy"
        />
      )}
    </div>
  );
});

const OrderButton = React.memo(function OrderButton({
  order,
  isSelected,
  isAdmin,
  onClick,
}: {
  order: Order;
  isSelected: boolean;
  isAdmin: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
        isSelected
          ? "bg-emerald-500/20 text-emerald-400"
          : "text-white/70 hover:bg-white/10"
      }`}
    >
      <div className="font-medium">{order.full_name}</div>
      <div className="text-sm text-white/50">Order #{order.id.slice(0, 8)}</div>
      {isAdmin && order.messages?.length > 0 && (
        <div className="text-xs text-emerald-400 mt-1">
          {order.messages.length} messages
        </div>
      )}
    </button>
  );
});

// Create separate MessageList component for better performance
const MessageList = React.memo(function MessageList({
  messages,
  messageQueue,
  pendingMessages,
  unreadMessages,
  onRetry,
  onMarkAsRead,
}: {
  messages: MessageWithStatus[];
  messageQueue: Set<string>;
  pendingMessages: Map<string, MessageWithStatus>;
  unreadMessages: Set<string>;
  onRetry: (messageId: string) => void;
  onMarkAsRead: (messageId: string) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Add virtual scrolling
  useEffect(() => {
    if (!listRef.current) return;

    const options = {
      root: listRef.current,
      rootMargin: "20px",
      threshold: 0.1,
    };

    observerRef.current = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const messageId = entry.target.getAttribute("data-message-id");
          if (messageId) {
            // Handle message visibility
          }
        }
      });
    }, options);

    return () => observerRef.current?.disconnect();
  }, []);

  return (
    <div ref={listRef} className="space-y-4">
      {messages.map((message) => (
        <div key={message.id} data-message-id={message.id}>
          <MessageBubble
            message={message}
            isLatest={message.id === messages[messages.length - 1]?.id}
            sending={messageQueue.has(message.id)}
            isUnread={unreadMessages.has(message.id)}
            onRetry={() => onRetry(message.id)}
            isPending={pendingMessages.has(message.id)}
          />
        </div>
      ))}
    </div>
  );
});

function ChatPage() {
  const [user, setUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<MessageWithStatus[]>([]);
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
  const [unreadMessages, setUnreadMessages] = useState<Set<string>>(new Set());
  const [isTabFocused, setIsTabFocused] = useState(true);
  const [notification, setNotification] = useState<string | null>(null);

  // Add message queue for optimistic updates
  const messageQueue = useRef<Set<string>>(new Set());
  const pendingMessages = useRef<Map<string, MessageWithStatus>>(new Map());

  // Add virtual scrolling state
  const [visibleMessages, setVisibleMessages] = useState<MessageWithStatus[]>(
    []
  );
  const messageListRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Add audio ref to prevent multiple instances
  const notificationSound = useRef<HTMLAudioElement | null>(null);

  // Add message tracking to prevent duplicates
  const processedMessages = useRef<Set<string>>(new Set());

  // Add typing indicator
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  const debouncedMessage = useDebounce(newMessage, 500);

  // Add read receipts
  const [readMessages, setReadMessages] = useState<Set<string>>(new Set());

  // Add message status tracking
  const [messageStatuses, setMessageStatuses] = useState<
    Record<string, MessageStatus>
  >({});

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Memoize orders list
  const ordersList = useMemo(() => {
    return (isAdmin ? adminOrders : userOrders).map((order) => (
      <OrderButton
        key={order.id}
        order={order}
        isSelected={selectedOrderId === order.id}
        isAdmin={isAdmin}
        onClick={() => {
          setSelectedOrderId(order.id);
          setShowSidebar(false);
        }}
      />
    ));
  }, [isAdmin, adminOrders, userOrders, selectedOrderId]);

  // Memoize messages list
  const messagesList = useMemo(() => {
    return messages.map((message) => ({
      ...message,
      status: messageStatuses[message.id] || "sent",
      isRead: readMessages.has(message.id),
    }));
  }, [messages, messageStatuses, readMessages]);

  // Debounced message input handler
  const debouncedSetNewMessage = useCallback(
    debounce((value: string) => setNewMessage(value), 100),
    []
  );

  // Initialize audio on mount
  useEffect(() => {
    notificationSound.current = new Audio("/sounds/gg.mp3");
    notificationSound.current.volume = 0.5;

    return () => {
      if (notificationSound.current) {
        notificationSound.current.pause();
        notificationSound.current = null;
      }
    };
  }, []);

  // Update message subscription with better sound handling
  const subscribeToMessages = useCallback(() => {
    if (!selectedOrderId) return undefined;

    let isSubscribed = true;
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
          if (!isSubscribed || payload.eventType !== "INSERT") return;

          // Skip if this is our own message
          if (payload.new.user_id === user?.id) {
            return;
          }

          try {
            // Fetch the complete message with order data
            const { data, error } = await supabase
              .from("messages")
              .select(
                `
                *,
                orders!inner(
                  user_id,
                  full_name
                )
              `
              )
              .eq("id", payload.new.id)
              .single();

            if (error) throw error;
            if (!data) return;

            const newMessage = {
              id: data.id,
              content: data.content,
              user_name: data.user_name,
              user_avatar: data.user_avatar,
              is_admin: data.user_id !== data.orders.user_id,
              created_at: data.created_at,
              order_id: data.order_id,
              user_id: data.user_id,
            };

            setMessages((prev) => {
              // Skip if message already exists
              if (prev.some((msg) => msg.id === newMessage.id)) return prev;

              if (!isTabFocused) {
                setUnreadMessages((prev) => new Set(prev).add(newMessage.id));
                if (notificationSound.current) {
                  notificationSound.current.currentTime = 0;
                  notificationSound.current.play().catch(() => {});
                }
              }
              return [...prev, newMessage];
            });

            requestAnimationFrame(scrollToBottom);
          } catch (error) {
            console.error("Error processing new message:", error);
          }
        }
      )
      .subscribe();

    return () => {
      isSubscribed = false;
      supabase.removeChannel(channel);
    };
  }, [selectedOrderId, user?.id, scrollToBottom, isTabFocused]);

  // Add virtual scrolling
  useEffect(() => {
    if (!messageListRef.current) return;

    const options = {
      root: messageListRef.current,
      rootMargin: "20px",
      threshold: 0.1,
    };

    observerRef.current = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const messageId = entry.target.getAttribute("data-message-id");
          if (messageId) {
            setVisibleMessages((prev) =>
              [...prev, messages.find((m) => m.id === messageId)!].filter(
                Boolean
              )
            );
          }
        }
      });
    }, options);

    messages.forEach((message) => {
      const element = document.querySelector(
        `[data-message-id="${message.id}"]`
      );
      if (element) {
        observerRef.current?.observe(element);
      }
    });

    return () => {
      observerRef.current?.disconnect();
    };
  }, [messages]);

  // Add retryMessage function
  const retryMessage = useCallback(
    async (messageId: string) => {
      const queuedMessage = MESSAGE_QUEUE.get(messageId);
      if (!queuedMessage) return;

      // Clear existing timeout if any
      if (queuedMessage.timeoutId) {
        clearTimeout(queuedMessage.timeoutId);
      }

      try {
        const { data, error } = await supabase.from("messages").insert([
          {
            content: queuedMessage.content,
            order_id: selectedOrderId,
            user_name: user?.user_metadata.full_name || user?.email,
            user_avatar: user?.user_metadata.avatar_url,
            user_id: user?.id,
          },
        ]);

        if (error) throw error;

        // Remove from retry queue on success
        MESSAGE_QUEUE.delete(messageId);

        // Update message with real ID
        if (data?.[0]) {
          setMessages((prev) =>
            prev.map((msg) => (msg.id === messageId ? data[0] : msg))
          );
          toast.success("Message sent successfully");
        }
      } catch (error) {
        console.error("Error retrying message:", error);
        toast.error("Failed to retry message");
      }
    },
    [selectedOrderId, user]
  );

  // Add typing indicator handling
  useEffect(() => {
    if (debouncedMessage && selectedOrderId) {
      setIsTyping(true);
      // Emit typing event to other users
      supabase.channel(`typing:${selectedOrderId}`).send({
        type: "broadcast",
        event: "typing",
        payload: { userId: user?.id },
      });

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      typingTimeoutRef.current = setTimeout(() => {
        setIsTyping(false);
      }, 2000);
    }
  }, [debouncedMessage, selectedOrderId, user?.id]);

  // Add read receipt handling
  const markMessageAsRead = useCallback(
    (messageId: string) => {
      setReadMessages((prev) => new Set(prev).add(messageId));
      // Emit read receipt to other users
      supabase.channel(`read:${selectedOrderId}`).send({
        type: "broadcast",
        event: "read",
        payload: { messageId, userId: user?.id },
      });
    },
    [selectedOrderId, user?.id]
  );

  // Update handleSendMessage function
  const handleSendMessage = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!user || !selectedOrderId || !newMessage.trim() || sending) return;

      const messageContent = newMessage.trim();
      const tempId = crypto.randomUUID();
      const timestamp = new Date().toISOString();

      // Set initial status
      setMessageStatuses((prev) => ({ ...prev, [tempId]: "sending" }));

      // Create optimistic message
      const optimisticMessage: MessageWithStatus = {
        id: tempId,
        content: messageContent,
        user_name: user.user_metadata.full_name || user.email || "User",
        user_avatar: user.user_metadata.avatar_url,
        is_admin: isAdmin,
        created_at: timestamp,
        order_id: selectedOrderId,
        user_id: user.id,
        status: "sending",
      };

      setMessages((prev) => [...prev, optimisticMessage]);
      setNewMessage("");
      scrollToBottom();

      try {
        const { data, error } = await supabase.from("messages").insert([
          {
            content: messageContent,
            order_id: selectedOrderId,
            user_name: user.user_metadata.full_name || user.email,
            user_avatar: user.user_metadata.avatar_url,
            user_id: user.id,
            is_admin: isAdmin,
            created_at: timestamp,
          },
        ]);

        if (error) throw error;

        if (data?.[0]) {
          setMessageStatuses((prev) => ({ ...prev, [data[0].id]: "sent" }));
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === tempId ? { ...data[0], status: "sent" } : msg
            )
          );
        }
      } catch (error) {
        console.error("Error sending message:", error);
        setMessageStatuses((prev) => ({ ...prev, [tempId]: "error" }));
        toast.error("Failed to send message. Click retry to try again.");
        pendingMessages.current.set(tempId, optimisticMessage);
      }
    },
    [user, selectedOrderId, newMessage, sending, scrollToBottom, isAdmin]
  );

  // Add cleanup for message queue
  useEffect(() => {
    return () => {
      MESSAGE_QUEUE.forEach((message) => {
        if (message.timeoutId) {
          clearTimeout(message.timeoutId);
        }
      });
      MESSAGE_QUEUE.clear();
    };
  }, []);

  useEffect(() => {
    setPageTitle("Chat");
    checkUser();
  }, []);

  useEffect(() => {
    if (selectedOrderId) {
      // Fetch messages first
      fetchMessages(selectedOrderId);

      // Then set up subscription
      const cleanup = subscribeToMessages();
      return () => {
        if (cleanup && typeof cleanup === "function") {
          cleanup();
        }
      };
    }
  }, [selectedOrderId, subscribeToMessages]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsTabFocused(document.visibilityState === "visible");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (isTabFocused) {
      setUnreadMessages(new Set());
    }
  }, [isTabFocused]);

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

      // Fix admin check query with proper UUID casting
      const { data: adminData, error: adminError } = await supabase
        .from("admin_users")
        .select("*")
        .eq("user_id", session.user.id)
        .maybeSingle();

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

  // Update fetchMessages function with better error handling and typing
  const fetchMessages = async (orderId: string) => {
    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("messages")
        .select(
          `
          *,
          orders!inner(
            user_id,
            full_name
          )
        `
        )
        .eq("order_id", orderId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      // Clear processed messages before setting new ones
      processedMessages.current.clear();

      // Transform and type the data properly
      const transformedMessages =
        data?.map((msg) => ({
          id: msg.id,
          content: msg.content,
          user_name: msg.user_name,
          user_avatar: msg.user_avatar,
          is_admin: msg.user_id !== msg.orders.user_id,
          created_at: msg.created_at,
          order_id: msg.order_id,
          user_id: msg.user_id,
        })) || [];

      // Add fetched messages to processed set
      transformedMessages.forEach((msg) =>
        processedMessages.current.add(msg.id)
      );

      setMessages(transformedMessages);
      setTimeout(scrollToBottom, 100);
    } catch (error) {
      console.error("Error fetching messages:", error);
      setError("Failed to load messages");
      toast.error("Failed to load messages. Please try again.");
    } finally {
      setLoading(false);
    }
  };

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
      {notification && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-500 text-white px-4 py-2 rounded-lg shadow-lg animate-fade-in">
          {notification}
        </div>
      )}
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
                {ordersList}
              </div>
            </div>
          </div>

          {/* Chat Area */}
          <div className="md:col-span-3">
            <div className="backdrop-blur-md bg-black/30 rounded-2xl overflow-hidden">
              {selectedOrderId ? (
                <>
                  {/* Messages Container */}
                  <div
                    ref={messageListRef}
                    className="h-[calc(100vh-16rem)] md:h-[600px] overflow-y-auto p-4 md:p-6 space-y-4"
                  >
                    {loading ? (
                      <div className="flex items-center justify-center h-full">
                        <LoadingSpinner size="lg" light />
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-white/50 space-y-2">
                        <p>No messages yet.</p>
                        <p className="text-sm">Start the conversation!</p>
                      </div>
                    ) : (
                      <MessageList
                        messages={messagesList}
                        messageQueue={messageQueue.current}
                        pendingMessages={pendingMessages.current}
                        unreadMessages={unreadMessages}
                        onRetry={retryMessage}
                        onMarkAsRead={markMessageAsRead}
                      />
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
                        onChange={(e) => debouncedSetNewMessage(e.target.value)}
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
                <div className="h-[calc(100vh-16rem)] md:h-[600px] flex flex-col items-center justify-center text-white/50 space-y-2">
                  <p>Select an order to start chatting</p>
                  <p className="text-sm">Your conversations will appear here</p>
                </div>
              )}
            </div>
            {isTyping && (
              <div className="text-sm text-white/50 italic">
                Someone is typing...
              </div>
            )}
          </div>
        </div>
      </main>
    </PageContainer>
  );
}

// Debounce utility
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export default React.memo(ChatPage);
