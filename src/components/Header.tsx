import React from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, Bell, User, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
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
  const location = useLocation();
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
    <header className="bg-black/30 backdrop-blur-md border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {showBack && (
            <Link
              to="/"
              className="text-white/70 hover:text-white transition-colors"
            >
              <ArrowLeft />
            </Link>
          )}
          <h1 className="text-xl font-bold text-white">{title}</h1>
        </div>

        {user && (
          <nav className="flex items-center gap-6">
            <Link
              to="/"
              className={`text-sm ${
                location.pathname === "/"
                  ? "text-white"
                  : "text-white/70 hover:text-white"
              } transition-colors`}
            >
              Store
            </Link>
            <Link
              to="/order"
              className={`text-sm ${
                location.pathname === "/order"
                  ? "text-white"
                  : "text-white/70 hover:text-white"
              } transition-colors`}
            >
              Order
            </Link>
            <Link
              to="/chat"
              className={`text-sm ${
                location.pathname === "/chat"
                  ? "text-white"
                  : "text-white/70 hover:text-white"
              } transition-colors`}
            >
              Chat
            </Link>
            <Link
              to="/inbox"
              className={`text-sm ${
                location.pathname === "/inbox"
                  ? "text-white"
                  : "text-white/70 hover:text-white"
              } transition-colors`}
            >
              Inbox
            </Link>
          </nav>
        )}

        <div className="flex items-center gap-4">
          {user && (
            <>
              <button
                onClick={() => navigate("/inbox")}
                className="relative text-white hover:text-emerald-400 transition-colors"
              >
                <Bell size={24} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>
              <div className="flex items-center gap-3">
                {getDiscordProfile().avatar_url ? (
                  <img
                    src={getDiscordProfile().avatar_url}
                    alt="Profile"
                    className="w-8 h-8 rounded-full border-2 border-emerald-400"
                  />
                ) : (
                  <User className="w-8 h-8 text-emerald-400" />
                )}
                <span className="text-white">
                  {getDiscordProfile().username || "User"}
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="text-white hover:text-emerald-400 transition-colors"
              >
                <LogOut size={24} />
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;
