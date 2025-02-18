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
    console.log("Verifying user authentication...");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));

    if (authError || !user) {
      console.error("Authentication error:", authError);
      return {
        statusCode: 401,
        body: JSON.stringify({
          error: "Invalid token",
          details: authError?.message,
        }),
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

    console.log("Logging in to Discord...");
    await client.login(DISCORD_TOKEN);

    console.log("Fetching guild...");
    const guild = await client.guilds.fetch(GUILD_ID);

    if (!guild) {
      throw new Error("Could not find Discord server");
    }

    console.log("Creating channel...");
    const channel = await guild.channels.create({
      name: `order-${orderId.substring(0, 8)}`,
      type: 0, // Text channel
      parent: SUPPORT_CATEGORY_ID,
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

    console.log("Creating webhook...");
    const webhook = await channel.createWebhook({
      name: "Order Bot",
      avatar: "https://your-bot-avatar.png",
    });

    console.log("Storing channel info in database...");
    const { error: dbError } = await supabase.from("discord_channels").insert([
      {
        order_id: orderId,
        channel_id: channel.id,
        webhook_url: webhook.url,
      },
    ]);

    if (dbError) {
      console.error("Database error:", dbError);
      throw dbError;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        channelId: channel.id,
        webhookUrl: webhook.url,
      }),
    };
  } catch (error) {
    console.error("Error creating Discord channel:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Failed to create Discord channel",
        details: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      }),
    };
  } finally {
    if (client) {
      console.log("Destroying Discord client...");
      await client.destroy();
    }
  }
};
