import { useState, useCallback, useRef, useEffect } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

interface Message {
  id: string;
  content: string;
  user_name: string;
  user_avatar: string;
  is_admin: boolean;
  created_at: string;
  order_id: string;
  user_id: string;
  is_read: boolean;
  attachments?: FileAttachment[];
}

interface FileAttachment {
  id: string;
  url: string;
  name: string;
  size: number;
  type: string;
}

export function useChat(user: User | null, isAdmin: boolean) {
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [unreadMessages] = useState(new Set<string>());
  const [notification, setNotification] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const messageQueue = useRef<Set<string>>(new Set());
  const pendingMessages = useRef<Map<string, Message>>(new Map());

  // Fetch orders
  useEffect(() => {
    async function fetchOrders() {
      if (!user) return;

      try {
        setOrdersLoading(true);
        const { data: ordersData, error } = await supabase
          .from("orders")
          .select(
            `
            *,
            messages (
              id,
              created_at
            )
          `
          )
          .order("created_at", { ascending: false });

        if (error) throw error;

        setOrders(ordersData || []);

        // Select first order by default if none selected
        if (!selectedOrderId && ordersData && ordersData.length > 0) {
          setSelectedOrderId(ordersData[0].id);
        }
      } catch (error) {
        console.error("Error fetching orders:", error);
      } finally {
        setOrdersLoading(false);
      }
    }

    fetchOrders();
  }, [user, isAdmin]);

  // Fetch messages when order is selected
  useEffect(() => {
    async function fetchMessages() {
      if (!selectedOrderId) return;

      try {
        setMessagesLoading(true);
        const { data: messagesData, error } = await supabase
          .from("messages")
          .select("*")
          .eq("order_id", selectedOrderId)
          .order("created_at", { ascending: true });

        if (error) throw error;

        setMessages(messagesData || []);
      } catch (error) {
        console.error("Error fetching messages:", error);
      } finally {
        setMessagesLoading(false);
      }
    }

    fetchMessages();
  }, [selectedOrderId]);

  // Subscribe to new messages
  useEffect(() => {
    if (!selectedOrderId) return;

    const subscription = supabase
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
          setMessages((prev) => [...prev, payload.new as Message]);
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [selectedOrderId]);

  const handleSendMessage = useCallback(
    async (content: string, attachments: FileAttachment[] = []) => {
      if (!selectedOrderId || !user || !content.trim()) return;

      try {
        setSending(true);
        const { data: orderData } = await supabase
          .from("orders")
          .select("user_id")
          .eq("id", selectedOrderId)
          .single();

        if (!orderData) throw new Error("Order not found");

        const messageData = {
          content: content.trim(),
          user_id: user.id,
          is_admin: user.id !== orderData.user_id,
          user_name: user.user_metadata.full_name || user.email,
          user_avatar: user.user_metadata.avatar_url,
          order_id: selectedOrderId,
          attachments,
        };

        const { error: messageError } = await supabase
          .from("messages")
          .insert([messageData]);

        if (messageError) throw messageError;

        setNewMessage("");
      } catch (error) {
        console.error("Error sending message:", error);
        throw error;
      } finally {
        setSending(false);
      }
    },
    [selectedOrderId, user]
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
    messageQueue,
    pendingMessages,
    orders,
    ordersLoading,
    handleSendMessage,
  };
}
