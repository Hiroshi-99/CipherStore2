import { useState, useCallback, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useRealtimeSubscription } from "./useRealtimeSubscription";

interface TypingStatus {
  user_id: string;
  user_name: string;
  order_id: string;
  is_typing: boolean;
}

export function useTypingStatus(
  orderId: string | null,
  userId: string | null,
  userName: string | null
) {
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [debounceTimeout, setDebounceTimeout] = useState<NodeJS.Timeout>();

  // Subscribe to typing status changes
  useRealtimeSubscription<TypingStatus>(
    "typing_status",
    useCallback(
      (payload) => {
        if (
          payload.eventType === "INSERT" &&
          payload.new.order_id === orderId &&
          payload.new.user_id !== userId
        ) {
          if (payload.new.is_typing) {
            setTypingUsers((prev) => new Set([...prev, payload.new.user_name]));
          } else {
            setTypingUsers((prev) => {
              const next = new Set(prev);
              next.delete(payload.new.user_name);
              return next;
            });
          }
        }
      },
      [orderId, userId]
    ),
    { filter: `order_id=eq.${orderId}` }
  );

  const setTypingStatus = useCallback(
    async (isTyping: boolean) => {
      if (!orderId || !userId || !userName) return;

      try {
        await supabase.from("typing_status").upsert(
          {
            user_id: userId,
            user_name: userName,
            order_id: orderId,
            is_typing: isTyping,
          },
          { onConflict: "user_id,order_id" }
        );
      } catch (error) {
        console.error("Error updating typing status:", error);
      }
    },
    [orderId, userId, userName]
  );

  const handleTyping = useCallback(() => {
    clearTimeout(debounceTimeout);
    setTypingStatus(true);

    const timeout = setTimeout(() => {
      setTypingStatus(false);
    }, 2000);

    setDebounceTimeout(timeout);
  }, [debounceTimeout, setTypingStatus]);

  // Cleanup typing status on unmount
  useEffect(() => {
    return () => {
      setTypingStatus(false);
      clearTimeout(debounceTimeout);
    };
  }, [setTypingStatus, debounceTimeout]);

  return {
    typingUsers,
    handleTyping,
  };
}
