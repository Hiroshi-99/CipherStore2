import React, { useEffect, useState } from 'react';
import { ShoppingCart, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

function StorePage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
      
      // If we have a user, redirect to the order page
      if (session?.user) {
        navigate('/order');
      }
    });

    // Listen for changes on auth state (sign in, sign out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
      
      // Redirect to order page on successful sign in
      if (session?.user) {
        navigate('/order');
      }
    });

    // Handle OAuth callback
    if (window.location.hash.includes('access_token')) {
      // The hash contains the OAuth response
      // Supabase client will automatically handle this
      // Just wait for the auth state change event above
      return;
    }

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleDiscordLogin = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'discord',
        options: {
          redirectTo: window.location.origin + window.location.pathname
        }
      });
      
      if (error) throw error;
    } catch (error) {
      console.error('Error logging in with Discord:', error);
    }
  };

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const handlePurchase = () => {
    if (user) {
      navigate('/order');
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
          backgroundImage: 'url("https://images.unsplash.com/photo-1623984109622-f9c970ba32fc?q=80&w=2940")',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'brightness(0.7)'
        }}
      />

      {/* Content */}
      <div className="relative z-10 min-h-screen">
        {/* Header */}
        <header className="p-6 flex justify-between items-center">
          <h1 className="text-4xl font-bold text-emerald-400">STORE</h1>
          {user ? (
            <div className="flex items-center gap-4">
              <span className="text-white">Welcome, {user.user_metadata.full_name || user.email}</span>
              <button 
                onClick={handleLogout}
                className="bg-red-500 text-white px-6 py-2 rounded-md hover:bg-red-600 transition-colors"
              >
                Logout
              </button>
            </div>
          ) : (
            <button 
              onClick={handleDiscordLogin}
              className="bg-[#5865F2] text-white px-6 py-2 rounded-md flex items-center gap-2 hover:bg-[#4752c4] transition-colors"
            >
              <img 
                src="https://assets-global.website-files.com/6257adef93867e50d84d30e2/636e0a6a49cf127bf92de1e2_icon_clyde_white_RGB.png" 
                alt="Discord" 
                className="w-6 h-6" 
              />
              Login with Discord
            </button>
          )}
        </header>

        {/* Main Content */}
        <main className="flex items-center justify-center px-4 py-12">
          <div className="backdrop-blur-md bg-black/30 p-8 rounded-2xl w-full max-w-md">
            <h2 className="text-4xl font-bold text-white text-center mb-8">Elite Account</h2>
            
            <div className="text-5xl font-bold text-emerald-400 text-center mb-8">$15.00</div>

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
              {user ? 'Purchase' : 'Login to Purchase'}
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