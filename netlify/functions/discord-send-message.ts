import { Handler } from "@netlify/functions";
import { WebhookClient } from "discord.js";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const handler: Handler = async (event) => {
  // Verify authentication
  const authHeader = event.headers.authorization;
  if (!authHeader) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: "No authorization header" }),
    };
  }

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));

    if (error || !user) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "Invalid token" }),
      };
    }

    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const { channelId, content, username, avatar_url, orderId } = JSON.parse(
      event.body || "{}"
    );

    if (!channelId || !content) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing required fields" }),
      };
    }

    // Get webhook URL from database
    const { data: channelData, error: dbError } = await supabase
      .from("discord_channels")
      .select("webhook_url")
      .eq("channel_id", channelId)
      .single();

    if (dbError || !channelData?.webhook_url) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Channel not found" }),
      };
    }

    const webhook = new WebhookClient({ url: channelData.webhook_url });
    const message = await webhook.send({
      content,
      username,
      avatarURL: avatar_url,
    });

    // Update Supabase with the new message
    const { error: dbErrorInsert } = await supabase.from("messages").insert([
      {
        order_id: orderId,
        user_id: user.id,
        content: content,
        user_name: username,
        user_avatar: avatar_url,
        discord_message_id: message.id,
      },
    ]);

    if (dbErrorInsert) {
      throw new Error(`Database error: ${dbErrorInsert.message}`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        id: message.id,
        content: message.content,
      }),
    };
  } catch (error) {
    console.error("Error sending message:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Failed to send message",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
    };
  }
};
