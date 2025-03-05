import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { supabase } from "../lib/supabase";
import { toast } from "sonner";
import { isDev } from "../lib/devMode";

// Define action types
type AdminAction =
  | { type: "FETCH_START" }
  | { type: "FETCH_SUCCESS"; payload: any[] }
  | { type: "FETCH_ERROR"; error: string }
  | { type: "SET_FILTER"; filter: string }
  | { type: "SET_PAGE"; page: number }
  | { type: "ADD_ITEM"; item: any }
  | { type: "UPDATE_ITEM"; id: string; updates: any }
  | { type: "REMOVE_ITEM"; id: string };

// Define state type
interface AdminState<T> {
  items: T[];
  filteredItems: T[];
  loading: boolean;
  error: string | null;
  filter: string;
  page: number;
  hasMore: boolean;
  lastFetch: number;
}

// Create a reducer for more efficient state updates
function adminReducer<T extends { id: string }>(
  state: AdminState<T>,
  action: AdminAction
): AdminState<T> {
  switch (action.type) {
    case "FETCH_START":
      return { ...state, loading: true, error: null };
    case "FETCH_SUCCESS":
      return {
        ...state,
        loading: false,
        items: [...state.items, ...action.payload],
        filteredItems: state.filter
          ? filterItems([...state.items, ...action.payload], state.filter)
          : [...state.items, ...action.payload],
        hasMore: action.payload.length > 0,
        lastFetch: Date.now(),
      };
    case "FETCH_ERROR":
      return { ...state, loading: false, error: action.error };
    case "SET_FILTER":
      return {
        ...state,
        filter: action.filter,
        filteredItems: filterItems(state.items, action.filter),
      };
    case "SET_PAGE":
      return { ...state, page: action.page };
    case "ADD_ITEM":
      const newItems = [action.item, ...state.items];
      return {
        ...state,
        items: newItems,
        filteredItems: state.filter
          ? filterItems(newItems, state.filter)
          : newItems,
      };
    case "UPDATE_ITEM":
      const updatedItems = state.items.map((item) =>
        item.id === action.id ? { ...item, ...action.updates } : item
      );
      return {
        ...state,
        items: updatedItems,
        filteredItems: state.filter
          ? filterItems(updatedItems, state.filter)
          : updatedItems,
      };
    case "REMOVE_ITEM":
      const filteredItems = state.items.filter((item) => item.id !== action.id);
      return {
        ...state,
        items: filteredItems,
        filteredItems: state.filter
          ? filterItems(filteredItems, state.filter)
          : filteredItems,
      };
    default:
      return state;
  }
}

// Helper function to filter items
function filterItems<T>(items: T[], filter: string): T[] {
  if (!filter) return items;
  const lowerFilter = filter.toLowerCase();
  return items.filter((item) => {
    return Object.values(item).some((value) => {
      if (typeof value === "string") {
        return value.toLowerCase().includes(lowerFilter);
      }
      return false;
    });
  });
}

// Reusable hook for admin data with built-in optimization
export function useAdminData<T extends { id: string }>(options: {
  fetchFn: (page: number, pageSize: number) => Promise<T[]>;
  pageSize?: number;
  cacheDuration?: number;
}) {
  const { fetchFn, pageSize = 50, cacheDuration = 60000 } = options;

  // Use useReducer for more efficient state management
  const [state, dispatch] = useReducer(adminReducer<T>, {
    items: [],
    filteredItems: [],
    loading: false,
    error: null,
    filter: "",
    page: 0,
    hasMore: true,
    lastFetch: 0,
  });

  // Keep track of in-flight requests
  const requestsInProgress = useRef(new Set<number>());

  // Cache results
  const cache = useRef<Map<number, { data: T[]; timestamp: number }>>(
    new Map()
  );

  // Fetch data with caching, deduplication, and error handling
  const fetchData = useCallback(
    async (page: number = state.page) => {
      // Skip if this page is already being fetched
      if (requestsInProgress.current.has(page)) return;

      // Check cache first
      const cachedData = cache.current.get(page);
      const now = Date.now();

      if (
        cachedData &&
        now - cachedData.timestamp < cacheDuration &&
        cachedData.data.length > 0
      ) {
        dispatch({ type: "FETCH_SUCCESS", payload: cachedData.data });
        return;
      }

      dispatch({ type: "FETCH_START" });
      requestsInProgress.current.add(page);

      try {
        const data = await fetchFn(page, pageSize);

        // Cache the results
        cache.current.set(page, { data, timestamp: now });

        dispatch({ type: "FETCH_SUCCESS", payload: data });
      } catch (err) {
        console.error("Error fetching data:", err);
        dispatch({
          type: "FETCH_ERROR",
          error: err instanceof Error ? err.message : "Unknown error",
        });

        if (isDev()) {
          toast.error(
            `Data fetch error: ${
              err instanceof Error ? err.message : "Unknown error"
            }`
          );
        }
      } finally {
        requestsInProgress.current.delete(page);
      }
    },
    [fetchFn, pageSize, cacheDuration, state.page]
  );

  // Load more data
  const loadMore = useCallback(() => {
    if (state.loading || !state.hasMore) return;

    const nextPage = state.page + 1;
    dispatch({ type: "SET_PAGE", page: nextPage });
    fetchData(nextPage);
  }, [state.loading, state.hasMore, state.page, fetchData]);

  // Set filter with debounce
  const debouncedFilterRef = useRef<NodeJS.Timeout | null>(null);

  const setFilter = useCallback((filter: string) => {
    if (debouncedFilterRef.current) {
      clearTimeout(debouncedFilterRef.current);
    }

    debouncedFilterRef.current = setTimeout(() => {
      dispatch({ type: "SET_FILTER", filter });
    }, 300);
  }, []);

  // CRUD operations
  const addItem = useCallback((item: T) => {
    dispatch({ type: "ADD_ITEM", item });
  }, []);

  const updateItem = useCallback((id: string, updates: Partial<T>) => {
    dispatch({ type: "UPDATE_ITEM", id, updates });
  }, []);

  const removeItem = useCallback((id: string) => {
    dispatch({ type: "REMOVE_ITEM", id });
  }, []);

  // Initial fetch
  useEffect(() => {
    if (state.items.length === 0 && state.hasMore && !state.loading) {
      fetchData(0);
    }
  }, [fetchData, state.items.length, state.hasMore, state.loading]);

  // Return everything needed
  return {
    items: state.filteredItems,
    loading: state.loading,
    error: state.error,
    hasMore: state.hasMore,
    filter: state.filter,
    setFilter,
    loadMore,
    refresh: () => fetchData(state.page),
    addItem,
    updateItem,
    removeItem,
  };
}

// Hook for orders with optimized performance
export function useOrdersOptimized() {
  const fetchOrders = useCallback(async (page: number, pageSize: number) => {
    try {
      // First try the most efficient approach with RLS
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (!error && data) {
        return data;
      }

      // If that fails, try a serverless function
      const response = await fetch("/.netlify/functions/admin-list-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page, pageSize }),
      });

      if (response.ok) {
        const result = await response.json();
        return result.orders || [];
      }

      throw new Error("Failed to fetch orders");
    } catch (err) {
      console.error("Error in fetchOrders:", err);

      // In development, return mock data
      if (isDev()) {
        return Array.from({ length: pageSize }, (_, i) => ({
          id: `mock-order-${page * pageSize + i}`,
          status: ["pending", "active", "rejected"][
            Math.floor(Math.random() * 3)
          ],
          created_at: new Date(
            Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000
          ).toISOString(),
          customer_name: `Test Customer ${page * pageSize + i}`,
          email: `customer${page * pageSize + i}@example.com`,
        }));
      }

      throw err;
    }
  }, []);

  return useAdminData({ fetchFn: fetchOrders });
}

// Hook for users with optimized performance
export function useUsersOptimized() {
  const fetchUsers = useCallback(async (page: number, pageSize: number) => {
    try {
      // Try serverless function first (most reliable)
      const response = await fetch(
        "/.netlify/functions/admin-list-users-simple",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ page, pageSize }),
        }
      );

      if (response.ok) {
        const result = await response.json();
        return result.users || [];
      }

      // Fallback to direct query (might fail due to permissions)
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (!error && data) {
        return data;
      }

      throw new Error("Failed to fetch users");
    } catch (err) {
      console.error("Error in fetchUsers:", err);

      // In development, return mock data
      if (isDev()) {
        return Array.from({ length: pageSize }, (_, i) => ({
          id: `mock-user-${page * pageSize + i}`,
          email: `user${page * pageSize + i}@example.com`,
          fullName: `Test User ${page * pageSize + i}`,
          isAdmin: Math.random() > 0.8,
          lastSignIn: new Date(
            Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000
          ).toISOString(),
          createdAt: new Date(
            Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000
          ).toISOString(),
        }));
      }

      throw err;
    }
  }, []);

  return useAdminData({ fetchFn: fetchUsers });
}
