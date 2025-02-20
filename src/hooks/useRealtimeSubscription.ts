import { useEffect, useCallback } from "react";
import { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

type SubscriptionCallback<T> = (payload: {
  new: T;
  old: T;
  eventType: "INSERT" | "UPDATE" | "DELETE";
}) => void;

interface SubscriptionOptions {
  event?: "INSERT" | "UPDATE" | "DELETE" | "*";
  filter?: string;
}

export function useRealtimeSubscription<T>(
  table: string,
  callback: SubscriptionCallback<T>,
  options: SubscriptionOptions = {}
) {
  const subscribe = useCallback(() => {
    const channel = supabase
      .channel(`${table}-changes`)
      .on(
        "postgres_changes",
        {
          event: options.event || "*",
          schema: "public",
          table: table,
          filter: options.filter,
        },
        callback
      )
      .subscribe();

    return channel;
  }, [table, callback, options.event, options.filter]);

  useEffect(() => {
    const channel = subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [subscribe]);
}
