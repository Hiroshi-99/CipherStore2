import { supabase } from "../lib/supabase";

/**
 * Fetches a batch of UUIDs from the database
 * @param count Number of UUIDs to fetch (default: 10)
 * @returns Array of UUID strings
 */
export const fetchUUIDs = async (count: number = 10): Promise<string[]> => {
  try {
    // Try to use the PostgreSQL gen_random_uuid() function via RPC
    const { data, error } = await supabase.rpc("generate_uuids", {
      count: count,
    });

    if (error) {
      console.error("Error fetching UUIDs from database:", error);
      // If the RPC fails, create the function and try again
      await createGenerateUUIDsFunction();

      // Retry once after creating the function
      const retryResult = await supabase.rpc("generate_uuids", {
        count: count,
      });

      if (retryResult.error) {
        console.error("Error fetching UUIDs after retry:", retryResult.error);
        // Fall back to client-side generation
        return Array(count)
          .fill(0)
          .map(() => crypto.randomUUID());
      }

      return retryResult.data || [];
    }

    return data || [];
  } catch (err) {
    console.error("Exception fetching UUIDs:", err);
    // Fall back to client-side generation
    return Array(count)
      .fill(0)
      .map(() => crypto.randomUUID());
  }
};

/**
 * Gets a single UUID from the database or generates one client-side
 * @returns A UUID string
 */
export const getUUID = async (): Promise<string> => {
  try {
    const uuids = await fetchUUIDs(1);
    return uuids[0] || crypto.randomUUID();
  } catch (err) {
    console.error("Error getting UUID:", err);
    return crypto.randomUUID();
  }
};

/**
 * Creates the generate_uuids function in the database
 */
const createGenerateUUIDsFunction = async (): Promise<void> => {
  try {
    const { error } = await supabase.rpc("exec_sql", {
      sql: `
        CREATE OR REPLACE FUNCTION public.generate_uuids(count integer)
        RETURNS SETOF uuid
        LANGUAGE plpgsql
        SECURITY DEFINER
        AS $$
        BEGIN
          FOR i IN 1..count LOOP
            RETURN NEXT gen_random_uuid();
          END LOOP;
          RETURN;
        END;
        $$;
        
        GRANT EXECUTE ON FUNCTION public.generate_uuids(integer) TO authenticated;
        GRANT EXECUTE ON FUNCTION public.generate_uuids(integer) TO anon;
        GRANT EXECUTE ON FUNCTION public.generate_uuids(integer) TO service_role;
      `,
    });

    if (error) {
      console.error("Error creating generate_uuids function:", error);
      throw error;
    }
  } catch (err) {
    console.error("Exception creating generate_uuids function:", err);
    throw err;
  }
};

/**
 * Prefetches a batch of UUIDs and stores them in memory for faster access
 */
class UUIDCache {
  private cache: string[] = [];
  private fetchingPromise: Promise<void> | null = null;
  private readonly lowThreshold = 5;
  private readonly batchSize = 20;

  /**
   * Gets a UUID from the cache or fetches more if needed
   */
  async getUUID(): Promise<string> {
    // If cache is running low, fetch more UUIDs
    if (this.cache.length < this.lowThreshold && !this.fetchingPromise) {
      this.fetchMore();
    }

    // If we have UUIDs in the cache, return one
    if (this.cache.length > 0) {
      return this.cache.pop()!;
    }

    // If we're currently fetching, wait for it to complete
    if (this.fetchingPromise) {
      await this.fetchingPromise;
      return this.getUUID();
    }

    // Last resort: generate a UUID client-side
    return crypto.randomUUID();
  }

  /**
   * Fetches more UUIDs from the database
   */
  private async fetchMore(): Promise<void> {
    this.fetchingPromise = (async () => {
      try {
        const uuids = await fetchUUIDs(this.batchSize);
        this.cache.push(...uuids);
      } catch (err) {
        console.error("Error fetching UUIDs for cache:", err);
        // Add some client-side generated UUIDs as fallback
        const fallbackUUIDs = Array(this.batchSize)
          .fill(0)
          .map(() => crypto.randomUUID());
        this.cache.push(...fallbackUUIDs);
      } finally {
        this.fetchingPromise = null;
      }
    })();
  }
}

// Create a singleton instance of the UUID cache
export const uuidCache = new UUIDCache();
