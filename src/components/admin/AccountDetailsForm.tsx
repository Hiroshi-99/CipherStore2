import React, { useState } from "react";
import { RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";
import { generateUUID } from "../../utils/uuid";

interface AccountDetailsFormProps {
  orderId: string;
}

interface AccountDetails {
  accountId: string;
  password: string;
}

const AccountDetailsForm: React.FC<AccountDetailsFormProps> = ({ orderId }) => {
  const [localAccountDetails, setLocalAccountDetails] = useState({
    accountId: "",
    password: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!localAccountDetails.accountId.trim()) {
      toast.error("Account ID is required");
      return;
    }

    setIsSubmitting(true);

    try {
      // Update the order with account details
      const { error: updateError } = await supabase
        .from("orders")
        .update({
          account_id: localAccountDetails.accountId,
          account_password: localAccountDetails.password,
          delivery_date: new Date().toISOString(),
          status: "delivered",
        })
        .eq("id", orderId);

      if (updateError) {
        console.error(
          "Error updating order with account details:",
          updateError
        );
        toast.error("Failed to deliver account details");
        return;
      }

      // Send a message to the user with their account details
      const { data: orderData } = await supabase
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .single();

      if (orderData) {
        // Create a message with the account details
        const message = {
          id: generateUUID(),
          order_id: orderId,
          content: `Your account is ready! Here are your login details:\n\nAccount ID: ${localAccountDetails.accountId}\nPassword: ${localAccountDetails.password}\n\nPlease save these details securely.`,
          created_at: new Date().toISOString(),
          user_id: null, // System message
          is_read: false,
          user_name: "Support Team",
          user_avatar: "https://i.imgur.com/eyaDC8l.png",
        };

        // Insert the message
        const { error: messageError } = await supabase
          .from("messages")
          .insert(message);

        if (messageError) {
          console.error("Error sending account details message:", messageError);
          // Continue anyway since the order was updated
        }
      }

      toast.success("Account details delivered successfully");

      // Reset the form
      setLocalAccountDetails({
        accountId: "",
        password: "",
      });
    } catch (err) {
      console.error("Error in deliverAccountDetails:", err);
      toast.error("Failed to deliver account details");
    } finally {
      setIsSubmitting(false);
    }
  };

  const generateRandomPassword = () => {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
    let password = "";
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setLocalAccountDetails((prev) => ({ ...prev, password }));
  };

  return (
    <div className="bg-white/5 rounded-lg p-6 mt-4">
      <h3 className="text-lg font-medium text-white mb-4">
        Deliver Account Details
      </h3>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="accountId" className="block text-white/70 mb-2">
            Account ID / Email <span className="text-red-400">*</span>
          </label>
          <input
            id="accountId"
            type="text"
            value={localAccountDetails.accountId}
            onChange={(e) =>
              setLocalAccountDetails((prev) => ({
                ...prev,
                accountId: e.target.value,
              }))
            }
            className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:border-white/40"
            placeholder="Enter account ID or email"
            required
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-white/70 mb-2">
            Password
          </label>
          <div className="flex gap-2">
            <input
              id="password"
              type="text"
              value={localAccountDetails.password}
              onChange={(e) =>
                setLocalAccountDetails((prev) => ({
                  ...prev,
                  password: e.target.value,
                }))
              }
              className="flex-1 bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:border-white/40"
              placeholder="Enter password (optional)"
            />
            <button
              type="button"
              onClick={generateRandomPassword}
              className="px-3 py-2 bg-purple-500/20 text-purple-400 rounded hover:bg-purple-500/30 transition-colors"
            >
              Generate
            </button>
          </div>
          <p className="text-white/50 text-sm mt-1">
            Leave blank to only deliver the account ID
          </p>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            type="submit"
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded transition-colors flex items-center gap-2"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Delivering...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Deliver Account
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AccountDetailsForm;
