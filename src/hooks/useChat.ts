import { useState, useCallback, useRef } from "react";
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
  const messageQueue = useRef<Set<string>>(new Set());
  const pendingMessages = useRef<Map<string, Message>>(new Map());
  const [orders, setOrders] = useState<any[]>([]);

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
    handleSendMessage,
  };
}
