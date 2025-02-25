import React, { useState } from "react";
import LoadingSpinner from "./LoadingSpinner";
import type { Message } from "../types/chat";
import { formatDistanceToNow } from "date-fns";
import { toast } from "react-hot-toast";
import { Copy } from "lucide-react";

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

  const isAdmin = message.is_admin;

  // Ensure user_name and user_avatar have fallback values
  const userName = message.user_name || (isAdmin ? "Support" : "User");
  const userAvatar = message.user_avatar || "";

  // Format timestamp as relative time
  const relativeTime = formatDistanceToNow(new Date(message.created_at), {
    addSuffix: true,
  });

  // First, check if the message is an account details message
  const isAccountDetails = message.is_account_details;

  // Add this check before the isAccountDetails check
  const isSystemMessage = message.is_system;

  return (
    <div
      className={`flex items-start gap-3 ${
        isAdmin ? "justify-start" : "justify-end"
      } ${isLatest && sending ? "opacity-50" : ""} ${
        isUnread ? "animate-highlight-fade" : ""
      }`}
      aria-live={isLatest ? "polite" : "off"}
    >
      {isAdmin && (
        <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm overflow-hidden">
          {userAvatar ? (
            <img
              src={userAvatar}
              alt={userName}
              className="w-full h-full object-cover"
            />
          ) : (
            userName.charAt(0).toUpperCase()
          )}
        </div>
      )}
      <div
        className={`max-w-[70%] ${
          isAdmin
            ? "bg-blue-500/20 text-blue-100"
            : "bg-emerald-500/20 text-emerald-100"
        } rounded-lg p-3 relative group`}
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-white/90">{userName}</span>
          <span
            className="text-xs text-white/50"
            title={new Date(message.created_at).toLocaleString()}
          >
            {relativeTime}
          </span>
        </div>
        {isSystemMessage ? (
          <div className="bg-red-50 p-3 rounded-lg border border-red-200">
            <div className="text-red-800 text-sm">{message.content}</div>
          </div>
        ) : isAccountDetails ? (
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <div className="font-medium text-blue-800 mb-2">
              Account Details
            </div>
            <div className="space-y-3">
              {message.content.split("\n").map((line, i) => {
                if (line.startsWith("**Account ID:**")) {
                  const value = line.replace("**Account ID:**", "").trim();
                  return (
                    <div key={i} className="flex justify-between items-center">
                      <div>
                        <span className="text-gray-600 font-medium">
                          Account ID:
                        </span>
                        <span className="ml-2 font-mono">{value}</span>
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(value);
                          toast.success("Account ID copied to clipboard");
                        }}
                        className="p-1 text-blue-500 hover:bg-blue-100 rounded"
                      >
                        <Copy size={16} />
                      </button>
                    </div>
                  );
                } else if (line.startsWith("**Password:**")) {
                  const value = line.replace("**Password:**", "").trim();
                  return (
                    <div key={i} className="flex justify-between items-center">
                      <div>
                        <span className="text-gray-600 font-medium">
                          Password:
                        </span>
                        <span className="ml-2">{value}</span>
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(value);
                          toast.success("Password copied to clipboard");
                        }}
                        className="p-1 text-blue-500 hover:bg-blue-100 rounded"
                      >
                        <Copy size={16} />
                      </button>
                    </div>
                  );
                } else if (
                  line.trim() &&
                  !line.includes("Please keep these details")
                ) {
                  return (
                    <p key={i} className="text-gray-700">
                      {line}
                    </p>
                  );
                }
                return null;
              })}
              <p className="text-xs text-gray-500 mt-2">
                Please keep these details secure.
              </p>
            </div>
          </div>
        ) : (
          <div className="whitespace-pre-wrap break-words">
            {message.content}
          </div>
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
      {!isAdmin && (
        <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white text-sm overflow-hidden">
          {userAvatar ? (
            <img
              src={userAvatar}
              alt={userName}
              className="w-full h-full object-cover"
            />
          ) : (
            userName.charAt(0).toUpperCase()
          )}
        </div>
      )}
    </div>
  );
});
