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
import type { Message } from "../types/chat";
import { useMessages } from "../hooks/useMessages";
import { useInfiniteScroll } from "../hooks/useInfiniteScroll";
import { useMessageSubscription } from "../hooks/useMessageSubscription";
import { optimizeImage } from "../utils/imageOptimization";

interface ChatProps {
  orderId: string;
}

// Add these constants outside component
const MESSAGES_PER_PAGE = 50;
const SCROLL_THRESHOLD = 300;

function ChatPage() {
  const [user, setUser] = useState<User | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userOrders, setUserOrders] = useState<
    { id: string; full_name: string }[]
  >([]);
  const [adminOrders, setAdminOrders] = useState<
    Array<{
      id: string;
      full_name: string;
      messages_count?: number;
    }>
  >([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [showSidebar, setShowSidebar] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState<Set<string>>(new Set());
  const [isTabFocused, setIsTabFocused] = useState(true);
  const [notification, setNotification] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const notificationSoundRef = useRef<HTMLAudioElement | null>(null);

  // Message list container ref
  const messageContainerRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    loading: messagesLoading,
    hasMore,
    messageQueue,
    pendingMessages,
    fetchMessages,
    loadMoreMessages,
    addMessage,
    updateMessage,
    removeMessage,
  } = useMessages(selectedOrderId);

  // Add infinite scroll hook
  const lastMessageRef = useInfiniteScroll(() => {
    if (hasMore && !messagesLoading) {
      loadMoreMessages();
    }
  });

  const playNotificationSound = useCallback(() => {
    if (notificationSoundRef.current) {
      notificationSoundRef.current.currentTime = 0;
      notificationSoundRef.current.play().catch((error) => {
        console.warn("Failed to play notification sound:", error);
      });
    }
  }, []);

  // Update message subscription
  useMessageSubscription(selectedOrderId, user?.id ?? null, (newMessage) => {
    if (!messageQueue.current.has(newMessage.id)) {
      addMessage(newMessage);
      playNotificationSound();
      scrollToBottom();
    }
  });

  // Initialize audio on mount
  useEffect(() => {
    notificationSoundRef.current = new Audio("/sounds/gg.mp3");
    notificationSoundRef.current.volume = 0.5;

    return () => {
      if (notificationSoundRef.current) {
        notificationSoundRef.current.pause();
        notificationSoundRef.current = null;
      }
    };
  }, []);

  const subscribeToMessages = useCallback(() => {
    if (!selectedOrderId) return undefined;

    let isSubscribed = true;
    const channel = supabase
      .channel(`messages:${selectedOrderId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `order_id=eq.${selectedOrderId}`,
        },
        (payload) => {
          if (!isSubscribed || payload.eventType !== "INSERT") return;

          const newMessage = payload.new as Message;
          if (newMessage.user_id !== user?.id) {
            addMessage(newMessage);
            playNotificationSound();
            scrollToBottom();
          }
        }
      )
      .subscribe();

    return () => {
      isSubscribed = false;
      supabase.removeChannel(channel);
    };
  }, [
    selectedOrderId,
    user?.id,
    addMessage,
    playNotificationSound,
    scrollToBottom,
  ]);

  // Update the useEffect that uses subscribeToMessages
  useEffect(() => {
    if (selectedOrderId) {
      fetchMessages();
      const cleanup = subscribeToMessages();
      return cleanup;
    }
  }, [selectedOrderId, fetchMessages, subscribeToMessages]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Update ordersList memo
  const ordersList = useMemo(() => {
    const orders = isAdmin ? adminOrders : userOrders;
    return orders.map((order) => (
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
        {isAdmin && order.messages_count && order.messages_count > 0 && (
          <div className="text-xs text-emerald-400 mt-1">
            {order.messages_count} messages
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

  // Debounced message input handler
  const debouncedSetNewMessage = useCallback(
    debounce((value: string) => setNewMessage(value), 100),
    []
  );

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

      try {
        const { data: orderData } = await supabase
          .from("orders")
          .select("user_id")
          .eq("id", selectedOrderId)
          .single();

        if (!orderData) throw new Error("Order not found");

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
        scrollToBottom();
      } catch (error) {
        console.error("Error sending message:", error);
        toast.error("Failed to send message");
        if (!imageUrl) {
          setNewMessage(messageContent);
        }
      } finally {
        setSending(false);
      }
    },
    [user, newMessage, sending, selectedOrderId, scrollToBottom]
  );

  // Update the form submission handler
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || sending) return;

    try {
      setSending(true);
      if (selectedImage) {
        const optimizedImage = await optimizeImage(selectedImage);
        const imageUrl = await uploadImage(optimizedImage);
        await handleSendMessage(e, imageUrl);
        setSelectedImage(null);
      } else if (newMessage.trim()) {
        await handleSendMessage(e);
      }
    } catch (error) {
      console.error("Error handling form submit:", error);
      toast.error("Failed to send message");
    } finally {
      setSending(false);
    }
  };

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
      const optimizedImage = await optimizeImage(selectedImage);
      const imageUrl = await uploadImage(optimizedImage);
      await handleSendMessage(new Event("submit") as any, imageUrl);
    } catch (error) {
      console.error("Error uploading image:", error);
      toast.error("Failed to upload image");
    } finally {
      setSelectedImage(null);
    }
  };

  useEffect(() => {
    setPageTitle("Chat");
    checkUser();
  }, []);

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
          messages:messages_count(count)
        `
        )
        .order("created_at", { ascending: false });

      if (error) throw error;

      setAdminOrders(
        ordersData?.map((order) => ({
          ...order,
          messages_count: order.messages?.[0]?.count ?? 0,
        })) || []
      );

      if (ordersData?.length > 0) {
        setSelectedOrderId(ordersData[0].id);
      }
    } catch (error) {
      console.error("Error fetching admin orders:", error);
      setError("Failed to load orders");
    }
  };

  useEffect(() => {
    if (error) {
      toast.error(error);
      setError(null);
    }
  }, [error]);

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
                    ref={messageContainerRef}
                    className="h-[calc(100vh-16rem)] md:h-[600px] overflow-y-auto p-4 md:p-6 space-y-4"
                    onScroll={(e) => {
                      const { scrollTop } = e.currentTarget;
                      if (
                        scrollTop < SCROLL_THRESHOLD &&
                        hasMore &&
                        !messagesLoading
                      ) {
                        loadMoreMessages();
                      }
                    }}
                  >
                    {hasMore && (
                      <div ref={lastMessageRef} className="h-4">
                        {messagesLoading && <LoadingSpinner size="sm" light />}
                      </div>
                    )}
                    {messages.map((message, index) => (
                      <div key={message.id} data-message-id={message.id}>
                        <MessageBubble
                          message={message}
                          isLatest={index === messages.length - 1}
                          sending={messageQueue.current.has(message.id)}
                          isUnread={unreadMessages.has(message.id)}
                          onRetry={() =>
                            handleSendMessage(
                              new Event("submit") as any,
                              message.image_url
                            )
                          }
                          isPending={pendingMessages.current.has(message.id)}
                        />
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
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

// Debounce utility
function debounce<T extends (...args: Parameters<T>) => ReturnType<T>>(
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
