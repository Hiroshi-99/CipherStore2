import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { toast } from "sonner";
import type { Order } from "./useOrderFilters";

export function useAdminOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [hasMoreOrders, setHasMoreOrders] = useState(true);
  const [isFetchingNextPage, setIsFetchingNextPage] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
  });

  const fetchOrders = useCallback(
    async (page = 1, append = false) => {
      const pageToFetch = page || currentPage;

      if (page === 1) {
        setRefreshing(true);
      } else {
        setIsFetchingNextPage(true);
      }

      try {
        // Calculate range for pagination
        const from = (pageToFetch - 1) * pageSize;
        const to = from + pageSize - 1;

        // Use a more efficient query with pagination
        const { data: ordersData, error: ordersError } = await supabase
          .from("orders")
          .select(
            `
          *,
          payment_proofs:payment_proofs(*),
          messages:messages(id)
        `
          )
          .order("created_at", { ascending: false })
          .range(from, to);

        if (ordersError) {
          console.error("Error fetching orders:", ordersError);
          toast.error("Failed to load orders");
          return;
        }

        if (ordersData) {
          console.log(
            `Fetched ${ordersData.length} orders for page ${pageToFetch}`
          );

          // If we got fewer items than requested, there are no more pages
          setHasMoreOrders(ordersData.length === pageSize);

          // Update state based on whether we're appending or replacing
          if (append) {
            setOrders((prevOrders) => [...prevOrders, ...ordersData]);
          } else {
            setOrders(ordersData);
          }

          // Update the current page
          setCurrentPage(pageToFetch);

          // Calculate statistics more efficiently
          if (!append) {
            const statusCounts = ordersData.reduce((counts, order) => {
              counts[order.status] = (counts[order.status] || 0) + 1;
              return counts;
            }, {} as Record<string, number>);

            setStats({
              total: ordersData.length,
              pending: statusCounts.pending || 0,
              approved: statusCounts.active || 0,
              rejected: statusCounts.rejected || 0,
            });
          }
        }
      } catch (err) {
        console.error("Error in fetchOrders:", err);
        toast.error("Failed to load orders");
      } finally {
        setRefreshing(false);
        setIsFetchingNextPage(false);
        setLoading(false);
      }
    },
    [currentPage, pageSize]
  );

  const loadMoreOrders = useCallback(() => {
    if (hasMoreOrders && !isFetchingNextPage) {
      fetchOrders(currentPage + 1, true);
    }
  }, [fetchOrders, hasMoreOrders, isFetchingNextPage, currentPage]);

  // Initial load
  useEffect(() => {
    fetchOrders(1, false);
  }, [fetchOrders]);

  // Optimized handlers
  const handleApprove = useCallback(async (orderId: string) => {
    if (!confirm("Are you sure you want to approve this order?")) {
      return;
    }

    try {
      // Update the order status to active
      const { error } = await supabase
        .from("orders")
        .update({ status: "active" })
        .eq("id", orderId);

      if (error) throw error;

      // Update optimistically
      setOrders((prevOrders) =>
        prevOrders.map((order) =>
          order.id === orderId ? { ...order, status: "active" } : order
        )
      );

      toast.success("Order approved successfully");
    } catch (err) {
      console.error("Error in handleApprove:", err);
      toast.error("Failed to approve order");
    }
  }, []);

  const handleReject = useCallback(async (orderId: string) => {
    if (!confirm("Are you sure you want to reject this order?")) {
      return;
    }

    try {
      // Update the order status to rejected
      const { error } = await supabase
        .from("orders")
        .update({ status: "rejected" })
        .eq("id", orderId);

      if (error) throw error;

      // Update optimistically
      setOrders((prevOrders) =>
        prevOrders.map((order) =>
          order.id === orderId ? { ...order, status: "rejected" } : order
        )
      );

      toast.success("Order rejected successfully");
    } catch (err) {
      console.error("Error in handleReject:", err);
      toast.error("Failed to reject order");
    }
  }, []);

  return {
    orders,
    loading,
    refreshing,
    stats,
    hasMoreOrders,
    isFetchingNextPage,
    fetchOrders,
    loadMoreOrders,
    handleApprove,
    handleReject,
    setPageSize,
  };
}
