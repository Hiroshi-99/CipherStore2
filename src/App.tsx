import React, { useEffect, lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import StorePage from "./pages/StorePage";
import OrderPage from "./pages/OrderPage";
import InboxPage from "./pages/InboxPage";
import AdminPage from "./pages/AdminPage";
import ChatPage from "./pages/ChatPage";
import AdminGuard from "./components/AdminGuard";
import { setPageTitle } from "./utils/title";
import Fireflies from "./components/Fireflies";
import { AdminProvider } from "./context/AdminContext";
import LoadingSpinner from "./components/LoadingSpinner";

// Use lazy loading for page components
const AdminPageLazy = lazy(() => import("./pages/AdminPage"));
const ChatPageLazy = lazy(() => import("./pages/ChatPage"));
const InboxPageLazy = lazy(() => import("./pages/InboxPage"));
const AccountsPage = lazy(() => import("./pages/AccountsPage"));

function App() {
  useEffect(() => {
    setPageTitle(""); // This will just show "Cipher"
  }, []);

  return (
    <AdminProvider>
      <Fireflies />
      <Suspense
        fallback={
          <div className="flex h-screen w-screen items-center justify-center">
            <LoadingSpinner size="large" />
          </div>
        }
      >
        <Routes>
          <Route path="/" element={<StorePage />} />
          <Route path="/order" element={<OrderPage />} />
          <Route path="/inbox" element={<InboxPageLazy />} />
          <Route path="/chat" element={<ChatPageLazy />} />
          <Route
            path="/admin"
            element={
              <AdminGuard>
                <AdminPageLazy />
              </AdminGuard>
            }
          />
          <Route path="/accounts" element={<AccountsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AdminProvider>
  );
}

export default App;
