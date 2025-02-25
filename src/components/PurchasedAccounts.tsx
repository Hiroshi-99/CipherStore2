import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { Download, Eye, FileText } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

interface Account {
  id: string;
  name: string;
  file_url: string;
  created_at: string;
  viewed: boolean;
  order_id: string;
}

interface PurchasedAccountsProps {
  userId: string;
}

const PurchasedAccounts: React.FC<PurchasedAccountsProps> = ({ userId }) => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAccounts();
  }, [userId]);

  const fetchAccounts = async () => {
    try {
      setLoading(true);

      // Fetch orders for this user that have account files
      const { data: orders, error } = await supabase
        .from("orders")
        .select("id, account_file_url, created_at, viewed_at, status")
        .eq("user_id", userId)
        .not("account_file_url", "is", null)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Transform orders into accounts format
      const accountsData = orders.map((order, index) => ({
        id: order.id,
        name: `Account #${index + 1}`,
        file_url: order.account_file_url,
        created_at: order.created_at,
        viewed: order.viewed_at !== null,
        order_id: order.id,
      }));

      setAccounts(accountsData);
    } catch (error) {
      console.error("Error fetching accounts:", error);
      toast.error("Failed to load your accounts");
    } finally {
      setLoading(false);
    }
  };

  const markAsViewed = async (accountId: string) => {
    try {
      // Update the order's viewed_at timestamp
      const { error } = await supabase
        .from("orders")
        .update({ viewed_at: new Date().toISOString() })
        .eq("id", accountId);

      if (error) throw error;

      // Update local state
      setAccounts((prev) =>
        prev.map((account) =>
          account.id === accountId ? { ...account, viewed: true } : account
        )
      );
    } catch (error) {
      console.error("Error marking account as viewed:", error);
    }
  };

  const downloadFile = (url: string, filename: string) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadAll = () => {
    accounts.forEach((account, index) => {
      // Add a small delay between downloads to prevent browser blocking
      setTimeout(() => {
        downloadFile(account.file_url, `Account_${index + 1}.png`);
      }, index * 500);
    });
    toast.success("Downloading all accounts");
  };

  if (loading) {
    return (
      <div className="p-4 text-center">
        <div className="animate-pulse h-6 w-48 bg-gray-200 rounded mx-auto mb-4"></div>
        <div className="animate-pulse h-20 w-full max-w-md bg-gray-200 rounded mx-auto"></div>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">
        You don't have any purchased accounts yet.
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl mx-auto p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Purchased accounts</h2>
        <button
          onClick={downloadAll}
          className="flex items-center text-blue-500 hover:text-blue-600"
        >
          <Download size={18} className="mr-1" />
          Download all
        </button>
      </div>

      <div className="space-y-4">
        {accounts.map((account) => (
          <motion.div
            key={account.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-lg shadow p-4 flex justify-between items-center"
          >
            <div className="flex items-center">
              <div className="bg-blue-100 p-2 rounded-lg mr-3">
                <FileText className="text-blue-500" size={24} />
              </div>
              <a
                href={account.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium hover:text-blue-500 transition-colors"
                onClick={() => markAsViewed(account.id)}
              >
                {account.name}
              </a>
            </div>

            <div className="flex items-center space-x-2">
              {account.viewed ? (
                <span className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-full">
                  Viewed
                </span>
              ) : (
                <span className="px-2 py-1 text-xs bg-blue-100 text-blue-600 rounded-full animate-pulse">
                  New
                </span>
              )}

              <button
                onClick={() => {
                  window.open(account.file_url, "_blank");
                  markAsViewed(account.id);
                }}
                className="p-2 text-gray-500 hover:text-blue-500 transition-colors"
                title="View"
              >
                <Eye size={18} />
              </button>

              <button
                onClick={() =>
                  downloadFile(account.file_url, `${account.name}.png`)
                }
                className="p-2 text-gray-500 hover:text-blue-500 transition-colors"
                title="Download"
              >
                <Download size={18} />
              </button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default PurchasedAccounts;
