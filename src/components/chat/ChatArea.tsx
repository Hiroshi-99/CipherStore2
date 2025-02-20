import React from "react";
import { MessageBubble } from "./MessageBubble";
import { useScrollToBottom } from "../../hooks/useScrollToBottom";
import type { Message } from "../../types/chat";

interface ChatAreaProps {
  messages: Message[];
  messageQueue: React.RefObject<Set<string>>;
  pendingMessages: React.RefObject<Map<string, Message>>;
  unreadMessages: Set<string>;
  onRetry: (id: string) => void;
  typingUsers: Set<string>;
}

export const ChatArea = React.memo(function ChatArea({
  messages,
  messageQueue,
  pendingMessages,
  unreadMessages,
  onRetry,
  typingUsers,
}: ChatAreaProps) {
  const { containerRef, showScrollButton, scrollToBottom } = useScrollToBottom([
    messages.length,
  ]);

  if (!messages.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-white/50 space-y-2">
        <p>No messages yet</p>
        <p className="text-sm">Start the conversation!</p>
      </div>
    );
  }

  return (
    <div className="relative h-full">
      <div
        ref={containerRef}
        className="h-full overflow-y-auto p-4 md:p-6 space-y-4 scroll-smooth"
      >
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            isLatest={message.id === messages[messages.length - 1].id}
            sending={messageQueue.current?.has(message.id) ?? false}
            isUnread={unreadMessages.has(message.id)}
            onRetry={() => onRetry(message.id)}
            isPending={pendingMessages.current?.has(message.id) ?? false}
            isRead={message.is_read}
          />
        ))}
      </div>

      {typingUsers.size > 0 && (
        <div className="absolute bottom-0 left-0 p-4 text-sm text-white/70">
          {Array.from(typingUsers).join(", ")} typing
          <div className="flex gap-1">
            <span className="animate-bounce">•</span>
            <span className="animate-bounce" style={{ animationDelay: "0.2s" }}>
              •
            </span>
            <span className="animate-bounce" style={{ animationDelay: "0.4s" }}>
              •
            </span>
          </div>
        </div>
      )}

      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 right-4 p-2 bg-emerald-500 rounded-full shadow-lg hover:bg-emerald-600 transition-colors"
          aria-label="Scroll to bottom"
        >
          <ChevronDown className="w-5 h-5 text-white" />
        </button>
      )}
    </div>
  );
});
