import React from "react";
import { MessageAttachment } from "../MessageAttachment";
import type { Message } from "../../types/chat";

interface MessageBubbleProps {
  message: Message;
  isLatest: boolean;
  sending: boolean;
  isUnread: boolean;
  onRetry: () => void;
  isPending: boolean;
  isRead: boolean;
}

export const MessageBubble = React.memo(function MessageBubble({
  message,
  isLatest,
  sending,
  isUnread,
  onRetry,
  isPending,
  isRead,
}: MessageBubbleProps) {
  return (
    <div
      data-message-id={message.id}
      className={`flex items-start gap-3 ${
        message.is_admin ? "justify-start" : "justify-end"
      } ${isLatest && sending ? "opacity-50" : ""} ${
        isUnread ? "animate-highlight-fade" : ""
      }`}
    >
      {message.is_admin && (
        <img
          src={message.user_avatar || "/default-avatar.png"}
          alt="Avatar"
          className="w-8 h-8 rounded-full"
          loading="lazy"
        />
      )}
      <div className="space-y-2">
        <div
          className={`max-w-[70%] ${
            message.is_admin ? "bg-white/10" : "bg-emerald-500/20"
          } rounded-lg p-3`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-white/90">
              {message.user_name}
            </span>
            <span className="text-xs text-white/50">
              {new Date(message.created_at).toLocaleString()}
            </span>
          </div>
          <p className="text-white/90 whitespace-pre-wrap break-words">
            {message.content}
          </p>
        </div>
        {message.attachments?.map((attachment) => (
          <MessageAttachment key={attachment.id} attachment={attachment} />
        ))}
      </div>
      {!message.is_admin && (
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            {isPending && (
              <button
                onClick={onRetry}
                className="text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                Retry
              </button>
            )}
            {isRead && (
              <svg
                className="w-4 h-4 text-emerald-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            )}
          </div>
          <img
            src={message.user_avatar || "/default-avatar.png"}
            alt="Avatar"
            className="w-8 h-8 rounded-full"
            loading="lazy"
          />
        </div>
      )}
    </div>
  );
});
