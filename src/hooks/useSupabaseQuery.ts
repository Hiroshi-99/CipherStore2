import { useCallback, useEffect, useState } from "react";
import { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

export function useSupabaseQuery<T>(
  query: string,
  options: { enabled?: boolean; dependencies?: any[] } = {}
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<PostgrestError | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from(query).select("*");

      if (error) throw error;
      setData(data as T);
    } catch (err) {
      setError(err as PostgrestError);
      console.error(`Query error (${query}):`, err);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    if (options.enabled !== false) {
      fetchData();
    }
  }, [fetchData, ...(options.dependencies || [])]);

  return { data, error, loading, refetch: fetchData };
}
