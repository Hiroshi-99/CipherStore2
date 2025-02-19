import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Send, ArrowLeft } from "lucide-react";
import { supabase } from "../lib/supabase";
import type { User } from "@supabase/supabase-js";

interface Message {
  id: string;
  created_at: string;
  content: string;
  user_id: string;
  order_id: string;
  is_admin: boolean;
  user_avatar?: string;
  user_name?: string;
  discord_message_id?: string;
}

interface DiscordWebhookMessage {
  id: string;
  content: string;
  author: {
    id: string;
    username: string;
    avatar?: string;
    bot?: boolean;
  };
  timestamp: string;
}

// Update the API endpoints
const API_ENDPOINTS = {
  createChannel: "/.netlify/functions/discord-create-channel",
  sendMessage: "/.netlify/functions/discord-send-message",
  getMessages: "/.netlify/functions/discord-get-messages",
};

function ChatPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [order, setOrder] = useState<any>(null);
  const [discordChannel, setDiscordChannel] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [typingTimeout, setTypingTimeout] = useState<NodeJS.Timeout | null>(
    null
  );

  useEffect(() => {
    // Check authentication and get order
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) {
        navigate("/");
        return;
      }
      setUser(session.user);

      // Get user's latest order and associated Discord channel
      supabase
        .from("orders")
        .select(
          `
          *,
          discord_channels (
            channel_id,
            webhook_url
          )
        `
        )
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single()
        .then(({ data: orderData, error }) => {
          console.log("Order data:", orderData);
          console.log("Order error:", error);
          if (error || !orderData) {
            navigate("/");
            return;
          }
          setOrder(orderData);
          if (orderData.discord_channels?.channel_id) {
            setDiscordChannel(orderData.discord_channels.channel_id);
            // Fetch initial messages from Discord channel
            fetchDiscordMessages(orderData.discord_channels.channel_id);
          } else {
            // Create new Discord channel for this order
            createDiscordChannel(orderData.id, session.user);
          }
          setLoading(false);
        });
    });

    // Subscribe to new messages
    const channel = supabase
      .channel("chat_messages")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `order_id=eq.${order?.id}`,
        },
        (payload) => {
          console.log("Received new message:", payload.new);
          const newMessage = payload.new as Message;
          setMessages((current) => [...current, newMessage]);
          scrollToBottom();
        }
      )
      .subscribe((status) => {
        console.log("Subscription status:", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [navigate, order?.id]);

  useEffect(() => {
    // Load existing messages when order is set
    if (order) {
      console.log("Fetching messages for order:", order.id);
      supabase
        .from("messages")
        .select("*")
        .eq("order_id", order.id)
        .order("created_at", { ascending: true })
        .then(({ data, error }) => {
          console.log("Fetched messages:", data);
          console.log("Fetch error:", error);
          if (data) {
            setMessages(data);
            scrollToBottom();
          }
        });
    }
  }, [order]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const getAuthHeaders = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token}`,
    };
  };

  const createDiscordChannel = async (orderId: string, user: User) => {
    try {
      const headers = await getAuthHeaders();
      console.log("Creating Discord channel for order:", orderId);

      const response = await fetch(API_ENDPOINTS.createChannel, {
        method: "POST",
        headers,
        body: JSON.stringify({
          orderId,
          userId: user.id,
          username: user.user_metadata.full_name || user.email,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          `HTTP error! status: ${response.status}, details: ${
            errorData.details || errorData.error || "Unknown error"
          }`
        );
      }

      const { channelId, webhookUrl } = await response.json();

      // Store Discord channel info in Supabase
      const { error } = await supabase.from("discord_channels").insert([
        {
          order_id: orderId,
          channel_id: channelId,
          webhook_url: webhookUrl,
        },
      ]);

      if (error) {
        console.error("Supabase error:", error);
        throw error;
      }

      setDiscordChannel(channelId);
    } catch (error) {
      console.error("Error creating Discord channel:", error);
      alert(
        `Failed to create Discord channel. Please try again. Error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  };

  const fetchDiscordMessages = async (channelId: string) => {
    try {
      const headers = await getAuthHeaders();
      console.log("Fetching Discord messages for channel:", channelId);
      const response = await fetch(
        `${API_ENDPOINTS.getMessages}/${channelId}`,
        {
          headers,
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          `HTTP error! status: ${response.status}, details: ${
            errorData.details || errorData.error || "Unknown error"
          }`
        );
      }

      const messages: DiscordWebhookMessage[] = await response.json();
      console.log("Fetched Discord messages:", messages);

      if (messages.length === 0) {
        console.log("No messages found for this channel.");
        setMessages([]);
        return;
      }

      // Convert Discord messages to our format
      const formattedMessages: Message[] = messages.map((msg) => ({
        id: msg.id,
        created_at: msg.timestamp,
        content: msg.content,
        user_id: msg.author.bot ? "admin" : user?.id || "",
        order_id: order?.id || "",
        is_admin: !!msg.author.bot,
        user_avatar: msg.author.avatar,
        user_name: msg.author.username,
        discord_message_id: msg.id,
      }));

      console.log("Formatted messages:", formattedMessages);
      setMessages(formattedMessages);
      scrollToBottom();
    } catch (error) {
      console.error("Error fetching Discord messages:", error);
      alert("Failed to load messages. Please refresh the page.");
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user || !order || !discordChannel) return;

    try {
      const headers = await getAuthHeaders();
      const response = await fetch(API_ENDPOINTS.sendMessage, {
        method: "POST",
        headers,
        body: JSON.stringify({
          channelId: discordChannel,
          content: newMessage.trim(),
          username: user.user_metadata.full_name,
          avatar_url: user.user_metadata.avatar_url,
          orderId: order.id,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const discordMessage = await response.json();

      // Store message in Supabase
      const { error } = await supabase.from("messages").insert([
        {
          content: newMessage.trim(),
          user_id: user.id,
          order_id: order.id,
          is_admin: false,
          user_avatar: user.user_metadata.avatar_url,
          user_name: user.user_metadata.full_name,
          discord_message_id: discordMessage.id,
        },
      ]);

      if (error) throw error;
      setNewMessage("");
    } catch (error) {
      console.error("Error sending message:", error);
      alert("Failed to send message. Please try again.");
    }
  };

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);

    if (e.target.value.trim() !== "") {
      setIsTyping(true);
      if (typingTimeout) clearTimeout(typingTimeout);
      setTypingTimeout(
        setTimeout(() => {
          setIsTyping(false);
        }, 3000)
      );
    } else {
      setIsTyping(false);
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
    <div className="min-h-screen relative">
      {/* Background */}
      <div
        className="absolute inset-0 z-0"
        style={{
          backgroundImage:
            'url("https://images.unsplash.com/photo-1623984109622-f9c970ba32fc?q=80&w=2940")',
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "brightness(0.7)",
        }}
      />

      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Header */}
        <header className="p-6 flex justify-between items-center bg-black/30 backdrop-blur-md">
          <button
            onClick={() => navigate("/")}
            className="text-white flex items-center gap-2 hover:text-emerald-400 transition-colors"
          >
            <ArrowLeft size={24} />
            Back to Store
          </button>
          <h1 className="text-2xl font-bold text-emerald-400">Order Support</h1>
        </header>

        {/* Chat Container */}
        <div className="flex-1 overflow-hidden flex flex-col p-4">
          <div className="flex-1 overflow-y-auto space-y-4 pb-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex items-start gap-3 ${
                  message.user_id === user?.id ? "justify-end" : ""
                }`}
              >
                {message.is_admin && (
                  <img
                    src="/admin-avatar.png"
                    alt="Admin"
                    className="w-8 h-8 rounded-full"
                  />
                )}
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    message.user_id === user?.id
                      ? "bg-emerald-500 text-white"
                      : "bg-white/10 text-white"
                  }`}
                >
                  <div className="text-sm opacity-75 mb-1">
                    {message.is_admin ? "Support Team" : message.user_name}
                  </div>
                  <div>{message.content}</div>
                </div>
                {message.user_id === user?.id && message.user_avatar && (
                  <img
                    src={message.user_avatar}
                    alt="User"
                    className="w-8 h-8 rounded-full"
                  />
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Message Input */}
          <form
            onSubmit={handleSendMessage}
            className="mt-4 flex gap-2 bg-black/30 backdrop-blur-md p-4 rounded-lg"
          >
            <input
              type="text"
              value={newMessage}
              onChange={handleTyping}
              placeholder="Type your message..."
              className="flex-1 bg-white/10 border border-white/20 rounded-md px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
            <button
              type="submit"
              className="bg-emerald-500 hover:bg-emerald-600 text-white p-2 rounded-md transition-colors"
              disabled={!newMessage.trim()}
            >
              <Send size={20} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default ChatPage;
