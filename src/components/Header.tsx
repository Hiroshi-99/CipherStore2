import React, { useEffect, useState } from "react";
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
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (user) {
      fetchUnreadCount();
      // Subscribe to changes in inbox_messages
      const subscription = supabase
        .channel("inbox_changes")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "inbox_messages",
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            fetchUnreadCount();
          }
        )
        .subscribe();

      return () => {
        subscription.unsubscribe();
      };
    }
  }, [user]);

  const fetchUnreadCount = async () => {
    if (!user) return;

    const { count, error } = await supabase
      .from("inbox_messages")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false);

    if (!error && count !== null) {
      setUnreadCount(count);
    }
  };

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
          <button
            onClick={() => navigate("/")}
            className="text-white flex items-center gap-2 hover:text-emerald-400 transition-colors"
          >
            <ArrowLeft size={24} />
            Back to Store
          </button>
        )}
        <h1 className="text-4xl font-bold text-emerald-400">{title}</h1>
      </div>

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
    </header>
  );
}

export default Header;
