import { useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import type { Message } from "../types/chat";

export function useMessageSubscription(
  orderId: string | null,
  userId: string | null,
  onNewMessage: (message: Message) => void
) {
  const handleNewMessage = useCallback(
    (payload: { new: Message }) => {
      const newMessage = payload.new;
      if (newMessage.user_id !== userId) {
        onNewMessage(newMessage);
      }
    },
    [userId, onNewMessage]
  );

  useEffect(() => {
    if (!orderId) return;

    const channel = supabase
      .channel(`messages:${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `order_id=eq.${orderId}`,
        },
        handleNewMessage
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId, handleNewMessage]);
}
