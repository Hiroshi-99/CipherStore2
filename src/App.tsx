import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import StorePage from "./pages/StorePage";
import OrderPage from "./pages/OrderPage";
import InboxPage from "./pages/InboxPage";
import AdminPage from "./pages/AdminPage";
import AdminGuard from "./components/AdminGuard";

function App() {
  return (
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
  );
}

export default App;
