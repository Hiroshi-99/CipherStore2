import { useCallback, useEffect } from "react";
import { supabase } from "../lib/supabase";

export function useReadReceipts(
  orderId: string | null,
  userId: string | null,
  isAdmin: boolean
) {
  const markMessagesAsRead = useCallback(
    async (messageIds: string[]) => {
      if (!orderId || !userId || !messageIds.length) return;

      try {
        await supabase.from("message_reads").upsert(
          messageIds.map((messageId) => ({
            message_id: messageId,
            user_id: userId,
            order_id: orderId,
            is_admin: isAdmin,
          })),
          { onConflict: "message_id,user_id" }
        );
      } catch (error) {
        console.error("Error marking messages as read:", error);
      }
    },
    [orderId, userId, isAdmin]
  );

  // Mark messages as read when they become visible
  useEffect(() => {
    if (!orderId) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const unreadMessageIds = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => entry.target.id)
          .filter(Boolean);

        if (unreadMessageIds.length) {
          markMessagesAsRead(unreadMessageIds);
        }
      },
      { threshold: 0.5 }
    );

    const messages = document.querySelectorAll("[data-message-id]");
    messages.forEach((message) => observer.observe(message));

    return () => observer.disconnect();
  }, [orderId, markMessagesAsRead]);

  return {
    markMessagesAsRead,
  };
}
