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
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "discord",
        options: {
          redirectTo: window.location.origin + window.location.pathname,
        },
      });

      if (error) throw error;
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
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-pulse text-white text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      <Header title="STORE" user={user} />
      {/* Background Image with Overlay */}
      <div className="absolute inset-0 z-0">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'url("https://images.unsplash.com/photo-1623984109622-f9c970ba32fc?q=80&w=2940")',
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      </div>

      {/* Content */}
      <div className="relative z-10 min-h-screen">
        <main className="flex items-center justify-center px-4 py-12">
          <div className="backdrop-blur-md bg-black/30 p-8 rounded-2xl w-full max-w-md border border-white/10">
            <h2 className="text-4xl font-bold text-white text-center mb-8">
              Elite Account
            </h2>

            <div className="text-5xl font-bold text-emerald-400 text-center mb-8">
              $15.00
            </div>

            {/* Features List */}
            <div className="space-y-4 mb-8">
              <div className="flex items-center gap-3 text-white">
                <Check className="text-emerald-400 shrink-0" />
                <span>Full Access to Premium Features</span>
              </div>
              <div className="flex items-center gap-3 text-white">
                <Check className="text-emerald-400 shrink-0" />
                <span>Exclusive Discord Role & Benefits</span>
              </div>
              <div className="flex items-center gap-3 text-white">
                <Check className="text-emerald-400 shrink-0" />
                <span>Priority Support & Updates</span>
              </div>
            </div>

            {/* Purchase Button */}
            <button
              onClick={handlePurchase}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-md flex items-center justify-center gap-2 transition-colors"
            >
              <ShoppingCart size={20} />
              {user ? "Purchase Now" : "Login with Discord"}
            </button>
          </div>
        </main>

        {/* Footer */}
        <footer className="absolute bottom-0 w-full p-4 text-center text-white/80 text-sm backdrop-blur-md bg-black/30">
          Copyright © 2024-2025 Cipher. All Rights Reserved.
        </footer>
      </div>
    </div>
  );
}

export default StorePage;
