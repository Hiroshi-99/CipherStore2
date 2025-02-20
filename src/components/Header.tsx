import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Inbox, MessageCircle } from "lucide-react";
import type { User } from "@supabase/supabase-js";

interface HeaderProps {
  title: string;
  showBack?: boolean;
  user?: User | null;
}

function Header({ title, showBack = false, user }: HeaderProps) {
  const navigate = useNavigate();

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
              <span className="absolute -bottom-12 left-1/2 -translate-x-1/2 px-2 py-1 bg-black/80 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                Chat Support
              </span>
            </Link>
            <Link
              to="/inbox"
              className="p-2 hover:bg-white/10 rounded-lg transition-colors relative group"
            >
              <Inbox className="w-5 h-5 text-white" />
              <span className="absolute -bottom-12 left-1/2 -translate-x-1/2 px-2 py-1 bg-black/80 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity">
                Inbox
              </span>
            </Link>
            <div className="flex items-center gap-3 px-3 py-1.5 bg-white/10 rounded-lg">
              <img
                src={user.user_metadata.avatar_url || "/default-avatar.png"}
                alt="Avatar"
                className="w-6 h-6 rounded-full"
              />
              <span className="text-sm text-white">
                {user.user_metadata.full_name || user.email}
              </span>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

export default Header;
