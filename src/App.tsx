import React from 'react';
import { Routes, Route } from 'react-router-dom';
import StorePage from './pages/StorePage';
import OrderPage from './pages/OrderPage';

function App() {
  return (
    <Routes>
      <Route path="/" element={<StorePage />} />
      <Route path="/order" element={<OrderPage />} />
    </Routes>
  );
}

export default App;