import React, { useEffect, useState } from "react";
import { ShoppingCart, Check, LogOut, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import Header from "../components/Header";

interface DiscordProfile {
  username?: string;
  avatar_url?: string;
}

function StorePage() {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for changes on auth state (sign in, sign out, etc.)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Handle OAuth callback
    if (window.location.hash.includes("access_token")) {
      // The hash contains the OAuth response
      // Supabase client will automatically handle this
      return;
    }

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleDiscordLogin = async () => {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "discord",
        options: {
          redirectTo: window.location.origin + window.location.pathname,
          scopes: "identify guilds.join",
        },
      });

      if (error) throw error;

      // After successful auth, try to add user to guild
      if (data?.session) {
        const headers = await getAuthHeaders();
        const response = await fetch("/.netlify/functions/discord-add-member", {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          console.error("Failed to add user to Discord guild");
        }
      }
    } catch (error) {
      console.error("Error logging in with Discord:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  const getDiscordProfile = (): DiscordProfile => {
    return user?.user_metadata || {};
  };

  const handlePurchase = () => {
    if (user) {
      navigate("/order");
    } else {
      handleDiscordLogin();
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
      {/* Background Image */}
      <div
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: 'url("https://i.imgur.com/crS3FrR.jpeg")',
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "brightness(0.7)",
        }}
      />

      {/* Content */}
      <div className="relative z-10 min-h-screen">
        <Header title="STORE" user={user} onLogout={handleLogout} />

        {/* Main Content */}
        <main className="flex items-center justify-center px-4 py-12">
          <div className="backdrop-blur-md bg-black/30 p-8 rounded-2xl w-full max-w-md">
            <h2 className="text-4xl font-bold text-white text-center mb-8">
              Minecraft Account
            </h2>

            <div className="text-5xl font-bold text-emerald-400 text-center mb-8">
              $10.00
            </div>

            {/* Features List */}
            <div className="space-y-4 mb-8">
              <div className="flex items-center gap-3 text-white">
                <Check className="text-emerald-400" />
                <span>Full Access</span>
              </div>
              <div className="flex items-center gap-3 text-white">
                <Check className="text-emerald-400" />
                <span>Possible Capes</span>
              </div>
              <div className="flex items-center gap-3 text-white">
                <Check className="text-emerald-400" />
                <span>Dedicated Support</span>
              </div>
            </div>

            {/* Purchase Button */}
            <button
              onClick={handlePurchase}
              className="w-full bg-gray-400/30 hover:bg-gray-400/40 text-white py-3 rounded-md flex items-center justify-center gap-2 transition-colors"
            >
              <ShoppingCart size={20} />
              {user ? "Purchase" : "Login to Purchase"}
            </button>
          </div>
        </main>

        {/* Footer */}
        <footer className="absolute bottom-0 w-full p-4 text-center text-white/80 text-sm">
          Copyright © 2024-2025 Cipher. All Rights Reserved.
        </footer>
      </div>
    </div>
  );
}

export default StorePage;
