import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Bell, CheckCircle, XCircle } from "lucide-react";
import { supabase } from "../lib/supabase";
import type { User } from "@supabase/supabase-js";

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
  const [_user, setUser] = useState<User | null>(null);
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      <header className="p-6 flex justify-between items-center bg-black/30">
        <button
          onClick={() => navigate("/")}
          className="text-white flex items-center gap-2 hover:text-emerald-400 transition-colors"
        >
          <ArrowLeft size={24} />
          Back to Store
        </button>
        <h1 className="text-4xl font-bold text-emerald-400">INBOX</h1>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {messages.length === 0 ? (
          <div className="text-white text-center py-8">No messages yet</div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`bg-black/30 backdrop-blur-md rounded-lg p-6 ${
                  !message.is_read ? "border-l-4 border-emerald-400" : ""
                }`}
                onClick={() => !message.is_read && markAsRead(message.id)}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-2">
                      {message.title}
                    </h3>
                    <p className="text-white/70">{message.content}</p>
                  </div>
                  {message.type === "payment_status" && (
                    <div className="ml-4">
                      {message.title.toLowerCase().includes("approved") ? (
                        <CheckCircle className="text-emerald-400" size={24} />
                      ) : message.title.toLowerCase().includes("rejected") ? (
                        <XCircle className="text-red-400" size={24} />
                      ) : (
                        <Bell className="text-yellow-400" size={24} />
                      )}
                    </div>
                  )}
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
