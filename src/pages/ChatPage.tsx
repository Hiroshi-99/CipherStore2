import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import Header from "../components/Header";
import { Send, RefreshCw, Paperclip, X } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { setPageTitle } from "../utils/title";

interface Message {
  id: string;
  content: string;
  user_name: string;
  user_avatar: string;
  is_admin: boolean;
  created_at: string;
  attachment_url?: string;
}

function ChatPage() {
  const [user, setUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPageTitle("Chat");
    checkUser();
    fetchMessages();
    const messagesSubscription = subscribeToMessages();
    return () => {
      messagesSubscription?.unsubscribe();
    };
  }, []);

  const checkUser = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.user) {
      setUser(session.user);
      const { data: adminData } = await supabase
        .from("admin_users")
        .select("*")
        .eq("user_id", session.user.id)
        .single();
      setIsAdmin(!!adminData);
    }
  };

  const fetchMessages = async () => {
    try {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .order("created_at", { ascending: true });

      if (error) throw error;
      setMessages(data || []);
      setTimeout(scrollToBottom, 100);
    } catch (error) {
      console.error("Error fetching messages:", error);
      setError("Failed to load messages");
    } finally {
      setLoading(false);
    }
  };

  const subscribeToMessages = () => {
    return supabase
      .channel("messages")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setMessages((prev) => [...prev, payload.new as Message]);
            scrollToBottom();
          }
        }
      )
      .subscribe();
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleAttachment = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        // 5MB limit
        alert("File size must be less than 5MB");
        return;
      }
      setAttachment(file);
    }
  };

  const uploadAttachment = async () => {
    if (!attachment) return null;
    setIsUploading(true);
    try {
      const fileName = `${Date.now()}-${attachment.name}`;
      const { data, error } = await supabase.storage
        .from("chat-attachments")
        .upload(fileName, attachment);

      if (error) throw error;

      const {
        data: { publicUrl },
      } = supabase.storage.from("chat-attachments").getPublicUrl(data.path);

      return publicUrl;
    } catch (error) {
      console.error("Error uploading attachment:", error);
      throw error;
    } finally {
      setIsUploading(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newMessage.trim() && !attachment) || sending) return;

    setSending(true);
    try {
      let attachmentUrl;
      if (attachment) {
        attachmentUrl = await uploadAttachment();
      }

      const { error: messageError } = await supabase.from("messages").insert([
        {
          content: newMessage.trim(),
          user_id: user?.id,
          is_admin: isAdmin,
          user_name: user?.user_metadata.full_name || user?.email,
          user_avatar: user?.user_metadata.avatar_url,
          attachment_url: attachmentUrl,
        },
      ]);

      if (messageError) throw messageError;
      setNewMessage("");
      setAttachment(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      console.error("Error sending message:", error);
      setError("Failed to send message");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen relative">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center">
          <div className="text-white text-lg">Loading messages...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative">
      {/* Background */}
      <div
        className="absolute inset-0 z-0"
        style={{
          backgroundImage:
            'url("https://cdn.discordapp.com/attachments/1335202613913849857/1341847795807813815/wallpaperflare.com_wallpaper.jpg?ex=67b77ca4&is=67b62b24&hm=17f869720e0d7d178e5a1d6140243b37f248c32e837142aded205cd3c4453de1&")',
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "brightness(0.7)",
        }}
      />

      {/* Content */}
      <div className="relative z-10">
        <Header title="CHAT" showBack user={user} />

        <main className="max-w-4xl mx-auto px-4 py-8">
          <div className="backdrop-blur-md bg-black/30 rounded-2xl overflow-hidden">
            {error && (
              <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-2 m-4 rounded-lg">
                {error}
              </div>
            )}

            {/* Messages Container */}
            <div className="h-[600px] overflow-y-auto p-6 space-y-4">
              {messages.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-white/70 text-lg">No messages yet</p>
                  <p className="text-white/50 text-sm mt-2">
                    Start the conversation by sending a message
                  </p>
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex items-start gap-3 ${
                      message.is_admin ? "justify-start" : "justify-end"
                    }`}
                  >
                    {message.is_admin && (
                      <img
                        src={message.user_avatar || "/default-avatar.png"}
                        alt="Avatar"
                        className="w-8 h-8 rounded-full"
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
                      <p className="text-white/90 whitespace-pre-wrap">
                        {message.content}
                      </p>
                      {message.attachment_url && (
                        <a
                          href={message.attachment_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 text-emerald-400 hover:underline flex items-center gap-1 text-sm"
                        >
                          <Paperclip className="w-4 h-4" />
                          View Attachment
                        </a>
                      )}
                    </div>
                    {!message.is_admin && (
                      <img
                        src={message.user_avatar || "/default-avatar.png"}
                        alt="Avatar"
                        className="w-8 h-8 rounded-full"
                      />
                    )}
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <form
              onSubmit={handleSendMessage}
              className="border-t border-white/10 p-4"
            >
              {attachment && (
                <div className="mb-2 px-3 py-2 bg-white/5 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-2 text-white/80">
                    <Paperclip className="w-4 h-4" />
                    <span className="text-sm truncate">{attachment.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAttachment(null)}
                    className="text-white/50 hover:text-white/80"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type your message..."
                  className="flex-1 bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:border-white/40"
                />
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleAttachment}
                  className="hidden"
                  accept="image/*,.pdf,.doc,.docx"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
                >
                  <Paperclip className="w-5 h-5" />
                </button>
                <button
                  type="submit"
                  disabled={
                    (!newMessage.trim() && !attachment) ||
                    sending ||
                    isUploading
                  }
                  className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-w-[100px] justify-center"
                >
                  {sending || isUploading ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      <span>{isUploading ? "Uploading..." : "Sending..."}</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      <span>Send</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}

export default ChatPage;
