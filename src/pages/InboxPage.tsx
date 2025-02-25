import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ExternalLink,
  Bell,
  FileText,
  RefreshCw,
  X,
  Search,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import type { User } from "@supabase/supabase-js";
import Header from "../components/Header";
import { setPageTitle } from "../utils/title";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface InboxMessage {
  id: string;
  title: string;
  content: string;
  is_read: boolean;
  type: string;
  created_at: string;
  file_url?: string;
}

function InboxPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    setPageTitle("Inbox");
    let mounted = true;

    // Check authentication
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) {
        navigate("/");
        return;
      }
      if (mounted) {
        setUser(session.user);
        fetchMessages(session.user.id);
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        navigate("/");
        return;
      }
      if (mounted) {
        setUser(session.user);
        fetchMessages(session.user.id);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [navigate]);

  const fetchMessages = async (userId: string) => {
    try {
      setError(null);
      setRefreshing(true);

      // First get the orders with their most recent messages
      const { data: ordersData, error: ordersError } = await supabase
        .from("orders")
        .select(
          `
          id,
          full_name,
          email,
          status,
          created_at,
          chat_deleted,
          messages:messages(
            id,
            content,
            created_at,
            is_admin,
            is_read,
            user_name,
            user_avatar,
            image_url
          )
        `
        )
        .eq("user_id", userId)
        .or(`user_id.eq.${userId},is_admin.eq.true`) // Get both user's orders and admin-created ones
        .order("created_at", { ascending: false });

      if (ordersError) throw ordersError;

      // Process orders into conversation format
      const conversationsData = ordersData
        .filter((order) => !order.chat_deleted) // Don't show deleted chats
        .map((order) => {
          // Sort messages by date
          const sortedMessages = order.messages
            ? [...order.messages].sort(
                (a, b) =>
                  new Date(a.created_at).getTime() -
                  new Date(b.created_at).getTime()
              )
            : [];

          return {
            id: order.id,
            full_name: order.full_name || "Unknown",
            email: order.email,
            status: order.status,
            created_at: order.created_at,
            messages: sortedMessages,
            unreadCount: sortedMessages.filter((m) => !m.is_read && m.is_admin)
              .length,
          };
        });

      setConversations(conversationsData);
    } catch (error) {
      console.error("Error fetching messages:", error);
      setError("Failed to load conversations. Please try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    if (!user || refreshing) return;
    setRefreshing(true);
    await fetchMessages(user.id);
  };

  const markAsRead = async (messageId: string) => {
    try {
      const { error } = await supabase
        .from("inbox_messages")
        .update({ is_read: true })
        .eq("id", messageId);

      if (error) throw error;

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, is_read: true } : msg
        )
      );
    } catch (error) {
      console.error("Error marking message as read:", error);
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!user || messages.filter((m) => !m.is_read).length === 0) return;

    try {
      const { error } = await supabase
        .from("inbox_messages")
        .update({ is_read: true })
        .eq("user_id", user.id)
        .in("is_read", [false]);

      if (error) throw error;

      setMessages((prev) => prev.map((msg) => ({ ...msg, is_read: true })));

      toast.success("Marked all messages as read");
    } catch (error) {
      console.error("Error marking all as read:", error);
      toast.error("Failed to mark messages as read");
    }
  };

  const getMessageIcon = (type: string) => {
    switch (type) {
      case "payment_status":
        return <Bell className="w-5 h-5 text-blue-400" />;
      case "account_file":
        return <FileText className="w-5 h-5 text-purple-400" />;
      default:
        return null;
    }
  };

  const getMessageStatusColor = (type: string, isRead: boolean) => {
    if (!isRead) return "border-emerald-400";
    switch (type) {
      case "payment_status":
        return "border-blue-400/50";
      case "account_file":
        return "border-purple-400/50";
      default:
        return "border-white/20";
    }
  };

  const handleConversationSelect = async (conversationId: string) => {
    setSelectedConversationId(conversationId);

    // Find the conversation
    const conversation = conversations.find((c) => c.id === conversationId);
    if (!conversation) return;

    // If there are unread messages, mark them as read
    const unreadMessages = conversation.messages?.filter(
      (m) => !m.is_read && m.is_admin
    );
    if (unreadMessages && unreadMessages.length > 0) {
      try {
        // Update in database
        const { error } = await supabase
          .from("messages")
          .update({ is_read: true })
          .in(
            "id",
            unreadMessages.map((m) => m.id)
          );

        if (error) throw error;

        // Update local state
        setConversations((prev) =>
          prev.map((conv) => {
            if (conv.id === conversationId) {
              return {
                ...conv,
                messages: conv.messages?.map((msg) =>
                  unreadMessages.some((u) => u.id === msg.id)
                    ? { ...msg, is_read: true }
                    : msg
                ),
                unreadCount: 0,
              };
            }
            return conv;
          })
        );
      } catch (err) {
        console.error("Error marking messages as read:", err);
      }
    }

    // Navigate to chat
    navigate(`/chat?order=${conversationId}`);
  };

  const filteredConversations = useMemo(() => {
    return conversations.filter((conv) => {
      if (!conv) return false;

      const nameMatch =
        typeof conv.full_name === "string" &&
        conv.full_name.toLowerCase().includes(searchTerm.toLowerCase());

      const emailMatch =
        typeof conv.email === "string" &&
        conv.email.toLowerCase().includes(searchTerm.toLowerCase());

      // Also search in message content
      const messageMatch =
        conv.messages &&
        conv.messages.some(
          (msg) =>
            msg.content &&
            msg.content.toLowerCase().includes(searchTerm.toLowerCase())
        );

      return nameMatch || emailMatch || messageMatch;
    });
  }, [conversations, searchTerm]);

  const clearSearch = () => {
    setSearchTerm("");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  const unreadCount = messages.filter((msg) => !msg.is_read).length;

  return (
    <div className="min-h-screen relative">
      {/* Background Image */}
      <div
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: 'url("https://i.imgur.com/crS3FrR.jpeg")',
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "brightness(0.7)",
        }}
      />

      {/* Content */}
      <div className="relative z-10 min-h-screen">
        <Header title="INBOX" showBack user={user} />

        <main className="max-w-4xl mx-auto px-4 py-8 relative">
          <div className="backdrop-blur-md bg-black/30 p-8 rounded-2xl">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-2xl font-bold text-white">Messages</h2>
                <p className="text-white/50 text-sm mt-1">
                  {messages.length} total, {unreadCount} unread
                </p>
              </div>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="p-2 hover:bg-white/10 rounded-full transition-colors disabled:opacity-50"
                title="Refresh messages"
              >
                <RefreshCw
                  className={`w-5 h-5 text-white ${
                    refreshing ? "animate-spin" : ""
                  }`}
                />
              </button>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-3 rounded-lg mb-6">
                {error}
              </div>
            )}

            <SearchBar value={searchTerm} onChange={setSearchTerm} />

            <ConversationList
              conversations={filteredConversations}
              selectedId={selectedConversationId}
              onSelect={handleConversationSelect}
            />
          </div>
        </main>
      </div>
    </div>
  );
}

const ConversationList = React.memo(function ConversationList({
  conversations,
  selectedId,
  onSelect,
}: {
  conversations: any[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  // Group conversations by status
  const grouped = conversations.reduce((acc, conv) => {
    const status = conv.status || "other";
    if (!acc[status]) acc[status] = [];
    acc[status].push(conv);
    return acc;
  }, {} as Record<string, any[]>);

  // Define the order of status groups
  const statusOrder = ["pending", "approved", "rejected", "other"];

  // Calculate total unread messages
  const totalUnread = conversations.reduce(
    (sum, conv) => sum + (conv.unreadCount || 0),
    0
  );

  return (
    <div className="h-full overflow-y-auto">
      {totalUnread > 0 && (
        <div className="px-4 py-2 bg-blue-500/20 text-blue-300 mb-2">
          <span className="font-medium">{totalUnread}</span> unread{" "}
          {totalUnread === 1 ? "message" : "messages"}
        </div>
      )}

      {statusOrder.map((status) => {
        if (!grouped[status] || grouped[status].length === 0) return null;

        // Count unread messages in this group
        const groupUnread = grouped[status].reduce(
          (sum, conv) => sum + (conv.unreadCount || 0),
          0
        );

        return (
          <div key={status} className="mb-4">
            <h3 className="px-4 py-2 text-sm font-medium text-white/70 uppercase flex justify-between items-center">
              <span>
                {status}
                <span className="ml-2 text-white/50">
                  ({grouped[status].length})
                </span>
              </span>

              {groupUnread > 0 && (
                <span className="bg-blue-500 text-white text-xs rounded-full px-2 py-0.5">
                  {groupUnread} unread
                </span>
              )}
            </h3>

            {grouped[status].map((conversation) => {
              // Get most recent message
              const lastMessage =
                conversation.messages && conversation.messages.length > 0
                  ? conversation.messages[conversation.messages.length - 1]
                  : null;

              const hasUnread = conversation.unreadCount > 0;

              return (
                <button
                  key={conversation.id}
                  onClick={() => onSelect(conversation.id)}
                  className={`w-full text-left p-4 border-b border-gray-700 hover:bg-white/5 transition-colors ${
                    selectedId === conversation.id ? "bg-white/10" : ""
                  } ${hasUnread ? "border-l-4 border-blue-500" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-white truncate flex items-center">
                      {conversation.full_name}
                      {hasUnread && (
                        <span className="ml-2 bg-blue-500 text-white text-xs rounded-full px-2 py-0.5">
                          {conversation.unreadCount}
                        </span>
                      )}
                    </h4>
                    <span className="text-xs text-white/50">
                      {lastMessage
                        ? formatDistanceToNow(
                            new Date(lastMessage.created_at),
                            { addSuffix: true }
                          )
                        : formatDistanceToNow(
                            new Date(conversation.created_at),
                            { addSuffix: true }
                          )}
                    </span>
                  </div>

                  {lastMessage && (
                    <div className="flex items-center mt-1">
                      <p className="text-sm text-white/70 truncate flex-1">
                        {lastMessage.is_admin ? "Support: " : "You: "}
                        {lastMessage.content}
                      </p>

                      {lastMessage.image_url && (
                        <span className="text-blue-400 ml-1 flex-shrink-0">
                          <FileText size={14} />
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        );
      })}

      {conversations.length === 0 && !loading && (
        <div className="text-center p-8 text-white/50">
          No conversations found
          {searchTerm && (
            <>
              <div className="mt-2">No results for "{searchTerm}"</div>
              <button
                className="mt-2 text-blue-400 hover:underline"
                onClick={clearSearch}
              >
                Clear search
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
});

const SearchBar = React.memo(function SearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="px-4 py-3 border-b border-gray-700 sticky top-0 bg-gray-900 z-10">
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search conversations..."
          className="w-full p-2 pl-8 bg-white/10 border border-white/20 rounded text-white"
        />
        <Search className="absolute left-2 top-2.5 text-white/50" size={16} />
        {value && (
          <button
            onClick={() => onChange("")}
            className="absolute right-2 top-2.5 text-white/50 hover:text-white"
            aria-label="Clear search"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
});

export default InboxPage;
