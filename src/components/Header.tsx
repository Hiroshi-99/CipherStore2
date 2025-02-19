import React, { useEffect, useState } from "react";
import { ArrowLeft, Bell, User, LogOut } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { isAdmin } from "../lib/auth";

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
  const [isAdminUser, setIsAdminUser] = useState(false);

  useEffect(() => {
    checkAdminStatus();
  }, [user]);

  const checkAdminStatus = async () => {
    if (user) {
      const adminStatus = await isAdmin(user.id);
      setIsAdminUser(adminStatus);
    }
  };

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
    <header className="p-6 flex justify-between items-center bg-black/30">
      <div className="flex items-center gap-4">
        {showBack && (
          <Link
            to="/"
            className="text-white/70 hover:text-white transition-colors"
          >
            <ArrowLeft size={24} />
          </Link>
        )}
        <h1 className="text-4xl font-bold text-emerald-400">{title}</h1>
      </div>

      <div className="flex items-center gap-4">
        {user && (
          <>
            <Link
              to="/inbox"
              className="relative text-white hover:text-emerald-400 transition-colors"
            >
              <Bell size={24} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </Link>
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

      <nav className="flex items-center gap-4">
        {isAdminUser && (
          <Link
            to="/admin"
            className="text-white/70 hover:text-white transition-colors"
          >
            Admin
          </Link>
        )}
      </nav>
    </header>
  );
}

export default Header;
