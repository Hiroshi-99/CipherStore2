import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import StorePage from "./pages/StorePage";
import OrderPage from "./pages/OrderPage";
import InboxPage from "./pages/InboxPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<StorePage />} />
        <Route path="/order" element={<OrderPage />} />
        <Route path="/inbox" element={<InboxPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
