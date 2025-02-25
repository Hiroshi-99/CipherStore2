import React, { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import StorePage from "./pages/StorePage";
import OrderPage from "./pages/OrderPage";
import InboxPage from "./pages/InboxPage";
import AdminPage from "./pages/AdminPage";
import ChatPage from "./pages/ChatPage";
import AdminGuard from "./components/AdminGuard";
import { setPageTitle } from "./utils/title";
import Fireflies from "./components/Fireflies";
import { AdminProvider } from "./contexts/AdminContext";

function App() {
  useEffect(() => {
    setPageTitle(""); // This will just show "Cipher"
  }, []);

  return (
    <AdminProvider>
      <Fireflies />
      <Routes>
        <Route path="/" element={<StorePage />} />
        <Route path="/order" element={<OrderPage />} />
        <Route path="/inbox" element={<InboxPage />} />
        <Route path="/chat" element={<ChatPage />} />
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
    </AdminProvider>
  );
}

export default App;
