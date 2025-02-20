import { useState, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";
import { User } from "@supabase/supabase-js";

interface FileAttachment {
  id: string;
  url: string;
  name: string;
  size: number;
  type: string;
}

interface Message {
  id: string;
  content: string;
  user_name: string;
  user_avatar: string;
  is_admin: boolean;
  created_at: string;
  order_id: string;
  user_id: string;
  is_read?: boolean;
  attachments?: FileAttachment[];
}

export function useMessages(user: User | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messageQueue = useRef<Set<string>>(new Set());
  const pendingMessages = useRef<Map<string, Message>>(new Map());

  const fetchMessages = useCallback(async (orderId: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("messages")
        .select(
          `
          *,
          orders!inner(
            user_id,
            full_name
          ),
          message_reads!left(
            is_read
          )
        `
        )
        .eq("order_id", orderId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      setMessages(
        data?.map((msg) => ({
          ...msg,
          is_admin: msg.user_id !== msg.orders.user_id,
          is_read: msg.message_reads?.[0]?.is_read ?? false,
          orders: undefined,
          message_reads: undefined,
        })) || []
      );
    } catch (err) {
      console.error("Error fetching messages:", err);
      setError("Failed to load messages");
    } finally {
      setLoading(false);
    }
  }, []);

  const sendMessage = useCallback(
    async (content: string, orderId: string, isAdmin: boolean) => {
      if (!user || !content.trim() || sending) return;

      const tempId = crypto.randomUUID();
      const optimisticMessage: Message = {
        id: tempId,
        content: content.trim(),
        user_id: user.id,
        user_name: user.user_metadata.full_name || user.email,
        user_avatar: user.user_metadata.avatar_url,
        is_admin: isAdmin,
        created_at: new Date().toISOString(),
        order_id: orderId,
      };

      messageQueue.current.add(tempId);
      pendingMessages.current.set(tempId, optimisticMessage);
      setMessages((prev) => [...prev, optimisticMessage]);

      try {
        setSending(true);
        const { data: orderData } = await supabase
          .from("orders")
          .select("user_id")
          .eq("id", orderId)
          .single();

        if (!orderData) throw new Error("Order not found");

        const { error: messageError } = await supabase.from("messages").insert([
          {
            content: content.trim(),
            user_id: user.id,
            is_admin: user.id !== orderData.user_id,
            user_name: user.user_metadata.full_name || user.email,
            user_avatar: user.user_metadata.avatar_url,
            order_id: orderId,
            order_user_id: orderData.user_id,
          },
        ]);

        if (messageError) throw messageError;
      } catch (err) {
        console.error("Error sending message:", err);
        setError("Failed to send message");
        setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
      } finally {
        messageQueue.current.delete(tempId);
        pendingMessages.current.delete(tempId);
        setSending(false);
      }
    },
    [user, sending]
  );

  return {
    messages,
    loading,
    sending,
    error,
    fetchMessages,
    sendMessage,
    messageQueue,
    pendingMessages,
  };
}
