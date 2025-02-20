import { useState, useCallback } from "react";
import { supabase } from "../lib/supabase";

interface Order {
  id: string;
  full_name: string;
  messages?: { id: string; created_at: string }[];
}

export function useOrders(isAdmin: boolean) {
  const [userOrders, setUserOrders] = useState<Order[]>([]);
  const [adminOrders, setAdminOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUserOrders = useCallback(async (userId: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("orders")
        .select("id, full_name")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setUserOrders(data || []);
      return data?.[0]?.id;
    } catch (err) {
      console.error("Error fetching user orders:", err);
      setError("Failed to load orders");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAdminOrders = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("orders")
        .select(
          `
          id,
          full_name,
          messages (
            id,
            created_at
          )
        `
        )
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAdminOrders(data || []);
      return data?.[0]?.id;
    } catch (err) {
      console.error("Error fetching admin orders:", err);
      setError("Failed to load orders");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    orders: isAdmin ? adminOrders : userOrders,
    loading,
    error,
    fetchUserOrders,
    fetchAdminOrders,
  };
}
