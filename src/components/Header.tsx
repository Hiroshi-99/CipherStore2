import React from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Bell,
  User,
  LogOut,
  Inbox,
  MessageCircle,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import type { User as SupabaseUser } from "@supabase/supabase-js";

interface HeaderProps {
  title: string;
  showBack?: boolean;
  user: SupabaseUser | null;
  onLogout?: () => Promise<void>;
}

interface DiscordProfile {
  username?: string;
  avatar_url?: string;
}

function Header({ title, showBack = false, user, onLogout }: HeaderProps) {
  const navigate = useNavigate();
  const unreadCount = 0; // TODO: Implement unread count

  const getDiscordProfile = (): DiscordProfile => {
    return user?.user_metadata || {};
  };

  const handleLogout = async () => {
    if (onLogout) {
      await onLogout();
    } else {
      await supabase.auth.signOut();
    }
    navigate("/");
  };

  return (
    <header className="bg-black/30 backdrop-blur-sm border-b border-white/10">
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {showBack && (
              <button
                onClick={() => navigate(-1)}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
                title="Go back"
              >
                <ArrowLeft className="w-5 h-5 text-white" />
              </button>
            )}
            <h1 className="text-xl font-bold text-white">{title}</h1>
          </div>
          {user && (
            <div className="flex items-center gap-2">
              <Link
                to="/chat"
                className="p-2 hover:bg-white/10 rounded-full transition-colors relative"
                title="Chat"
              >
                <MessageCircle className="w-5 h-5 text-white" />
              </Link>
              <Link
                to="/inbox"
                className="p-2 hover:bg-white/10 rounded-full transition-colors relative"
                title="Inbox"
              >
                <Inbox className="w-5 h-5 text-white" />
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;
