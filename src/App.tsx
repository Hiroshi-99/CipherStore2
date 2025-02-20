import React, { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import StorePage from "./pages/StorePage";
import OrderPage from "./pages/OrderPage";
import InboxPage from "./pages/InboxPage";
import AdminPage from "./pages/AdminPage";
import AdminGuard from "./components/AdminGuard";
import { setPageTitle } from "./utils/title";
import Fireflies from "./components/Fireflies";
import { supabase } from "./lib/supabase";
import { handleDiscordAuth } from "./lib/auth";

function App() {
  useEffect(() => {
    setPageTitle(""); // This will just show "Cipher"

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const discordId = session.user.user_metadata?.provider_id;
        if (discordId) {
          await handleDiscordAuth(session.user.id, discordId);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <>
      <Fireflies />
      <Routes>
        <Route path="/" element={<StorePage />} />
        <Route path="/order" element={<OrderPage />} />
        <Route path="/inbox" element={<InboxPage />} />
        <Route
          path="/admin"
          element={
            <AdminGuard>
              <AdminPage />
            </AdminGuard>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default App;
