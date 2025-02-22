import { useState, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";
import type { Message } from "../types/chat";

const MESSAGES_PER_PAGE = 50;

export function useMessages(orderId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const messageQueue = useRef<Set<string>>(new Set());
  const pendingMessages = useRef<Map<string, Message>>(new Map());

  const fetchMessages = useCallback(async () => {
    if (!orderId) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false })
        .limit(MESSAGES_PER_PAGE);

      if (error) throw error;

      setMessages(data.reverse());
      setHasMore(data.length === MESSAGES_PER_PAGE);
      setPage(1);
    } catch (error) {
      console.error("Error fetching messages:", error);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  const loadMoreMessages = useCallback(async () => {
    if (!orderId || !hasMore || loading) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("order_id", orderId)
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
    } finally {
      setLoading(false);
    }
  }, [orderId, page, hasMore, loading]);

  const addMessage = useCallback((message: Message) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const updateMessage = useCallback((tempId: string, newMessage: Message) => {
    setMessages((prev) =>
      prev.map((msg) => (msg.id === tempId ? newMessage : msg))
    );
  }, []);

  const removeMessage = useCallback((messageId: string) => {
    setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
  }, []);

  return {
    messages,
    loading,
    hasMore,
    messageQueue,
    pendingMessages,
    fetchMessages,
    loadMoreMessages,
    addMessage,
    updateMessage,
    removeMessage,
  };
}
