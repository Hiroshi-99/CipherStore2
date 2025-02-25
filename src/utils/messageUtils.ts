// Add this utility function to generate proper UUIDs for messages
export const createMessage = (
  content: string,
  user: any,
  orderId: string,
  isAdmin: boolean,
  imageUrl?: string
) => {
  return {
    id: crypto.randomUUID(), // Generate a proper UUID
    content,
    user_name: user?.user_metadata?.full_name || (isAdmin ? "Support" : "User"),
    user_avatar: user?.user_metadata?.avatar_url || "",
    is_admin: isAdmin,
    created_at: new Date().toISOString(),
    order_id: orderId,
    user_id: user?.id || "",
    image_url: imageUrl || "",
    is_read: false,
  };
};
