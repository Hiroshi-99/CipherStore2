import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button";
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
  file_url?: string;
}

function InboxPage() {
  const navigate = useNavigate();
  const [, setUser] = useState<User | null>(null);
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative bg-gray-900">
      <Header title="INBOX" showBack user={null} />

      <main className="flex items-center justify-center px-4 py-12">
        <div className="backdrop-blur-md bg-black/30 p-8 rounded-2xl w-full max-w-4xl">
          <div className="text-white mb-8">
            <h2 className="text-2xl font-bold mb-2">Inbox</h2>
          </div>

          {messages.length === 0 ? (
            <div className="text-white text-xl">No messages yet</div>
          ) : (
            <div className="space-y-6">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className="bg-white/10 p-4 rounded-lg"
                  onClick={() => markAsRead(message.id)}
                >
                  <h3 className="text-lg font-medium text-white mb-2">
                    {message.title}
                  </h3>
                  <p className="text-white/80 mb-2">{message.content}</p>
                  {message.file_url && (
                    <div className="text-white">
                      <p>Attached File:</p>
                      <a
                        href={message.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-400 hover:underline"
                      >
                        {message.file_url}
                      </a>
                    </div>
                  )}
                  <p className="text-sm text-white/50">
                    {new Date(message.created_at).toLocaleString()}
                  </p>
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
