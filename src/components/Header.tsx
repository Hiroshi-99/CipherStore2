import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  ArrowLeft,
  MessageCircle,
  Inbox,
  LogOut,
  User,
  Settings,
  Bell,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import type { User as SupabaseUser } from "@supabase/supabase-js";

interface HeaderProps {
  title: string;
  showBack?: boolean;
  user: SupabaseUser | null;
}

function Header({ title, showBack = false, user }: HeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [showDropdown, setShowDropdown] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="bg-black/30 backdrop-blur-md border-b border-white/10 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {showBack && (
            <button
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
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
              className={`p-2 rounded-lg transition-colors flex items-center gap-2 ${
                isActive("/chat")
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "text-white hover:bg-white/10"
              }`}
            >
              <MessageCircle className="w-5 h-5" />
              <span className="hidden sm:inline">Chat</span>
            </Link>

            <Link
              to="/inbox"
              className={`p-2 rounded-lg transition-colors flex items-center gap-2 ${
                isActive("/inbox")
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "text-white hover:bg-white/10"
              }`}
            >
              <Inbox className="w-5 h-5" />
              <span className="hidden sm:inline">Inbox</span>
            </Link>

            {/* User Profile Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                className={`flex items-center gap-2 p-2 rounded-lg transition-colors ${
                  showDropdown ? "bg-white/10" : "hover:bg-white/10"
                }`}
              >
                <img
                  src={user.user_metadata.avatar_url || "/default-avatar.png"}
                  alt="Avatar"
                  className="w-8 h-8 rounded-full border-2 border-emerald-500/50"
                />
                <span className="hidden sm:inline text-white">
                  {user.user_metadata.full_name || user.email}
                </span>
              </button>

              {/* Dropdown Menu */}
              {showDropdown && (
                <div
                  className="absolute right-0 top-full mt-2 w-64 bg-black/90 backdrop-blur-md border border-white/10 rounded-lg shadow-lg"
                  onClick={() => setShowDropdown(false)}
                >
                  <div className="p-4 border-b border-white/10">
                    <p className="text-sm text-white/70">Signed in as</p>
                    <p className="font-medium text-white truncate">
                      {user.email}
                    </p>
                  </div>

                  <div className="p-2">
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-4 py-2 text-white hover:bg-white/10 rounded-md transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

export default Header;
