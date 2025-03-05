import React, { useState } from "react";
import { RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";
import { generateUUID } from "../../utils/uuid";

interface AccountDetailsFormProps {
  orderId: string;
  onSuccess?: (accountId: string, password: string) => void;
}

interface AccountDetails {
  accountId: string;
  password: string;
}

const AccountDetailsForm: React.FC<AccountDetailsFormProps> = ({
  orderId,
  onSuccess,
}) => {
  const [localAccountDetails, setLocalAccountDetails] = useState({
    accountId: "",
    password: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{
    accountId?: string;
    password?: string;
  }>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Reset errors
    setErrors({});

    // Validate form
    const newErrors: {
      accountId?: string;
      password?: string;
    } = {};

    if (!localAccountDetails.accountId.trim()) {
      newErrors.accountId = "Account ID is required";
    }

    if (!localAccountDetails.password.trim()) {
      newErrors.password = "Password is required";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Start submission
    setIsSubmitting(true);

    try {
      // Update the order with account details
      const { error } = await supabase
        .from("orders")
        .update({
          account_id: localAccountDetails.accountId,
          account_password: localAccountDetails.password,
          status: "delivered",
          delivery_date: new Date().toISOString(),
        })
        .eq("id", orderId);

      if (error) {
        console.error("Error delivering account:", error);
        toast.error("Failed to deliver account details");
        return;
      }

      // Success handling
      toast.success("Account details delivered successfully");

      // Clear form
      setLocalAccountDetails({
        accountId: "",
        password: "",
      });

      // Call success callback if provided
      if (onSuccess) {
        onSuccess(localAccountDetails.accountId, localAccountDetails.password);
      }
    } catch (err) {
      console.error("Error in account delivery:", err);
      toast.error("An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setLocalAccountDetails((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const generatePassword = () => {
    // Generate a more secure password - combination of letters, numbers, and special chars
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
    let password = "";
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    setLocalAccountDetails((prev) => ({
      ...prev,
      password,
    }));
  };

  return (
    <div className="bg-white/5 rounded-lg p-6">
      <h3 className="text-lg font-medium text-white mb-4">
        Deliver Account Details
      </h3>

      <form onSubmit={handleSubmit}>
        <div className="space-y-4">
          <div>
            <label
              htmlFor="accountId"
              className="block text-sm font-medium text-white/70 mb-1"
            >
              Account ID
            </label>
            <input
              type="text"
              id="accountId"
              name="accountId"
              value={localAccountDetails.accountId}
              onChange={handleChange}
              className={`w-full px-3 py-2 bg-white/10 border ${
                errors.accountId ? "border-red-500" : "border-white/20"
              } rounded-md text-white`}
              placeholder="Enter account ID"
            />
            {errors.accountId && (
              <p className="mt-1 text-sm text-red-500">{errors.accountId}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-white/70 mb-1"
            >
              Password
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                id="password"
                name="password"
                value={localAccountDetails.password}
                onChange={handleChange}
                className={`flex-1 px-3 py-2 bg-white/10 border ${
                  errors.password ? "border-red-500" : "border-white/20"
                } rounded-md text-white`}
                placeholder="Enter password"
              />
              <button
                type="button"
                onClick={generatePassword}
                className="px-3 py-2 bg-blue-500/30 text-blue-300 rounded-md hover:bg-blue-500/40 transition-colors"
              >
                Generate
              </button>
            </div>
            {errors.password && (
              <p className="mt-1 text-sm text-red-500">{errors.password}</p>
            )}
          </div>
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
