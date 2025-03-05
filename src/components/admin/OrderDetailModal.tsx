import React, { useState } from "react";
import { Link } from "react-router-dom";
import { XCircle, Download } from "lucide-react";
import FileUpload from "../FileUpload";
import AccountDetailsForm from "./AccountDetailsForm";
import type { Order } from "../../hooks/useOrderFilters";

interface OrderDetailModalProps {
  selectedOrderDetail: Order | null;
  setSelectedOrderDetail: (order: Order | null) => void;
  onFileUpload: (orderId: string, fileUrl: string) => void;
  setCurrentImageUrl: (url: string) => void;
  setShowImageModal: (show: boolean) => void;
  onAccountDelivered?: (
    orderId: string,
    accountId: string,
    password: string
  ) => void;
}

const OrderDetailModal: React.FC<OrderDetailModalProps> = ({
  selectedOrderDetail,
  setSelectedOrderDetail,
  onFileUpload,
  setCurrentImageUrl,
  setShowImageModal,
  onAccountDelivered,
}) => {
  if (!selectedOrderDetail) return null;

  const handleAccountDeliverySuccess = (
    accountId: string,
    password: string
  ) => {
    if (selectedOrderDetail && onAccountDelivered) {
      onAccountDelivered(selectedOrderDetail.id, accountId, password);
    }

    if (selectedOrderDetail) {
      setSelectedOrderDetail({
        ...selectedOrderDetail,
        account_id: accountId,
        account_password: password,
        status: "delivered",
        delivery_date: new Date().toISOString(),
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-start mb-6">
            <h2 className="text-xl font-bold text-white">Order Details</h2>
            <button
              onClick={() => setSelectedOrderDetail(null)}
              className="text-white/70 hover:text-white"
            >
              <XCircle className="w-6 h-6" />
            </button>
          </div>

          <div className="space-y-6">
            {/* Customer Information */}
            <div>
              <h3 className="text-white/70 mb-2">Customer Information</h3>
              <div className="bg-white/5 rounded-lg p-4">
                <p className="text-white">
                  <span className="text-white/70">Name:</span>{" "}
                  {selectedOrderDetail.full_name}
                </p>
                <p className="text-white">
                  <span className="text-white/70">Email:</span>{" "}
                  {selectedOrderDetail.email}
                </p>
                <p className="text-white">
                  <span className="text-white/70">Status:</span>
                  <span
                    className={`ml-2 px-2 py-0.5 rounded text-xs ${
                      selectedOrderDetail.status === "active"
                        ? "bg-green-500/20 text-green-400"
                        : selectedOrderDetail.status === "rejected"
                        ? "bg-red-500/20 text-red-400"
                        : selectedOrderDetail.status === "delivered"
                        ? "bg-blue-500/20 text-blue-400"
                        : "bg-yellow-500/20 text-yellow-400"
                    }`}
                  >
                    {selectedOrderDetail.status.toUpperCase()}
                  </span>
                </p>
                <p className="text-white">
                  <span className="text-white/70">Created:</span>{" "}
                  {new Date(selectedOrderDetail.created_at).toLocaleString()}
                </p>
              </div>
            </div>

            {/* Payment Proofs Section */}
            {selectedOrderDetail.payment_proofs &&
              selectedOrderDetail.payment_proofs.length > 0 && (
                <div>
                  <h3 className="text-white/70 mb-2">Payment Proofs</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {selectedOrderDetail.payment_proofs.map((proof, index) => (
                      <div key={index} className="bg-white/5 rounded-lg p-4">
                        <img
                          src={proof.image_url}
                          alt={`Payment proof ${index + 1}`}
                          className="w-full h-auto rounded-lg mb-2 cursor-pointer"
                          onClick={() => {
                            setCurrentImageUrl(proof.image_url);
                            setShowImageModal(true);
                          }}
                        />
                        <p className="text-white/70 text-sm">
                          Status:{" "}
                          <span
                            className={`${
                              proof.status === "approved"
                                ? "text-green-400"
                                : proof.status === "rejected"
                                ? "text-red-400"
                                : "text-yellow-400"
                            }`}
                          >
                            {proof.status.toUpperCase()}
                          </span>
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            {/* Account Details Section */}
            {selectedOrderDetail.account_id ? (
              <div>
                <h3 className="text-white/70 mb-2">Account Details</h3>
                <div className="bg-white/5 rounded-lg p-4">
                  <p className="text-white">
                    <span className="text-white/70">Account ID:</span>{" "}
                    {selectedOrderDetail.account_id}
                  </p>
                  {selectedOrderDetail.account_password && (
                    <p className="text-white">
                      <span className="text-white/70">Password:</span>{" "}
                      {selectedOrderDetail.account_password}
                    </p>
                  )}
                  {selectedOrderDetail.delivery_date && (
                    <p className="text-white">
                      <span className="text-white/70">Delivered:</span>{" "}
                      {new Date(
                        selectedOrderDetail.delivery_date
                      ).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            ) : selectedOrderDetail.status === "active" ? (
              <AccountDetailsForm
                orderId={selectedOrderDetail.id}
                onSuccess={handleAccountDeliverySuccess}
              />
            ) : null}

            {/* Account File Section */}
            {selectedOrderDetail.account_file_url ? (
              <div>
                <h3 className="text-white/70 mb-2">Account File</h3>
                <div className="bg-white/5 rounded-lg p-4 flex items-center justify-between">
                  <div>
                    <p className="text-white">Account file uploaded</p>
                    <p className="text-white/70 text-sm">
                      {new URL(selectedOrderDetail.account_file_url).pathname
                        .split("/")
                        .pop()}
                    </p>
                  </div>
                  <a
                    href={selectedOrderDetail.account_file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 transition-colors"
                  >
                    <Download className="w-5 h-5" />
                  </a>
                </div>
              </div>
            ) : selectedOrderDetail.status === "active" &&
              !selectedOrderDetail.account_id ? (
              <div>
                <h3 className="text-white/70 mb-2">Account File</h3>
                <div className="bg-white/5 rounded-lg p-4">
                  <p className="text-white/70 mb-2">
                    No account file uploaded yet
                  </p>
                  <FileUpload
                    orderId={selectedOrderDetail.id}
                    onUploadSuccess={(fileUrl) => {
                      onFileUpload(selectedOrderDetail.id, fileUrl);
                      setSelectedOrderDetail({
                        ...selectedOrderDetail,
                        account_file_url: fileUrl,
                      });
                    }}
                  />
                </div>
              </div>
            ) : null}

            <div className="flex justify-end gap-3 mt-6">
              <Link
                to={`/chat?order=${selectedOrderDetail.id}`}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
              >
                Open Chat
              </Link>
              <button
                onClick={() => setSelectedOrderDetail(null)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderDetailModal;
