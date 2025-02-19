import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ExternalLink, Bell, FileText, RefreshCw } from "lucide-react";
import { supabase } from "../lib/supabase";
import type { User } from "@supabase/supabase-js";
import Header from "../components/Header";
import { setPageTitle } from "../utils/title";

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

  useEffect(() => {
    let mounted = true;

    setPageTitle("Inbox");

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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  const unreadCount = messages.filter((msg) => !msg.is_read).length;

  return (
    <div className="min-h-screen bg-gray-900">
      <Header title="INBOX" showBack user={user} />

      <main className="max-w-4xl mx-auto px-4 py-8">
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

          {messages.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-white/70 text-lg">No messages yet</p>
              <p className="text-white/50 text-sm mt-2">
                New messages will appear here
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`bg-white/5 hover:bg-white/10 p-6 rounded-lg border-l-4 transition-all cursor-pointer ${getMessageStatusColor(
                    message.type,
                    message.is_read
                  )}`}
                  onClick={() => !message.is_read && markAsRead(message.id)}
                >
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {getMessageIcon(message.type)}
                        <h3 className="text-lg font-medium text-white">
                          {message.title}
                        </h3>
                      </div>
                      <p className="text-white/80 mb-3">{message.content}</p>
                      {message.file_url && (
                        <div className="flex items-center gap-2 text-emerald-400 hover:text-emerald-300 transition-colors">
                          <ExternalLink size={16} />
                          <a
                            href={message.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            View Attached File
                          </a>
                        </div>
                      )}
                      <p className="text-sm text-white/40 mt-3">
                        {new Date(message.created_at).toLocaleString()}
                      </p>
                    </div>
                    {!message.is_read && (
                      <span className="bg-emerald-400/20 text-emerald-400 text-xs px-2 py-1 rounded-full">
                        New
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default InboxPage;
