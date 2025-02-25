import { useState, useMemo, useCallback } from "react";

export interface Order {
  id: string;
  full_name: string;
  email: string;
  status: string;
  created_at: string;
  account_file_url?: string;
  account_id?: string;
  account_password?: string;
  delivery_date?: string;
  payment_proofs?: {
    id: string;
    image_url: string;
    status: string;
  }[];
  messages?: { id: string }[];
}

export interface DateRange {
  start: Date | null;
  end: Date | null;
}

export type SortField = "date" | "status" | "name";
export type SortDirection = "asc" | "desc";
export type FilterStatus = "all" | "pending" | "approved" | "rejected";

export function useOrderFilters(orders: Order[]) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>({
    start: null,
    end: null,
  });
  const [sortBy, setSortBy] = useState<SortField>("date");
  const [sortOrder, setSortOrder] = useState<SortDirection>("desc");

  // Calculate stats once for the entire order set
  const stats = useMemo(() => {
    return {
      total: orders.length,
      pending: orders.filter((order) => order.status === "pending").length,
      approved: orders.filter((order) => order.status === "active").length,
      rejected: orders.filter((order) => order.status === "rejected").length,
    };
  }, [orders]);

  // Toggle sort direction or change sort field
  const toggleSort = useCallback(
    (field: SortField) => {
      if (sortBy === field) {
        setSortOrder(sortOrder === "asc" ? "desc" : "asc");
      } else {
        setSortBy(field);
        setSortOrder("asc");
      }
    },
    [sortBy, sortOrder]
  );

  // Toggle status selection
  const toggleStatus = useCallback((status: string) => {
    setSelectedStatuses((prev) => {
      if (prev.includes(status)) {
        return prev.filter((s) => s !== status);
      } else {
        return [...prev, status];
      }
    });
  }, []);

  // Clear all filters
  const clearFilters = useCallback(() => {
    setSearchTerm("");
    setSelectedStatuses([]);
    setDateRange({ start: null, end: null });
  }, []);

  // Apply all filters and sorting to orders
  const filteredOrders = useMemo(() => {
    return orders
      .filter((order) => {
        const matchesSearch =
          order.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          order.email.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesDateRange =
          (!dateRange.start || new Date(order.created_at) >= dateRange.start) &&
          (!dateRange.end || new Date(order.created_at) <= dateRange.end);

        const matchesStatus =
          selectedStatuses.length === 0 ||
          selectedStatuses.includes(order.status);

        return matchesSearch && matchesDateRange && matchesStatus;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case "date":
            return sortOrder === "asc"
              ? new Date(a.created_at).getTime() -
                  new Date(b.created_at).getTime()
              : new Date(b.created_at).getTime() -
                  new Date(a.created_at).getTime();
          case "status":
            return sortOrder === "asc"
              ? a.status.localeCompare(b.status)
              : b.status.localeCompare(a.status);
          case "name":
            return sortOrder === "asc"
              ? a.full_name.localeCompare(b.full_name)
              : b.full_name.localeCompare(a.full_name);
          default:
            return 0;
        }
      });
  }, [orders, searchTerm, dateRange, selectedStatuses, sortBy, sortOrder]);

  return {
    searchTerm,
    setSearchTerm,
    selectedStatuses,
    setSelectedStatuses,
    toggleStatus,
    dateRange,
    setDateRange,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    toggleSort,
    filteredOrders,
    stats,
    clearFilters,
  };
}
