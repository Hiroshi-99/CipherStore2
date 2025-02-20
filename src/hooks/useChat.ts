import { useState, useCallback, useRef, useEffect } from "react";
import { User } from "@supabase/supabase-js";
import { useMessages } from "./useMessages";
import { useOrders } from "./useOrders";
import { useRealtimeSubscription } from "./useRealtimeSubscription";

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

export function useChat(user: User | null, isAdmin: boolean) {
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState<Set<string>>(new Set());
  const [isTabFocused, setIsTabFocused] = useState(true);
  const [notification, setNotification] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");

  const {
    messages,
    loading: messagesLoading,
    sending,
    error: messageError,
    sendMessage,
    messageQueue,
    pendingMessages,
    fetchMessages,
  } = useMessages(user);

  const {
    orders,
    loading: ordersLoading,
    error: ordersError,
    fetchUserOrders,
    fetchAdminOrders,
  } = useOrders(isAdmin);

  // Handle visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsTabFocused(document.visibilityState === "visible");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // Clear unread messages when tab gains focus
  useEffect(() => {
    if (isTabFocused) {
      setUnreadMessages(new Set());
    }
  }, [isTabFocused]);

  // Load initial data
  useEffect(() => {
    if (user) {
      if (isAdmin) {
        fetchAdminOrders().then(setSelectedOrderId);
      } else {
        fetchUserOrders(user.id).then(setSelectedOrderId);
      }
    }
  }, [user, isAdmin, fetchUserOrders, fetchAdminOrders]);

  // Fetch messages when order is selected
  useEffect(() => {
    if (selectedOrderId) {
      fetchMessages(selectedOrderId);
    }
  }, [selectedOrderId, fetchMessages]);

  // Subscribe to real-time updates
  useRealtimeSubscription(
    "messages",
    useCallback(
      (payload) => {
        if (
          payload.eventType === "INSERT" &&
          payload.new.order_id === selectedOrderId
        ) {
          const isFromOther = payload.new.user_id !== user?.id;
          if (isFromOther) {
            handleNewMessageNotification(payload.new as Message);
          }
        }
      },
      [selectedOrderId, user?.id]
    ),
    { event: "INSERT", filter: `order_id=eq.${selectedOrderId}` }
  );

  const handleNewMessageNotification = useCallback(
    (message: Message) => {
      if (!isTabFocused) {
        const audio = new Audio("/notification.mp3");
        audio.volume = 0.5;
        audio.play().catch(() => {});

        setNotification(
          `${message.user_name}: ${message.content.slice(0, 60)}${
            message.content.length > 60 ? "..." : ""
          }`
        );
        setTimeout(() => setNotification(null), 4000);

        setUnreadMessages((prev) => new Set(prev).add(message.id));
      }
    },
    [isTabFocused]
  );

  const handleSendMessage = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedOrderId || !newMessage.trim() || sending) return;

      await sendMessage(newMessage.trim(), selectedOrderId, isAdmin);
      setNewMessage("");
    },
    [selectedOrderId, newMessage, sending, sendMessage, isAdmin]
  );

  return {
    selectedOrderId,
    setSelectedOrderId,
    showSidebar,
    setShowSidebar,
    unreadMessages,
    notification,
    newMessage,
    setNewMessage,
    messages,
    messagesLoading,
    sending,
    messageError,
    messageQueue,
    pendingMessages,
    orders,
    ordersLoading,
    ordersError,
    handleSendMessage,
  };
}
