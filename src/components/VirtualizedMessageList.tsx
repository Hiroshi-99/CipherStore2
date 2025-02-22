import React, { useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Message } from "../types/chat";
import MessageBubble from "./MessageBubble";

interface VirtualizedMessageListProps {
  messages: Message[];
  messageQueue: React.MutableRefObject<Set<string>>;
  pendingMessages: React.MutableRefObject<Map<string, Message>>;
  unreadMessages: Set<string>;
  onRetry: (id: string) => void;
}

const VirtualizedMessageList = React.memo(function VirtualizedMessageList({
  messages,
  messageQueue,
  pendingMessages,
  unreadMessages,
  onRetry,
}: VirtualizedMessageListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100,
    overscan: 5,
  });

  useEffect(() => {
    if (messages.length > 0) {
      virtualizer.scrollToIndex(messages.length - 1);
    }
  }, [messages.length]);

  return (
    <div
      ref={parentRef}
      className="h-[calc(100vh-16rem)] md:h-[600px] overflow-y-auto p-4 md:p-6"
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const message = messages[virtualRow.index];
          return (
            <div
              key={message.id}
              data-message-id={message.id}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <MessageBubble
                message={message}
                isLatest={virtualRow.index === messages.length - 1}
                sending={messageQueue.current.has(message.id)}
                isUnread={unreadMessages.has(message.id)}
                onRetry={() => onRetry(message.id)}
                isPending={pendingMessages.current.has(message.id)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default VirtualizedMessageList;
