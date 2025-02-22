import { useState, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";
import type { Message } from "../types/chat";
import { toast } from "sonner";

export function useMessages(selectedOrderId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);

  const messageQueue = useRef<Set<string>>(new Set());
  const pendingMessages = useRef<Map<string, Message>>(new Map());

  const loadMessages = useCallback(async () => {
    if (!selectedOrderId) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("order_id", selectedOrderId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      setMessages(data.reverse());
      setHasMore(data.length === 50);
      setPage(1);
    } catch (error) {
      console.error("Error loading messages:", error);
      toast.error("Failed to load messages");
    } finally {
      setLoading(false);
    }
  }, [selectedOrderId]);

  const loadMore = useCallback(async () => {
    if (!selectedOrderId || !hasMore) return;

    try {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("order_id", selectedOrderId)
        .order("created_at", { ascending: false })
        .range(page * 50, (page + 1) * 50 - 1);

      if (error) throw error;

      setHasMore(data.length === 50);
      setMessages((prev) => [...prev, ...data.reverse()]);
      setPage((p) => p + 1);
    } catch (error) {
      console.error("Error loading more messages:", error);
      toast.error("Failed to load more messages");
    }
  }, [selectedOrderId, page, hasMore]);

  return {
    messages,
    loading,
    hasMore,
    loadMessages,
    loadMore,
    setMessages,
    messageQueue,
    pendingMessages,
  };
}
