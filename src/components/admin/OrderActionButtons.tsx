import React from "react";
import { CheckCircle, XCircle, Eye } from "lucide-react";
import type { Order } from "../../hooks/useOrderFilters";

interface OrderActionButtonsProps {
  order: Order;
  handleApprove: (orderId: string) => Promise<any>;
  handleReject: (orderId: string) => Promise<any>;
  setSelectedOrderId: (id: string) => void;
  setSelectedOrderDetail: (order: Order) => void;
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  setStats: React.Dispatch<
    React.SetStateAction<{
      total: number;
      pending: number;
      approved: number;
      rejected: number;
      delivered: number;
    }>
  >;
}

function OrderActionButtons({
  order,
  handleApprove,
  handleReject,
  setSelectedOrderId,
  setSelectedOrderDetail,
  setOrders,
  setStats,
}: OrderActionButtonsProps) {
  return (
    <div className="flex gap-2">
      {order.status === "pending" && (
        <>
          <button
            className="p-2 bg-green-500/20 hover:bg-green-500/30 text-green-300 rounded-full"
            onClick={(e) => {
              e.stopPropagation();
              handleApprove(order.id).then((result) => {
                if (result?.success) {
                  // Update local state
                  setOrders((prevOrders) =>
                    prevOrders.map((o) =>
                      o.id === order.id ? { ...o, status: "active" } : o
                    )
                  );
                  // Update stats
                  setStats((prev) => ({
                    ...prev,
                    pending: Math.max(0, prev.pending - 1),
                    approved: prev.approved + 1,
                  }));
                }
              });
            }}
          >
            <CheckCircle size={20} />
          </button>
          <button
            className="p-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-full"
            onClick={(e) => {
              e.stopPropagation();
              handleReject(order.id);
            }}
          >
            <XCircle size={20} />
          </button>
        </>
      )}
      <button
        className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-full"
        onClick={(e) => {
          e.stopPropagation();
          setSelectedOrderId(order.id);
          setSelectedOrderDetail(order);
        }}
      >
        <Eye size={20} />
      </button>
    </div>
  );
}

export default OrderActionButtons;
