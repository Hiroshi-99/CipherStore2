import { useState, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";
import type { Message } from "../types/chat";
import { toast } from "sonner";

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

export function useMessages(selectedOrderId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const retryCount = useRef(0);

  const messageQueue = useRef<Set<string>>(new Set());
  const pendingMessages = useRef<Map<string, Message>>(new Map());

  const delay = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  const loadMessages = useCallback(
    async (retry = false) => {
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
        retryCount.current = 0; // Reset retry count on success
      } catch (error) {
        console.error("Error loading messages:", error);

        if (retry && retryCount.current < MAX_RETRIES) {
          retryCount.current++;
          await delay(RETRY_DELAY * retryCount.current);
          return loadMessages(true);
        }

        toast.error("Failed to load messages. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [selectedOrderId]
  );

  const loadMore = useCallback(
    async (retry = false) => {
      if (!selectedOrderId || !hasMore || loading) return;

      try {
        setLoading(true);
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
        retryCount.current = 0; // Reset retry count on success
      } catch (error) {
        console.error("Error loading more messages:", error);

        if (retry && retryCount.current < MAX_RETRIES) {
          retryCount.current++;
          await delay(RETRY_DELAY * retryCount.current);
          return loadMore(true);
        }

        toast.error("Failed to load more messages. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [selectedOrderId, page, hasMore, loading]
  );

  const retryLoadMessages = useCallback(() => {
    retryCount.current = 0;
    return loadMessages(true);
  }, [loadMessages]);

  const retryLoadMore = useCallback(() => {
    retryCount.current = 0;
    return loadMore(true);
  }, [loadMore]);

  return {
    messages,
    loading,
    hasMore,
    loadMessages: retryLoadMessages,
    loadMore: retryLoadMore,
    setMessages,
    messageQueue,
    pendingMessages,
  };
}
