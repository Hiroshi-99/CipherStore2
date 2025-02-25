import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

export { supabase };

export async function insertMessage(message: {
  id: string;
  content?: string;
  [key: string]: any;
}) {
  try {
    const { data, error } = await supabase.from("messages").insert({
      id: crypto.randomUUID(),
      temp_id: message.id,
      content: message.content,
      user_id: message.user_id,
      order_id: message.order_id,
      is_admin: message.is_admin,
      created_at: message.created_at || new Date().toISOString(),
      user_name: message.user_name,
      user_avatar: message.user_avatar,
      image_url: message.image_url,
    });

    if (error) {
      console.error("Error inserting message:", error);
      return { data: null, error };
    }

    return { data, error: null };
  } catch (err) {
    console.error("Exception inserting message:", err);
    return { data: null, error: err };
  }
}

export async function saveMessage({
  id,
  content,
  metadata = {},
}: {
  id: string;
  content?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    const { data, error } = await supabase.from("messages").insert({
      id,
      content,
      metadata,
    });

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error("Error saving message:", err);
    return { success: false, error: err };
  }
}
