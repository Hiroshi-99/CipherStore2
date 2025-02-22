import { useRef, useCallback, useEffect } from "react";
import type { Message } from "../types/chat";

export function useMessageScroll(messages: Message[], loading: boolean) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMessageRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);

  const scrollToBottom = useCallback((smooth = true) => {
    if (!scrollRef.current) return;

    scrollRef.current.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
  }, []);

  // Handle new messages
  useEffect(() => {
    if (loading || !messages.length) return;

    // Only auto-scroll if we're already near the bottom
    if (scrollRef.current) {
      const { scrollHeight, scrollTop, clientHeight } = scrollRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;

      if (isNearBottom || shouldAutoScroll.current) {
        scrollToBottom();
      }
    }
  }, [messages, loading, scrollToBottom]);

  // Handle scroll events
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (!scrollRef.current) return;

    const { scrollHeight, scrollTop, clientHeight } = scrollRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;

    // Update auto-scroll behavior based on user's position
    shouldAutoScroll.current = isNearBottom;
  }, []);

  return {
    scrollRef,
    lastMessageRef,
    scrollToBottom,
    handleScroll,
  };
}
