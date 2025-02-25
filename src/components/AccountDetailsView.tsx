import React, { useState } from "react";
import { Copy, Check, FileText } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

interface AccountDetails {
  id: string;
  name: string;
  accountId: string;
  password: string;
  viewed: boolean;
}

interface AccountDetailsViewProps {
  account: AccountDetails;
  onClose?: () => void;
}

const AccountDetailsView: React.FC<AccountDetailsViewProps> = ({
  account,
  onClose,
}) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    toast.success(`Copied ${fieldName} to clipboard`);

    setTimeout(() => {
      setCopiedField(null);
    }, 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gray-100 rounded-lg p-6 max-w-2xl mx-auto"
    >
      <div className="flex items-center mb-6">
        <div className="bg-blue-100 p-3 rounded-lg mr-4">
          <FileText className="text-blue-500" size={28} />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-bold">{account.name}</h2>
          {account.viewed && (
            <span className="px-2 py-1 text-xs bg-gray-200 text-gray-600 rounded-full inline-block mt-1">
              Viewed
            </span>
          )}
        </div>
      </div>

      <div className="space-y-6">
        <div>
          <label className="block text-gray-600 mb-2">Account ID:</label>
          <div className="flex items-center">
            <div className="flex-1 bg-white p-3 rounded border border-gray-200 font-mono">
              {account.accountId}
            </div>
            <button
              onClick={() => copyToClipboard(account.accountId, "Account ID")}
              className="ml-2 p-2 bg-gray-200 hover:bg-gray-300 rounded transition-colors"
              title="Copy to clipboard"
            >
              {copiedField === "Account ID" ? (
                <Check size={20} className="text-green-500" />
              ) : (
                <Copy size={20} className="text-gray-600" />
              )}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-gray-600 mb-2">Password:</label>
          <div className="flex items-center">
            <div className="flex-1 bg-white p-3 rounded border border-gray-200">
              {account.password}
            </div>
            <button
              onClick={() => copyToClipboard(account.password, "Password")}
              className="ml-2 p-2 bg-gray-200 hover:bg-gray-300 rounded transition-colors"
              title="Copy to clipboard"
            >
              {copiedField === "Password" ? (
                <Check size={20} className="text-green-500" />
              ) : (
                <Copy size={20} className="text-gray-600" />
              )}
            </button>
          </div>
        </div>
      </div>

      {onClose && (
        <div className="mt-6 text-center">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
          >
            Close
          </button>
        </div>
      )}
    </motion.div>
  );
};

export default AccountDetailsView;
