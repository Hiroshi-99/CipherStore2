import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { supabase } from "../lib/supabase";
import Header from "../components/Header";
import { Send, RefreshCw, Image as ImageIcon } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { setPageTitle } from "../utils/title";
import PageContainer from "../components/PageContainer";
import LoadingSpinner from "../components/LoadingSpinner";
import { Toaster, toast } from "sonner";
import { uploadImage } from "../lib/storage";
import { MessageBubble } from "../components/MessageBubble";
import type { Message, Order } from "../types/chat";
import { useMessageScroll } from "../hooks/useMessageScroll";

interface ChatProps {
  orderId: string;
}

// Add these constants outside component
const MESSAGES_PER_PAGE = 50;
const SCROLL_THRESHOLD = 300;

function ChatPage() {
  const [user, setUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Add message queue for optimistic updates
  const messageQueue = useRef<Set<string>>(new Set());
  const pendingMessages = useRef<Map<string, Message>>(new Map());

  // Add virtual scrolling state
  const [visibleMessages, setVisibleMessages] = useState<Message[]>([]);
  const messageListRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Add audio ref to prevent multiple instances
  const notificationSound = useRef<HTMLAudioElement | null>(null);

  // Add pagination state
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const {
    scrollRef,
    lastMessageRef,
    scrollToBottom,
    handleScroll: handleScrollEvent,
  } = useMessageScroll(messages, loading);

  // Memoize orders list
  const ordersList = useMemo(() => {
    return (isAdmin ? adminOrders : userOrders).map((order) => (
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
        {isAdmin && order.messages?.length && (
          <div className="text-xs text-emerald-400 mt-1">
            {order.messages.length} messages
          </div>
        )}
      </button>
    ));
  }, [isAdmin, adminOrders, userOrders, selectedOrderId]);

  // Memoize messages list
  const messagesList = useMemo(() => {
    return messages.map((message, index) => (
      <MessageBubble
        key={message.id}
        message={message}
        isLatest={index === messages.length - 1}
        sending={sending}
        isUnread={unreadMessages.has(message.id)}
      />
    ));
  }, [messages, sending, unreadMessages]);

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

          const newMessage = payload.new as Message;
          if (!newMessage || messageQueue.current.has(newMessage.id)) {
            messageQueue.current.delete(newMessage.id);
            pendingMessages.current.delete(newMessage.id);
            return;
          }

          setMessages((prev) => {
            if (prev.some((msg) => msg.id === newMessage.id)) return prev;

            const isFromOther = newMessage.user_id !== user?.id;
            if (isFromOther) {
              // Play notification sound
              if (notificationSound.current) {
                notificationSound.current.currentTime = 0;
                notificationSound.current.play().catch((error) => {
                  console.warn("Failed to play notification sound:", error);
                });
              }

              // Show toast notification
              toast.message("New message", {
                description: `${
                  newMessage.user_name
                }: ${newMessage.content.slice(0, 60)}${
                  newMessage.content.length > 60 ? "..." : ""
                }`,
              });

              if (!isTabFocused) {
                setUnreadMessages((prev) => new Set(prev).add(newMessage.id));
              }
            }

            return [...prev, newMessage];
          });

          scrollToBottom();
        }
      )
      .subscribe();

    return () => {
      isSubscribed = false;
      supabase.removeChannel(channel);
    };
  }, [selectedOrderId, user?.id, isTabFocused, scrollToBottom]);

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

  // Optimized message sending with better error handling
  const handleSendMessage = useCallback(
    async (e: React.FormEvent, imageUrl?: string) => {
      e.preventDefault();
      if (
        !user ||
        (!newMessage.trim() && !imageUrl) ||
        sending ||
        !selectedOrderId
      )
        return;

      const messageContent = newMessage.trim();
      setNewMessage("");
      setSending(true);

      const tempId = crypto.randomUUID();
      const optimisticMessage: Message = {
        id: tempId,
        content: messageContent,
        image_url: imageUrl,
        user_id: user.id,
        user_name: user.user_metadata.full_name || user.email,
        user_avatar: user.user_metadata.avatar_url,
        is_admin: isAdmin,
        created_at: new Date().toISOString(),
        order_id: selectedOrderId,
      };

      try {
        messageQueue.current.add(tempId);
        pendingMessages.current.set(tempId, optimisticMessage);

        // Add message and scroll
        setMessages((prev) => [...prev, optimisticMessage]);
        scrollToBottom();

        // Get order details first
        const { data: orderData } = await supabase
          .from("orders")
          .select("user_id")
          .eq("id", selectedOrderId)
          .single();

        if (!orderData) throw new Error("Order not found");

        // Send message
        const { data: messageData, error: messageError } = await supabase
          .from("messages")
          .insert([
            {
              content: messageContent,
              image_url: imageUrl,
              user_id: user.id,
              is_admin: user.id !== orderData.user_id,
              user_name: user.user_metadata.full_name || user.email,
              user_avatar: user.user_metadata.avatar_url,
              order_id: selectedOrderId,
              order_user_id: orderData.user_id,
            },
          ])
          .select()
          .single();

        if (messageError) throw messageError;

        // Update message with real ID
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === tempId ? { ...msg, id: messageData.id } : msg
          )
        );
      } catch (error) {
        console.error("Error sending message:", error);
        // Remove optimistic message on error
        setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
        setError("Failed to send message");
        if (!imageUrl) {
          setNewMessage(messageContent);
        }
      } finally {
        messageQueue.current.delete(tempId);
        pendingMessages.current.delete(tempId);
        setSending(false);
      }
    },
    [user, newMessage, sending, selectedOrderId, isAdmin, scrollToBottom]
  );

  // Add message retry functionality
  const retryMessage = useCallback(
    async (tempId: string) => {
      const message = pendingMessages.current.get(tempId);
      if (!message) return;

      // Remove failed message
      setMessages((prev) => prev.filter((msg) => msg.id !== tempId));

      // Retry sending
      const content = message.content;
      pendingMessages.current.delete(tempId);
      setNewMessage(content);
      await handleSendMessage(new Event("submit") as any, message.image_url);
    },
    [handleSendMessage]
  );

  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
      setSelectedImage(file);
    }
  };

  const handleImageUpload = async () => {
    if (!selectedImage) return;
    try {
      setSending(true);
      const imageUrl = await uploadImage(selectedImage);
      await handleSendMessage(new Event("submit") as any, imageUrl);
    } catch (error) {
      console.error("Error uploading image:", error);
      toast.error("Failed to upload image");
    } finally {
      setSelectedImage(null);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedImage) {
      await handleImageUpload();
    } else if (newMessage.trim()) {
      await handleSendMessage(e);
    }
  };

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

  // Update fetchMessages to use pagination
  const fetchMessages = useCallback(async (orderId: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false })
        .limit(MESSAGES_PER_PAGE)
        .abortSignal(new AbortController().signal);

      if (error) throw error;

      setMessages(data.reverse());
      setHasMore(data.length === MESSAGES_PER_PAGE);
      setPage(1);
    } catch (error) {
      console.error("Error fetching messages:", error);
      toast.error("Failed to load messages. Please try again.");

      // Show retry button
      setError("Failed to load messages");
    } finally {
      setLoading(false);
    }
  }, []);

  // Add intersection observer for infinite scroll
  useEffect(() => {
    if (!lastMessageRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first.isIntersecting && hasMore) {
          loadMoreMessages();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(lastMessageRef.current);
    return () => observer.disconnect();
  }, [hasMore]);

  // Add function to load more messages
  const loadMoreMessages = useCallback(async () => {
    if (!selectedOrderId || !hasMore) return;

    try {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("order_id", selectedOrderId)
        .order("created_at", { ascending: false })
        .range(page * MESSAGES_PER_PAGE, (page + 1) * MESSAGES_PER_PAGE - 1);

      if (error) throw error;

      if (data.length < MESSAGES_PER_PAGE) {
        setHasMore(false);
      }

      setMessages((prev) => [...prev, ...data.reverse()]);
      setPage((p) => p + 1);
    } catch (error) {
      console.error("Error loading more messages:", error);
    }
  }, [selectedOrderId, page, hasMore]);

  // Update the scroll handler to handle both pagination and scroll position
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      if (!e.currentTarget) return;

      // Handle infinite scroll
      const { scrollTop } = e.currentTarget;
      if (scrollTop < SCROLL_THRESHOLD && hasMore && !loading) {
        loadMoreMessages();
      }

      // Handle scroll position tracking
      handleScrollEvent(e);
    },
    [hasMore, loading, loadMoreMessages, handleScrollEvent]
  );

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
                    ref={scrollRef}
                    className="h-[calc(100vh-16rem)] md:h-[600px] overflow-y-auto p-4 md:p-6 space-y-4"
                    onScroll={handleScroll}
                  >
                    {error ? (
                      <div className="flex flex-col items-center justify-center h-full space-y-4">
                        <p className="text-red-400">{error}</p>
                        <button
                          onClick={() => {
                            setError(null);
                            fetchMessages(selectedOrderId!);
                          }}
                          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 rounded-lg text-white transition-colors"
                        >
                          Retry
                        </button>
                      </div>
                    ) : (
                      <>
                        {hasMore && (
                          <div className="h-4">
                            {loading && (
                              <div className="flex justify-center">
                                <LoadingSpinner size="sm" light />
                              </div>
                            )}
                          </div>
                        )}
                        {messages.map((message, index) => (
                          <div
                            key={message.id}
                            ref={
                              index === messages.length - 1
                                ? lastMessageRef
                                : undefined
                            }
                            data-message-id={message.id}
                          >
                            <MessageBubble
                              message={message}
                              isLatest={index === messages.length - 1}
                              sending={messageQueue.current.has(message.id)}
                              isUnread={unreadMessages.has(message.id)}
                              onRetry={() => retryMessage(message.id)}
                              isPending={pendingMessages.current.has(
                                message.id
                              )}
                            />
                          </div>
                        ))}
                      </>
                    )}
                  </div>

                  {/* Message Input */}
                  <form
                    onSubmit={handleFormSubmit}
                    className="border-t border-white/10 p-4"
                  >
                    <div className="flex gap-2">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        ref={fileInputRef}
                        onChange={handleImageSelect}
                      />

                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="p-2 hover:bg-gray-700 rounded-full transition-colors"
                      >
                        <ImageIcon className="w-6 h-6 text-gray-400" />
                      </button>

                      <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Type your message..."
                        className="flex-1 bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:border-white/40"
                      />
                      <button
                        type="submit"
                        disabled={
                          (!newMessage.trim() && !selectedImage) || sending
                        }
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
          </div>
        </div>
      </main>
    </PageContainer>
  );
}

export default React.memo(ChatPage);
