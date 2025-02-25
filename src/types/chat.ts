export interface Message {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  order_id: string;
  is_admin: boolean;
  is_read?: boolean;
  user_name?: string;
  user_avatar?: string;
  image_url?: string | null;
  status?: "sending" | "sent" | "failed";
  is_account_details?: boolean;
}

export interface Order {
  id: string;
  full_name: string;
  messages?: { id: string; created_at: string }[];
}
