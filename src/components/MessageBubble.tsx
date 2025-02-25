import React, { useState } from "react";
import LoadingSpinner from "./LoadingSpinner";
import type { Message } from "../types/chat";
import { formatDistanceToNow } from "date-fns";

interface MessageBubbleProps {
  message: Message;
  isLatest: boolean;
  sending: boolean;
  isUnread: boolean;
  onRetry: () => void;
  isPending: boolean;
}

export const MessageBubble = React.memo(function MessageBubble({
  message,
  isLatest,
  sending,
  isUnread,
  onRetry,
  isPending,
}: MessageBubbleProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Format timestamp as relative time
  const relativeTime = formatDistanceToNow(new Date(message.created_at), {
    addSuffix: true,
  });

  return (
    <div
      className={`flex items-start gap-3 ${
        message.is_admin ? "justify-start" : "justify-end"
      } ${isLatest && sending ? "opacity-50" : ""} ${
        isUnread ? "animate-highlight-fade" : ""
      }`}
      aria-live={isLatest ? "polite" : "off"}
    >
      {message.is_admin && (
        <img
          src={message.user_avatar || "/default-avatar.png"}
          alt={`${message.user_name}'s avatar`}
          className="w-8 h-8 rounded-full"
          loading="lazy"
          width={32}
          height={32}
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
          <span
            className="text-xs text-white/50"
            title={new Date(message.created_at).toLocaleString()}
          >
            {relativeTime}
          </span>
        </div>
        {message.content && (
          <p className="text-white/90 whitespace-pre-wrap break-words">
            {message.content}
          </p>
        )}
        {message.image_url && (
          <div
            className={`relative ${
              !imageLoaded && !imageError ? "min-h-[100px]" : ""
            }`}
          >
            {!imageLoaded && !imageError && (
              <div className="absolute inset-0 flex items-center justify-center">
                <LoadingSpinner size="sm" light />
              </div>
            )}
            {imageError ? (
              <div className="bg-white/5 p-3 rounded text-center">
                <p className="text-red-400 text-sm">Failed to load image</p>
                <button
                  onClick={() => {
                    setImageError(false);
                    setImageLoaded(false);
                  }}
                  className="text-xs text-emerald-400 hover:underline mt-1"
                >
                  Retry
                </button>
              </div>
            ) : (
              <img
                src={message.image_url}
                alt="Chat image"
                className={`max-w-full rounded-lg mt-2 transition-opacity ${
                  imageLoaded ? "opacity-100" : "opacity-0"
                }`}
                loading="lazy"
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageError(true)}
              />
            )}
          </div>
        )}
        {isPending && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRetry();
            }}
            className="absolute -bottom-6 left-0 text-xs text-red-400 hover:text-red-300 transition-colors bg-black/50 px-2 py-1 rounded"
            aria-label="Retry sending message"
          >
            Retry
          </button>
        )}
        {sending && (
          <div
            className="absolute right-2 bottom-2"
            aria-label="Sending message"
          >
            <LoadingSpinner size="sm" light />
          </div>
        )}
      </div>
      {!message.is_admin && (
        <img
          src={message.user_avatar || "/default-avatar.png"}
          alt={`${message.user_name}'s avatar`}
          className="w-8 h-8 rounded-full"
          loading="lazy"
          width={32}
          height={32}
        />
      )}
    </div>
  );
});
