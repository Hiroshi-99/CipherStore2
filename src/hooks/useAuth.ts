import { useEffect, useState } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkUser = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.user) {
          setLoading(false);
          return;
        }

        setUser(session.user);

        const { data: adminData } = await supabase
          .from("admin_users")
          .select("*")
          .eq("user_id", session.user.id)
          .maybeSingle();

        setIsAdmin(!!adminData);
      } catch (error) {
        console.error("Auth check error:", error);
      } finally {
        setLoading(false);
      }
    };

    checkUser();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null);
        if (session?.user) {
          const { data: adminData } = await supabase
            .from("admin_users")
            .select("*")
            .eq("user_id", session.user.id)
            .maybeSingle();
          setIsAdmin(!!adminData);
        } else {
          setIsAdmin(false);
        }
      }
    );

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, []);

  return { user, isAdmin, loading };
}
