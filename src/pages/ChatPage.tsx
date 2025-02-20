import React, { useCallback, useRef, useState } from "react";
import { Send, RefreshCw, ChevronDown, Paperclip, X } from "lucide-react";
import PageContainer from "../components/PageContainer";
import LoadingSpinner from "../components/LoadingSpinner";
import { useAuth } from "../hooks/useAuth";
import { usePageTitle } from "../hooks/usePageTitle";
import { useChat } from "../hooks/useChat";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { useScrollToBottom } from "../hooks/useScrollToBottom";
import { useTypingStatus } from "../hooks/useTypingStatus";
import { useReadReceipts } from "../hooks/useReadReceipts";
import { MessageAttachment } from "../components/MessageAttachment";
import { useFileAttachments } from "../hooks/useFileAttachments";
import { useDragAndDrop } from "../hooks/useDragAndDrop";
import { FilePreview } from "../components/FilePreview";
import { ALLOWED_TYPES } from "../constants/files";
import { Toast } from "../components/Toast";

interface Message {
  id: string;
  content: string;
  user_name: string;
  user_avatar: string;
  is_admin: boolean;
  created_at: string;
  order_id: string;
  user_id: string;
  is_read: boolean;
  attachments?: { id: string; url: string }[];
}

interface Order {
  id: string;
  full_name: string;
  messages?: { id: string; created_at: string }[];
}

interface MessageBubbleProps {
  message: Message;
  isLatest: boolean;
  sending: boolean;
  isUnread: boolean;
  onRetry: () => void;
  isPending: boolean;
  isRead: boolean;
}

// Separate components for better performance
const MessageBubble = React.memo(function MessageBubble({
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

const OrderButton = React.memo(function OrderButton({
  order,
  isSelected,
  isAdmin,
  onClick,
}: {
  order: Order;
  isSelected: boolean;
  isAdmin: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
        isSelected
          ? "bg-emerald-500/20 text-emerald-400"
          : "text-white/70 hover:bg-white/10"
      }`}
    >
      <div className="font-medium">{order.full_name}</div>
      <div className="text-sm text-white/50">Order #{order.id.slice(0, 8)}</div>
      {isAdmin && order.messages?.length > 0 && (
        <div className="text-xs text-emerald-400 mt-1">
          {order.messages.length} messages
        </div>
      )}
    </button>
  );
});

function ChatArea({
  messages,
  messageQueue,
  pendingMessages,
  unreadMessages,
  onRetry,
  typingUsers,
}: {
  messages: Message[];
  messageQueue: React.RefObject<Set<string>>;
  pendingMessages: React.RefObject<Map<string, Message>>;
  unreadMessages: Set<string>;
  onRetry: (id: string) => void;
  typingUsers: Set<string>;
}) {
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
            sending={messageQueue.current.has(message.id)}
            isUnread={unreadMessages.has(message.id)}
            onRetry={() => onRetry(message.id)}
            isPending={pendingMessages.current.has(message.id)}
            isRead={message.is_read}
          />
        ))}

        {typingUsers.size > 0 && (
          <div className="flex items-center gap-2 text-white/50 text-sm animate-fade-in">
            <div className="flex items-center gap-1">
              {Array.from(typingUsers).join(", ")}
              <span>{typingUsers.size === 1 ? "is" : "are"} typing</span>
            </div>
            <div className="flex gap-1">
              <span className="animate-bounce">•</span>
              <span
                className="animate-bounce"
                style={{ animationDelay: "0.2s" }}
              >
                •
              </span>
              <span
                className="animate-bounce"
                style={{ animationDelay: "0.4s" }}
              >
                •
              </span>
            </div>
          </div>
        )}
      </div>

      {showScrollButton && (
        <button
          onClick={() => scrollToBottom()}
          className="absolute bottom-4 right-4 bg-emerald-500 p-2 rounded-full shadow-lg hover:bg-emerald-600 transition-colors"
          aria-label="Scroll to bottom"
        >
          <ChevronDown className="w-5 h-5 text-white" />
        </button>
      )}
    </div>
  );
}

interface ChatInputProps {
  onSubmit: (content: string, attachments: FileAttachment[]) => void;
  disabled: boolean;
  value: string;
  onChange: (value: string) => void;
  onTyping: () => void;
}

function ChatInput({
  onSubmit,
  disabled,
  value,
  onChange,
  onTyping,
}: ChatInputProps) {
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const { uploadFile, uploading, progress, error, clearError } =
    useFileAttachments();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isDragging, handleDragOver, handleDragLeave, handleDrop } =
    useDragAndDrop((files) => setPendingFiles((prev) => [...prev, ...files]));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (disabled || !value.trim()) return;

    try {
      const uploadedFiles = await Promise.all(
        pendingFiles.map(async (file) => {
          try {
            return await uploadFile(file);
          } catch (error) {
            console.error(`Failed to upload ${file.name}:`, error);
            return null;
          }
        })
      );

      const attachments = uploadedFiles.filter(Boolean) as FileAttachment[];
      onSubmit(value.trim(), attachments);
      setPendingFiles([]);
      onChange("");
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  const removeFile = useCallback((index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      setPendingFiles((prev) => [...prev, ...files]);
      e.target.value = ""; // Reset input
    },
    []
  );

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative"
    >
      {isDragging && (
        <div className="absolute inset-0 z-10 backdrop-blur-sm bg-black/50 border-2 border-dashed border-emerald-500 rounded-lg flex items-center justify-center">
          <div className="text-emerald-400 text-lg font-medium">
            Drop files to upload
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="border-t border-white/10 p-4">
        {pendingFiles.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
            {pendingFiles.map((file, index) => (
              <FilePreview
                key={index}
                file={file}
                onRemove={() => removeFile(index)}
              />
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <textarea
              value={value}
              onChange={(e) => {
                onChange(e.target.value);
                onTyping();
              }}
              placeholder="Type a message..."
              className="w-full bg-white/5 rounded-lg px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
              rows={1}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-3 hover:bg-white/10 rounded-lg transition-colors"
              disabled={disabled}
            >
              <Paperclip className="w-5 h-5 text-white/70" />
            </button>
            <button
              type="submit"
              className="p-3 bg-emerald-500 hover:bg-emerald-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={disabled || !value.trim()}
            >
              <Send className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelect}
          className="hidden"
          multiple
          accept={ALLOWED_TYPES.join(",")}
        />
      </form>

      {error && (
        <Toast message={error.message} type="error" onClose={clearError} />
      )}
    </div>
  );
}

function ChatPage() {
  usePageTitle("Chat");
  const { user, isAdmin, loading: authLoading } = useAuth();
  const {
    selectedOrderId,
    setSelectedOrderId,
    showSidebar,
    setShowSidebar,
    unreadMessages,
    notification,
    newMessage,
    setNewMessage,
    messages,
    messagesLoading,
    sending,
    messageQueue,
    pendingMessages,
    orders,
    ordersLoading,
    handleSendMessage,
  } = useChat(user, isAdmin);

  const { typingUsers, handleTyping } = useTypingStatus(
    selectedOrderId,
    user?.id ?? null,
    user?.user_metadata?.full_name ?? user?.email ?? null
  );

  useReadReceipts(selectedOrderId, user?.id ?? null, isAdmin);

  const sendMessage = useCallback(
    async (content: string, attachments: FileAttachment[] = []) => {
      if (!selectedOrderId || !user) return;

      try {
        await handleSendMessage(content, attachments);
      } catch (error) {
        console.error("Error sending message:", error);
      }
    },
    [selectedOrderId, user, handleSendMessage]
  );

  const handleRetry = useCallback(
    (messageId: string) => {
      const message = pendingMessages.current.get(messageId);
      if (!message) return;

      setNewMessage(message.content);
      sendMessage(message.content, message.attachments || []);
    },
    [sendMessage, pendingMessages, setNewMessage]
  );

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" light />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <PageContainer title="CHAT" showBack user={user}>
        {notification && (
          <div className="fixed top-4 right-4 z-50 bg-emerald-500 text-white px-4 py-2 rounded-lg shadow-lg animate-fade-in">
            {notification}
          </div>
        )}
        <main className="max-w-6xl mx-auto px-4 py-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 relative">
            {/* Mobile Order Toggle */}
            <button
              className="md:hidden fixed bottom-4 right-4 z-20 bg-emerald-500 p-3 rounded-full shadow-lg"
              onClick={() => setShowSidebar(!showSidebar)}
              aria-label="Toggle orders sidebar"
            >
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16m-7 6h7"
                />
              </svg>
            </button>

            {/* Orders Sidebar */}
            <aside
              className={`md:col-span-1 fixed md:relative inset-0 z-10 md:z-0 transform ${
                showSidebar ? "translate-x-0" : "-translate-x-full"
              } md:translate-x-0 transition-transform duration-200 ease-in-out`}
            >
              <div className="backdrop-blur-md bg-black/90 md:bg-black/30 h-full md:h-auto rounded-2xl p-4">
                <div className="flex justify-between items-center mb-4 md:hidden">
                  <h2 className="text-lg font-medium text-white">
                    {isAdmin ? "All Orders" : "Your Orders"}
                  </h2>
                  <button
                    onClick={() => setShowSidebar(false)}
                    className="p-2 hover:bg-white/10 rounded-lg"
                    aria-label="Close sidebar"
                  >
                    <svg
                      className="w-6 h-6 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>

                {ordersLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <LoadingSpinner size="lg" light />
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[calc(100vh-8rem)] overflow-y-auto">
                    {orders.map((order) => (
                      <OrderButton
                        key={order.id}
                        order={order}
                        isSelected={selectedOrderId === order.id}
                        isAdmin={isAdmin}
                        onClick={() => {
                          setSelectedOrderId(order.id);
                          setShowSidebar(false);
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </aside>

            {/* Chat Area */}
            <div className="md:col-span-3">
              <div className="backdrop-blur-md bg-black/30 rounded-2xl overflow-hidden">
                {selectedOrderId ? (
                  <>
                    <div className="h-[calc(100vh-16rem)] md:h-[600px]">
                      {messagesLoading ? (
                        <div className="flex items-center justify-center h-full">
                          <LoadingSpinner size="lg" light />
                        </div>
                      ) : (
                        <ChatArea
                          messages={messages}
                          messageQueue={messageQueue}
                          pendingMessages={pendingMessages}
                          unreadMessages={unreadMessages}
                          onRetry={handleRetry}
                          typingUsers={typingUsers}
                        />
                      )}
                    </div>

                    <ChatInput
                      onSubmit={sendMessage}
                      disabled={!selectedOrderId || sending}
                      value={newMessage}
                      onChange={setNewMessage}
                      onTyping={handleTyping}
                    />
                  </>
                ) : (
                  <div className="h-[calc(100vh-16rem)] md:h-[600px] flex flex-col items-center justify-center text-white/50 space-y-2">
                    <p>Select an order to start chatting</p>
                    <p className="text-sm">
                      Your conversations will appear here
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </PageContainer>
    </ErrorBoundary>
  );
}

export default React.memo(ChatPage);
