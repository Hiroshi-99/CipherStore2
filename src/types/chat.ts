export interface Message {
  id: string;
  content: string;
  user_name: string;
  user_avatar: string;
  is_admin: boolean;
  created_at: string;
  order_id: string;
  user_id: string;
  image_url?: string;
}

export interface Order {
  id: string;
  full_name: string;
  messages?: { id: string; created_at: string }[];
}
