import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, MessageCircle, Inbox, LogOut, User } from "lucide-react";
import { supabase } from "../lib/supabase";
import type { User } from "@supabase/supabase-js";

interface HeaderProps {
  title: string;
  showBack?: boolean;
  user: User | null;
}

function Header({ title, showBack = false, user }: HeaderProps) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  return (
    <header className="bg-black/30 backdrop-blur-md border-b border-white/10">
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
          <div className="flex items-center gap-4">
            <Link
              to="/chat"
              className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white flex items-center gap-2"
            >
              <MessageCircle className="w-5 h-5" />
              <span className="hidden sm:inline">Chat</span>
            </Link>
            <Link
              to="/inbox"
              className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white flex items-center gap-2"
            >
              <Inbox className="w-5 h-5" />
              <span className="hidden sm:inline">Inbox</span>
            </Link>

            {/* User Profile Dropdown */}
            <div className="relative group">
              <button className="flex items-center gap-2 p-2 hover:bg-white/10 rounded-lg transition-colors text-white">
                <img
                  src={user.user_metadata.avatar_url || "/default-avatar.png"}
                  alt="Avatar"
                  className="w-8 h-8 rounded-full"
                />
                <span className="hidden sm:inline">
                  {user.user_metadata.full_name || user.email}
                </span>
              </button>

              {/* Dropdown Menu */}
              <div className="absolute right-0 top-full mt-2 w-48 bg-black/90 backdrop-blur-md border border-white/10 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                <div className="p-2">
                  <div className="px-4 py-2 text-sm text-white/70">
                    Signed in as
                    <div className="font-medium text-white truncate">
                      {user.email}
                    </div>
                  </div>
                  <div className="border-t border-white/10 my-1"></div>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-white hover:bg-white/10 rounded-md transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

export default Header;
