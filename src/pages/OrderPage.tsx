import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Send } from "lucide-react";

function OrderPage() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: "",
    discordTag: "",
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Here you would typically process the order
    alert("Order submitted! We'll contact you on Discord.");
    navigate("/");
  };

  return (
    <div className="min-h-screen relative">
      {/* Background Image */}
      <div
        className="absolute inset-0 z-0"
        style={{
          backgroundImage:
            'url("https://images.unsplash.com/photo-1623984109622-f9c970ba32fc?q=80&w=2940")',
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "brightness(0.7)",
        }}
      />

      {/* Content */}
      <div className="relative z-10 min-h-screen">
        {/* Header */}
        <header className="p-6 flex justify-between items-center">
          <button
            onClick={() => navigate("/")}
            className="text-white flex items-center gap-2 hover:text-emerald-400 transition-colors"
          >
            <ArrowLeft size={24} />
            Back to Store
          </button>
          <h1 className="text-4xl font-bold text-emerald-400">CHECKOUT</h1>
        </header>

        {/* Main Content */}
        <main className="flex items-center justify-center px-4 py-12">
          <div className="backdrop-blur-md bg-black/30 p-8 rounded-2xl w-full max-w-md">
            <div className="text-white mb-8">
              <h2 className="text-2xl font-bold mb-2">Order Summary</h2>
              <div className="flex justify-between items-center py-4 border-t border-white/20">
                <span>Elite Account</span>
                <span className="text-emerald-400 font-bold">$15.00</span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label
                  htmlFor="name"
                  className="block text-sm font-medium text-white mb-2"
                >
                  Full Name
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="John Doe"
                  className="w-full px-4 py-2 rounded-md bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="discordTag"
                  className="block text-sm font-medium text-white mb-2"
                >
                  Discord Username
                </label>
                <input
                  type="text"
                  id="discordTag"
                  name="discordTag"
                  value={formData.discordTag}
                  onChange={handleInputChange}
                  placeholder="username"
                  className="w-full px-4 py-2 rounded-md bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  required
                />
              </div>

              <div className="text-white/70 text-sm">
                <p>After submitting your order:</p>
                <ul className="list-disc ml-5 mt-2 space-y-1">
                  <li>We'll contact you on Discord</li>
                  <li>Payment will be handled through Discord</li>
                  <li>
                    Your account will be activated after payment confirmation
                  </li>
                </ul>
              </div>

              <button
                type="submit"
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-md flex items-center justify-center gap-2 transition-colors"
              >
                <Send size={20} />
                Submit Order
              </button>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}

export default OrderPage;
