import React from "react";
import LoadingSpinner from "./LoadingSpinner";
import { Message } from "../types/chat";

interface MessageBubbleProps {
  message: Message;
  isLatest: boolean;
  sending: boolean;
  isUnread: boolean;
  onRetry: () => void;
  isPending: boolean;
}

const MessageBubble = React.memo(function MessageBubble({
  message,
  isLatest,
  sending,
  isUnread,
  onRetry,
  isPending,
}: MessageBubbleProps) {
  return (
    <div
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
      <div
        className={`max-w-[70%] ${
          message.is_admin ? "bg-white/10" : "bg-emerald-500/20"
        } rounded-lg p-3 relative group`}
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-white/90">
            {message.user_name}
          </span>
          <span className="text-xs text-white/50">
            {new Date(message.created_at).toLocaleString()}
          </span>
        </div>
        {message.content && (
          <p className="text-white/90 whitespace-pre-wrap break-words">
            {message.content}
          </p>
        )}
        {message.image_url && (
          <img
            src={message.image_url}
            alt="Chat image"
            className="max-w-full rounded-lg mt-2"
            loading="lazy"
          />
        )}
        {isPending && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRetry();
            }}
            className="absolute -bottom-6 left-0 text-xs text-red-400 hover:text-red-300 transition-colors bg-black/50 px-2 py-1 rounded"
          >
            Retry
          </button>
        )}
        {sending && (
          <div className="absolute right-2 bottom-2">
            <LoadingSpinner size="sm" light />
          </div>
        )}
      </div>
      {!message.is_admin && (
        <img
          src={message.user_avatar || "/default-avatar.png"}
          alt="Avatar"
          className="w-8 h-8 rounded-full"
          loading="lazy"
        />
      )}
    </div>
  );
});

export default MessageBubble;
