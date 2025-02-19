import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Send, Upload } from "lucide-react";
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentProof, setPaymentProof] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    // Check active session and get user data
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) {
        navigate("/");
        return;
      }
      setUser(session.user);

      // Get Discord profile data from user metadata
      const discordProfile = session.user.user_metadata as DiscordProfile;
      setFormData({
        name: discordProfile.full_name || "",
        email: session.user.email || "",
      });
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        navigate("/");
        return;
      }
      setUser(session.user);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setPaymentProof(e.target.files[0]);
    }
  };

  const uploadPaymentProof = async (orderId: string) => {
    if (!paymentProof) return null;

    const fileExt = paymentProof.name.split(".").pop();
    const fileName = `${orderId}-proof.${fileExt}`;
    const filePath = `payment-proofs/${fileName}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("payment-proofs")
      .upload(filePath, paymentProof);

    if (uploadError) throw uploadError;

    // Get public URL
    const {
      data: { publicUrl },
    } = supabase.storage.from("payment-proofs").getPublicUrl(filePath);

    return publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || isSubmitting) return;

    setIsSubmitting(true);

    try {
      // Validate form data
      if (formData.name.trim() === "") {
        alert("Please enter your name before submitting the order.");
        return;
      }

      // Store order in Supabase
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert([
          {
            user_id: user.id,
            email: formData.email,
            full_name: formData.name,
            status: "pending",
          },
        ])
        .select()
        .single();

      if (orderError || !order) {
        throw new Error(orderError?.message || "Failed to create order");
      }

      // Upload payment proof if exists
      let proofUrl = null;
      if (paymentProof) {
        setIsUploading(true);
        proofUrl = await uploadPaymentProof(order.id);

        // Store payment proof record
        const { error: proofError } = await supabase
          .from("payment_proofs")
          .insert([
            {
              order_id: order.id,
              image_url: proofUrl,
            },
          ]);

        if (proofError) throw proofError;
      }

      // Create Discord channel/thread
      const headers = await getAuthHeaders();
      const response = await fetch("/api/discord-create-channel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: headers.Authorization,
        },
        body: JSON.stringify({
          orderId: order.id,
          customerName: formData.name,
          paymentProofUrl: proofUrl,
          userId: user.id,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          `Failed to create Discord channel: ${
            errorData.details || errorData.error || "Unknown error"
          }`
        );
      }

      // Navigate to inbox page
      navigate("/inbox");

      // Show success message
      alert("Order submitted successfully! Check your inbox for updates.");
    } catch (error) {
      console.error("Error submitting order:", error);
      alert(
        `There was an error submitting your order. Please try again. Error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      setIsSubmitting(false);
      setIsUploading(false);
    }
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

              <div>
                <label
                  htmlFor="payment-proof"
                  className="block text-sm font-medium text-white mb-2"
                >
                  Payment Proof
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    id="payment-proof"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <label
                    htmlFor="payment-proof"
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md border border-white/20 cursor-pointer hover:bg-white/10 transition-colors ${
                      paymentProof ? "bg-emerald-500/20" : "bg-white/10"
                    }`}
                  >
                    <Upload size={20} className="text-white" />
                    <span className="text-white">
                      {paymentProof
                        ? paymentProof.name
                        : "Upload Payment Proof"}
                    </span>
                  </label>
                </div>
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
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-md flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isSubmitting || isUploading}
              >
                {isSubmitting || isUploading ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
                ) : (
                  <Send size={20} />
                )}
                {isSubmitting || isUploading
                  ? isUploading
                    ? "Uploading..."
                    : "Submitting..."
                  : "Submit Order"}
              </button>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}

export default OrderPage;
