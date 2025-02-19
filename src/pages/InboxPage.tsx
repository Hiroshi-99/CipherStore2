import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Bell, CheckCircle, XCircle } from "lucide-react";
import { supabase } from "../lib/supabase";
import type { User } from "@supabase/supabase-js";
import Header from "../components/Header";

interface InboxMessage {
  id: string;
  title: string;
  content: string;
  is_read: boolean;
  type: string;
  created_at: string;
}

function InboxPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<InboxMessage[]>([]);

  useEffect(() => {
    let mounted = true;

    // Check authentication
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) {
        navigate("/");
        return;
      }
      if (mounted) {
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
      const { data, error } = await supabase
        .from("inbox_messages")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error("Error fetching messages:", error);
    } finally {
      setLoading(false);
    }
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

  const getMessageIcon = (message: InboxMessage) => {
    if (message.type === "payment_status") {
      if (message.title.toLowerCase().includes("approved")) {
        return <CheckCircle className="text-emerald-400" size={24} />;
      }
      if (message.title.toLowerCase().includes("rejected")) {
        return <XCircle className="text-red-400" size={24} />;
      }
      return <Bell className="text-yellow-400" size={24} />;
    }
    return null;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-pulse text-white text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      <Header title="INBOX" showBack user={user} />

      <main className="max-w-3xl mx-auto px-4 py-8">
        {messages.length === 0 ? (
          <div className="text-center py-12">
            <Bell className="mx-auto text-white/20 mb-4" size={48} />
            <p className="text-white text-lg">No messages yet</p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`bg-black/30 backdrop-blur-md rounded-lg p-6 transition-all hover:bg-black/40 cursor-pointer ${
                  !message.is_read ? "border-l-4 border-emerald-400" : ""
                }`}
                onClick={() => !message.is_read && markAsRead(message.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                      {message.title}
                      {!message.is_read && (
                        <span className="bg-emerald-400 text-black text-xs px-2 py-1 rounded-full">
                          New
                        </span>
                      )}
                    </h3>
                    <p className="text-white/70">{message.content}</p>
                  </div>
                  <div className="ml-4 shrink-0">{getMessageIcon(message)}</div>
                </div>
                <div className="mt-4 text-sm text-white/50">
                  {new Date(message.created_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default InboxPage;
