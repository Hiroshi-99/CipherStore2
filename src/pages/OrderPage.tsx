import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Send, Upload, Eye } from "lucide-react";
import { supabase } from "../lib/supabase";
import type { User } from "@supabase/supabase-js";
import { getAuthHeaders } from "../lib/auth";
import Header from "../components/Header";

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
  const [showQRModal, setShowQRModal] = useState(false);

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
    if (!paymentProof) {
      throw new Error("No payment proof file selected");
    }

    try {
      // Validate file
      if (paymentProof.size > 5 * 1024 * 1024) {
        throw new Error("File size must be less than 5MB");
      }

      if (!paymentProof.type.startsWith("image/")) {
        throw new Error("Only image files are allowed");
      }

      const fileExt = paymentProof.name.split(".").pop()?.toLowerCase();
      if (!fileExt || !["jpg", "jpeg", "png", "gif"].includes(fileExt)) {
        throw new Error("Only JPG, PNG, and GIF files are allowed");
      }

      // Check if bucket exists
      const { data: buckets } = await supabase.storage.listBuckets();
      if (!buckets?.some((bucket) => bucket.name === "payment-proofs")) {
        throw new Error(
          "Storage system is not properly configured. Please contact support."
        );
      }

      const fileName = `${orderId}-proof.${fileExt}`;
      const filePath = `payment-proofs/${fileName}`;

      // Create a copy of the file with proper name
      const renamedFile = new File([paymentProof], fileName, {
        type: paymentProof.type,
      });

      // Upload to Supabase Storage
      const { data, error: uploadError } = await supabase.storage
        .from("payment-proofs")
        .upload(filePath, renamedFile, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        console.error("Upload error details:", uploadError);
        if (uploadError.message.includes("bucket")) {
          throw new Error(
            "Storage system error. Please try again or contact support."
          );
        }
        throw new Error(uploadError.message);
      }

      if (!data?.path) {
        throw new Error("Upload successful but no path returned");
      }

      // Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from("payment-proofs").getPublicUrl(data.path);

      if (!publicUrl) {
        throw new Error("Failed to get public URL for uploaded file");
      }

      return publicUrl;
    } catch (error) {
      console.error("Error uploading payment proof:", error);
      if (error instanceof Error) {
        throw new Error(`Failed to upload payment proof: ${error.message}`);
      }
      throw new Error("Failed to upload payment proof: Unknown error occurred");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || isSubmitting) return;

    setIsSubmitting(true);
    setIsUploading(true);

    try {
      // Validate form data
      if (!formData.name.trim() || !formData.email.trim()) {
        throw new Error("Please fill in all required fields");
      }

      if (!paymentProof) {
        throw new Error("Please upload your payment proof");
      }

      // Generate a unique ID for the order
      const tempOrderId = crypto.randomUUID();

      // Upload payment proof first
      console.log("Uploading payment proof...");
      const proofUrl = await uploadPaymentProof(tempOrderId);

      if (!proofUrl) {
        throw new Error("Failed to get URL for uploaded payment proof");
      }

      console.log("Payment proof uploaded successfully:", proofUrl);

      // Create order
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

      // Store payment proof record
      const { error: proofError } = await supabase
        .from("payment_proofs")
        .insert([
          {
            order_id: order.id,
            image_url: proofUrl,
            status: "pending",
          },
        ]);

      if (proofError) {
        throw new Error(`Failed to store payment proof: ${proofError.message}`);
      }

      // Create Discord channel/thread
      try {
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

        const responseData = await response.json();

        if (!response.ok) {
          throw new Error(
            responseData.details ||
              responseData.error ||
              "Failed to create Discord channel"
          );
        }
      } catch (discordError) {
        console.error("Discord channel creation failed:", discordError);
        // Continue with navigation even if Discord channel creation fails
      }

      // Show success message with a modal or toast
      const confirmed = window.confirm(
        "Order submitted successfully! Check your inbox for updates. Click OK to return to the store."
      );

      // Navigate based on user choice
      if (confirmed) {
        navigate("/");
      } else {
        navigate("/inbox");
      }
    } catch (error) {
      console.error("Error submitting order:", error);
      alert(
        `There was an error submitting your order: ${
          error instanceof Error ? error.message : "Unknown error occurred"
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
        <Header title="CHECKOUT" showBack user={user} />

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

              {/* Payment Instructions and QR Code */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-white">
                  Payment Instructions
                </h3>
                <div className="relative group">
                  <img
                    src="https://cdn.discordapp.com/attachments/1326517715279810674/1341748229770969108/qr.jpg?ex=67b71fea&is=67b5ce6a&hm=52a9f607ce191c6c368c79b7c1098ffaade0fdceb2a62d11354ee4eb3184884f&" // Add your QR code image here
                    alt="Payment QR Code"
                    className="w-full rounded-lg border-2 border-emerald-400/50 cursor-pointer transition-transform hover:scale-[1.02]"
                    onClick={() => setShowQRModal(true)}
                  />
                  <button
                    type="button"
                    className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => setShowQRModal(true)}
                  >
                    <Eye className="w-8 h-8 text-white" />
                  </button>
                </div>
                <div className="bg-emerald-400/10 rounded-lg p-4 text-white/90 text-sm">
                  <p className="font-medium mb-2">Payment Steps:</p>
                  <ol className="list-decimal ml-4 space-y-1">
                    <li>Scan the QR code above or click to view full size</li>
                    <li>Send exactly $15.00 to the displayed address</li>
                    <li>Take a screenshot of your payment confirmation</li>
                    <li>Upload the screenshot below as proof of payment</li>
                  </ol>
                </div>
              </div>

              {/* Payment Proof Upload */}
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
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
                    <span>
                      {isUploading ? "Uploading..." : "Submitting..."}
                    </span>
                  </>
                ) : (
                  <>
                    <Send size={20} />
                    <span>Submit Order</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </main>

        {/* QR Code Modal */}
        {showQRModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
            onClick={() => setShowQRModal(false)}
          >
            <div
              className="relative max-w-2xl w-full mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src="https://cdn.discordapp.com/attachments/1326517715279810674/1341748229770969108/qr.jpg?ex=67b71fea&is=67b5ce6a&hm=52a9f607ce191c6c368c79b7c1098ffaade0fdceb2a62d11354ee4eb3184884f&" // Same QR code image
                alt="Payment QR Code"
                className="w-full rounded-lg"
              />
              <button
                type="button"
                className="absolute -top-4 -right-4 bg-white/10 hover:bg-white/20 rounded-full p-2 text-white transition-colors"
                onClick={() => setShowQRModal(false)}
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default OrderPage;
