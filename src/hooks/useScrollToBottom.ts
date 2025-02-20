import { useState, useEffect, useRef, useCallback } from "react";

export function useScrollToBottom(deps: any[] = []) {
  const [showScrollButton, setShowScrollButton] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isAutoScrolling = useRef(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    if (!containerRef.current) return;

    isAutoScrolling.current = true;
    containerRef.current.scrollTo({
      top: containerRef.current.scrollHeight,
      behavior,
    });

    // Reset auto-scroll flag after animation
    setTimeout(
      () => {
        isAutoScrolling.current = false;
      },
      behavior === "smooth" ? 300 : 0
    );
  }, []);

  const handleScroll = useCallback(() => {
    if (!containerRef.current || isAutoScrolling.current) return;

    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    setShowScrollButton(!isNearBottom);
  }, []);

  useEffect(() => {
    scrollToBottom("instant");
  }, [...deps]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  return {
    containerRef,
    showScrollButton,
    scrollToBottom,
  };
}
