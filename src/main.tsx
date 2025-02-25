import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import AccountsPage from "./pages/AccountsPage";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Routes>
        <Route path="/accounts" element={<AccountsPage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
