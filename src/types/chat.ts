export interface Message {
  id: string;
  content: string;
  user_id: string;
  order_id: string;
  created_at: string;
  is_admin: boolean;
  user_name: string;
  user_avatar: string;
  image_url?: string;
  is_read?: boolean;
  failed?: boolean;
  is_account_details?: boolean;
}

export interface Order {
  id: string;
  full_name: string;
  messages?: { id: string; created_at: string }[];
}
