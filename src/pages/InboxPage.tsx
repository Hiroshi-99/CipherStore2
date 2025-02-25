import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ExternalLink, Bell, FileText, RefreshCw, X } from "lucide-react";
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
      const { data, error } = await supabase
        .from("inbox_messages")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setMessages(data || []);
      setConversations(data || []);
    } catch (error) {
      console.error("Error fetching messages:", error);
      setError("Failed to load messages. Please try again.");
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

  const handleConversationSelect = (id: string) => {
    setSelectedConversationId(id);
  };

  const filteredConversations = conversations.filter((conv) =>
    conv.full_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

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

  return (
    <div className="h-full overflow-y-auto">
      {statusOrder.map((status) => {
        if (!grouped[status] || grouped[status].length === 0) return null;

        return (
          <div key={status} className="mb-4">
            <h3 className="px-4 py-2 text-sm font-medium text-white/70 uppercase">
              {status}
              <span className="ml-2 text-white/50">
                ({grouped[status].length})
              </span>
            </h3>

            {grouped[status].map((conversation) => {
              const hasUnread = conversation.messages?.some(
                (m: any) => !m.is_read && m.is_admin
              );
              const lastMessage =
                conversation.messages?.[conversation.messages.length - 1];

              return (
                <button
                  key={conversation.id}
                  onClick={() => onSelect(conversation.id)}
                  className={`w-full text-left p-4 border-b border-gray-700 hover:bg-white/5 transition-colors ${
                    selectedId === conversation.id ? "bg-white/10" : ""
                  } ${hasUnread ? "border-l-4 border-blue-500" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-white truncate">
                      {conversation.full_name}
                      {hasUnread && (
                        <span className="ml-2 bg-blue-500 text-white text-xs rounded-full px-2 py-0.5">
                          New
                        </span>
                      )}
                    </h4>
                    <span className="text-xs text-white/50">
                      {lastMessage
                        ? formatDistanceToNow(
                            new Date(lastMessage.created_at),
                            { addSuffix: true }
                          )
                        : ""}
                    </span>
                  </div>

                  {lastMessage && (
                    <p className="text-sm text-white/70 mt-1 truncate">
                      {lastMessage.is_admin ? "Admin: " : ""}
                      {lastMessage.content}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        );
      })}
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
    <div className="px-4 py-3 border-b border-gray-700">
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
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
});

export default InboxPage;
