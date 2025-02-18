import { Handler } from "@netlify/functions";
import { Client, GatewayIntentBits, PermissionFlagsBits } from "discord.js";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});
const DISCORD_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const SUPPORT_CATEGORY_ID = process.env.DISCORD_SUPPORT_CATEGORY_ID;

// Validate required environment variables
if (!DISCORD_TOKEN || !GUILD_ID || !SUPPORT_CATEGORY_ID) {
  throw new Error("Missing required environment variables");
}

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

    const { orderId, username } = JSON.parse(event.body || "{}");

    if (!orderId || !username) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing orderId or username" }),
      };
    }

    await client.login(DISCORD_TOKEN);
    const guild = await client.guilds.fetch(GUILD_ID as string);

    // Create channel with proper permissions
    const channel = await guild.channels.create({
      name: `order-${orderId}`,
      parent: SUPPORT_CATEGORY_ID as string,
      topic: `Support channel for ${username}'s order`,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: client.user!.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ManageWebhooks,
          ],
        },
      ],
    });

    // Create webhook for the channel
    const webhook = await channel.createWebhook({
      name: "Order Bot",
      avatar: "https://your-bot-avatar.png",
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        channelId: channel.id,
        webhookUrl: webhook.url,
      }),
    };
  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Failed to create Discord channel",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
    };
  } finally {
    client.destroy();
  }
};
