import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "../lib/supabase";
import type { User } from "@supabase/supabase-js";

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

export function useChat(user: User | null, selectedOrderId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const messageQueue = useRef<Set<string>>(new Set());
  const pendingMessages = useRef<Map<string, Message>>(new Map());
  const lastMessageRef = useRef<string | null>(null);

  // Optimized message fetching with cursor-based pagination
  const fetchMessages = useCallback(async (orderId: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true })
        .limit(50);

      if (error) throw error;
      setMessages(data || []);
      lastMessageRef.current = data?.[data.length - 1]?.id || null;
    } catch (error) {
      console.error("Error fetching messages:", error);
      setError("Failed to load messages");
    } finally {
      setLoading(false);
    }
  }, []);

  // Optimized real-time subscription
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
          if (!isSubscribed) return;

          switch (payload.eventType) {
            case "INSERT": {
              const newMessage = payload.new as Message;
              if (messageQueue.current.has(newMessage.id)) {
                messageQueue.current.delete(newMessage.id);
                pendingMessages.current.delete(newMessage.id);
                return;
              }

              setMessages((prev) => {
                if (prev.some((msg) => msg.id === newMessage.id)) return prev;
                return [...prev, newMessage];
              });
              break;
            }
            case "UPDATE": {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === payload.new.id ? { ...msg, ...payload.new } : msg
                )
              );
              break;
            }
            case "DELETE": {
              setMessages((prev) =>
                prev.filter((msg) => msg.id !== payload.old.id)
              );
              break;
            }
          }
        }
      )
      .subscribe();

    return () => {
      isSubscribed = false;
      supabase.removeChannel(channel);
    };
  }, [selectedOrderId]);

  // Handle message sending with optimistic updates
  const sendMessage = useCallback(
    async (content: string) => {
      if (!user || !selectedOrderId || !content.trim()) return;

      const tempId = crypto.randomUUID();
      const optimisticMessage: Message = {
        id: tempId,
        content: content.trim(),
        user_id: user.id,
        user_name: user.user_metadata.full_name || user.email,
        user_avatar: user.user_metadata.avatar_url,
        is_admin: false, // Will be updated with real value
        created_at: new Date().toISOString(),
        order_id: selectedOrderId,
      };

      messageQueue.current.add(tempId);
      pendingMessages.current.set(tempId, optimisticMessage);

      // Optimistic update
      setMessages((prev) => [...prev, optimisticMessage]);

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
              content: content.trim(),
              user_id: user.id,
              is_admin: user.id !== orderData.user_id,
              user_name: user.user_metadata.full_name || user.email,
              user_avatar: user.user_metadata.avatar_url,
              order_id: selectedOrderId,
            },
          ])
          .select()
          .single();

        if (messageError) throw messageError;

        // Update message with real data
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === tempId ? { ...msg, ...messageData } : msg
          )
        );
      } catch (error) {
        console.error("Error sending message:", error);
        // Remove optimistic message on error
        setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
        throw error;
      } finally {
        messageQueue.current.delete(tempId);
        pendingMessages.current.delete(tempId);
      }
    },
    [user, selectedOrderId]
  );

  // Initialize subscription
  useEffect(() => {
    if (selectedOrderId) {
      fetchMessages(selectedOrderId);
      const unsubscribe = subscribeToMessages();
      return unsubscribe;
    }
  }, [selectedOrderId, fetchMessages, subscribeToMessages]);

  return {
    messages,
    loading,
    error,
    sendMessage,
    messageQueue: messageQueue.current,
    pendingMessages: pendingMessages.current,
  };
}
