import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import StorePage from "./pages/StorePage";
import OrderPage from "./pages/OrderPage";
import InboxPage from "./pages/InboxPage";
import AdminPage from "./pages/AdminPage";
import ChatPage from "./pages/ChatPage";
import AdminGuard from "./components/AdminGuard";
import { setPageTitle } from "./utils/title";
import Fireflies from "./components/Fireflies";
import LoginPage from "./pages/LoginPage";
import AccountsPage from "./pages/AccountsPage";
import { supabase } from "./lib/supabase";
import { User } from "@supabase/supabase-js";
import { Toaster } from "sonner";

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  useEffect(() => {
    const getUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user);
      setLoading(false);
    };

    getUser();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    setPageTitle(""); // This will just show "Cipher"
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white">
      <Fireflies />
      <Toaster position="top-right" richColors />
      <Routes>
        <Route path="/" element={<LoginPage user={user} loading={loading} />} />
        <Route
          path="/login"
          element={<LoginPage user={user} loading={loading} />}
        />
        <Route path="/chat" element={<ChatPage user={user} />} />
        <Route path="/chat/:orderId" element={<ChatPage user={user} />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/accounts" element={<AccountsPage />} />
        <Route path="/store" element={<StorePage />} />
        <Route path="/order" element={<OrderPage />} />
        <Route path="/inbox" element={<InboxPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default App;
