import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Send } from "lucide-react";
import { supabase } from "../lib/supabase";
import type { User } from "@supabase/supabase-js";

interface DiscordProfile {
  username?: string;
  full_name?: string;
  email?: string;
}

function OrderPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
  });

  useEffect(() => {
    // Check active session and get user data
    const checkSession = async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error || !session?.user) {
          console.error("Session error:", error);
          navigate("/");
          return;
        }

        setUser(session.user);

        // Create a new order for the user if they don't have one
        const { data: existingOrder, error: orderError } = await supabase
          .from("orders")
          .select("*")
          .eq("user_id", session.user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (orderError && orderError.code !== "PGRST116") {
          // PGRST116 is "no rows returned"
          console.error("Error checking existing order:", orderError);
          return;
        }

        if (!existingOrder) {
          // Create new order
          const orderId = crypto.randomUUID();
          const { error: createError } = await supabase.from("orders").insert([
            {
              id: orderId,
              user_id: session.user.id,
              status: "pending",
            },
          ]);

          if (createError) {
            console.error("Error creating order:", createError);
            return;
          }
        }

        // Get Discord profile data from user metadata
        const discordProfile = session.user.user_metadata as DiscordProfile;
        setFormData({
          name: discordProfile.full_name || "",
          email: session.user.email || "",
        });

        setLoading(false);
      } catch (error) {
        console.error("Error in session check:", error);
        navigate("/");
      }
    };

    checkSession();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session?.user) {
        navigate("/");
        return;
      }
      setUser(session.user);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      // Get the user's latest order
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (orderError) {
        console.error("Error getting order:", orderError);
        return;
      }

      // Navigate to chat page
      navigate("/chat");
    } catch (error) {
      console.error("Error submitting order:", error);
      alert("Failed to submit order. Please try again.");
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Prevent changes if the data came from Discord
    if (user?.user_metadata?.full_name && e.target.name === "name") {
      return;
    }
    if (user?.email && e.target.name === "email") {
      return;
    }

    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleBackToStore = () => {
    // Simply navigate back to the store page
    navigate("/");
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
            onClick={handleBackToStore}
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
                  className={`w-full px-4 py-2 rounded-md bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-emerald-400 ${
                    user?.user_metadata?.full_name
                      ? "opacity-75 cursor-not-allowed"
                      : ""
                  }`}
                  required
                  readOnly={!!user?.user_metadata?.full_name}
                />
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-white mb-2"
                >
                  Email Address
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="you@example.com"
                  className={`w-full px-4 py-2 rounded-md bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-emerald-400 ${
                    user?.email ? "opacity-75 cursor-not-allowed" : ""
                  }`}
                  required
                  readOnly={!!user?.email}
                />
              </div>

              <div className="text-white/70 text-sm">
                <p>After submitting your order:</p>
                <ul className="list-disc ml-5 mt-2 space-y-1">
                  <li>We'll contact you via email</li>
                  <li>Payment instructions will be sent to your email</li>
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
