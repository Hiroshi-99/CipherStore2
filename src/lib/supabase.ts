import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

export { supabase };

export async function insertMessage(message) {
  const { data, error } = await supabase.from("messages").insert({
    id: crypto.randomUUID(),
    temp_id: message.id,
  });
}
