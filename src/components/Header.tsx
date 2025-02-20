import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Inbox, MessageCircle, LogOut } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

interface HeaderProps {
  title: string;
  showBack?: boolean;
  user?: User | null;
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
              className="p-2 hover:bg-white/10 rounded-lg transition-colors relative group"
            >
              <MessageCircle className="w-5 h-5 text-white" />
              <span className="absolute -bottom-12 left-1/2 -translate-x-1/2 bg-black/80 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                Chat Support
              </span>
            </Link>
            <Link
              to="/inbox"
              className="p-2 hover:bg-white/10 rounded-lg transition-colors relative group"
            >
              <Inbox className="w-5 h-5 text-white" />
              <span className="absolute -bottom-12 left-1/2 -translate-x-1/2 bg-black/80 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                Inbox
              </span>
            </Link>
            <div className="flex items-center gap-3 pl-4 border-l border-white/10">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-white">
                  {user.user_metadata.full_name || user.email}
                </span>
                <span className="text-xs text-white/50">
                  {user.user_metadata.full_name ? user.email : "User"}
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors relative group"
              >
                <LogOut className="w-5 h-5 text-white" />
                <span className="absolute -bottom-12 left-1/2 -translate-x-1/2 bg-black/80 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                  Logout
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

export default Header;
