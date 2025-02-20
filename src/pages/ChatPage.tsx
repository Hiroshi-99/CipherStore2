import React, { useCallback } from "react";
import { Send, RefreshCw } from "lucide-react";
import PageContainer from "../components/PageContainer";
import LoadingSpinner from "../components/LoadingSpinner";
import { useAuth } from "../hooks/useAuth";
import { usePageTitle } from "../hooks/usePageTitle";
import { useChat } from "../hooks/useChat";
import { ErrorBoundary } from "../components/ErrorBoundary";

interface Message {
  id: string;
  content: string;
  user_name: string;
  user_avatar: string;
  is_admin: boolean;
  created_at: string;
  order_id: string;
  user_id: string;
}

interface Order {
  id: string;
  full_name: string;
  messages?: { id: string; created_at: string }[];
}

// Separate components for better performance
const MessageBubble = React.memo(function MessageBubble({
  message,
  isLatest,
  sending,
  isUnread,
  onRetry,
  isPending,
}: {
  message: Message;
  isLatest: boolean;
  sending: boolean;
  isUnread: boolean;
  onRetry: () => void;
  isPending: boolean;
}) {
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
      {!message.is_admin && (
        <img
          src={message.user_avatar || "/default-avatar.png"}
          alt="Avatar"
          className="w-8 h-8 rounded-full"
          loading="lazy"
        />
      )}
      {isPending && (
        <button
          onClick={onRetry}
          className="text-xs text-red-400 hover:text-red-300 transition-colors"
        >
          Retry
        </button>
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
    handleSendMessage,
  } = useChat(user, isAdmin);

  const handleRetry = useCallback(
    (messageId: string) => {
      const message = pendingMessages.current.get(messageId);
      if (!message) return;

      setNewMessage(message.content);
      handleSendMessage({ preventDefault: () => {} } as React.FormEvent);
    },
    [handleSendMessage, pendingMessages, setNewMessage]
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
              </div>
            </aside>

            {/* Chat Area */}
            <div className="md:col-span-3">
              <div className="backdrop-blur-md bg-black/30 rounded-2xl overflow-hidden">
                {selectedOrderId ? (
                  <>
                    <div className="h-[calc(100vh-16rem)] md:h-[600px] overflow-y-auto p-4 md:p-6 space-y-4">
                      {messagesLoading ? (
                        <div className="flex items-center justify-center h-full">
                          <LoadingSpinner size="lg" light />
                        </div>
                      ) : (
                        messages.map((message) => (
                          <MessageBubble
                            key={message.id}
                            message={message}
                            isLatest={
                              message.id === messages[messages.length - 1].id
                            }
                            sending={messageQueue.current.has(message.id)}
                            isUnread={unreadMessages.has(message.id)}
                            onRetry={() => handleRetry(message.id)}
                            isPending={pendingMessages.current.has(message.id)}
                          />
                        ))
                      )}
                    </div>

                    <form
                      onSubmit={handleSendMessage}
                      className="border-t border-white/10 p-4"
                    >
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newMessage}
                          onChange={(e) => setNewMessage(e.target.value)}
                          placeholder="Type your message..."
                          className="flex-1 bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:border-white/40"
                        />
                        <button
                          type="submit"
                          disabled={!newMessage.trim() || sending}
                          className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {sending ? (
                            <RefreshCw className="w-5 h-5 animate-spin" />
                          ) : (
                            <Send className="w-5 h-5" />
                          )}
                        </button>
                      </div>
                    </form>
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
