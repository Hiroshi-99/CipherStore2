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

// Add a function to generate a proper message object for insertion
export const createMessageForInsert = (message: any) => {
  // Only include fields that exist in the database schema
  return {
    id: message.id,
    content: message.content,
    user_id: message.user_id,
    order_id: message.order_id,
    is_admin: message.is_admin,
    created_at: message.created_at,
    user_name: message.user_name,
    user_avatar: message.user_avatar,
    image_url: message.image_url || null,
    // Add is_account_details if it exists
    ...(message.is_account_details ? { is_account_details: true } : {}),
  };
};

// Add a function to validate message fields against schema
export const validateMessageFields = async (message: any) => {
  try {
    // Try to get the message schema
    const { data: schema, error } = await supabase.rpc("get_table_info", {
      table_name: "messages",
    });

    if (error) {
      console.error("Error getting message schema:", error);
      console.log("Using message schema: null");
      // If we can't get the schema, return a safe subset of fields
      return {
        id: message.id,
        content: message.content,
        user_id: message.user_id,
        order_id: message.order_id,
        is_admin: message.is_admin,
        created_at: message.created_at,
        user_name: message.user_name,
        user_avatar: message.user_avatar,
        image_url: message.image_url || null,
      };
    }

    // If we have a schema, use it to validate fields
    if (schema) {
      const validFields = schema.map((col: any) => col.column_name);
      const result: any = {};

      // Only include fields that exist in the schema
      for (const field of validFields) {
        if (message[field] !== undefined) {
          result[field] = message[field];
        }
      }

      return result;
    }

    // Fallback to a safe subset of fields
    return {
      id: message.id,
      content: message.content,
      user_id: message.user_id,
      order_id: message.order_id,
      is_admin: message.is_admin,
      created_at: message.created_at,
      user_name: message.user_name,
      user_avatar: message.user_avatar,
      image_url: message.image_url || null,
    };
  } catch (err) {
    console.error("Error validating message fields:", err);
    // Return a safe subset of fields
    return {
      id: message.id,
      content: message.content,
      user_id: message.user_id,
      order_id: message.order_id,
      is_admin: message.is_admin,
      created_at: message.created_at,
      user_name: message.user_name,
      user_avatar: message.user_avatar,
      image_url: message.image_url || null,
    };
  }
};
