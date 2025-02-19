import { Handler } from "@netlify/functions";
import { Client, GatewayIntentBits, PermissionFlagsBits } from "discord.js";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Add more detailed debug logging
console.log("Function loaded, checking environment...");
console.log("DISCORD_TOKEN length:", process.env.DISCORD_BOT_TOKEN?.length);
console.log("GUILD_ID:", process.env.DISCORD_GUILD_ID);
console.log("CATEGORY_ID:", process.env.DISCORD_SUPPORT_CATEGORY_ID);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

export const handler: Handler = async (event) => {
  console.log("Handler called with method:", event.httpMethod);

  // Verify authentication
  const authHeader = event.headers.authorization;
  if (!authHeader) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: "No authorization header" }),
    };
  }

  try {
    // Test Discord connection
    console.log("Attempting to login to Discord...");
    try {
      await client.login(process.env.DISCORD_BOT_TOKEN);
      console.log("Discord login successful!");
    } catch (loginError) {
      console.error("Discord login failed:", loginError);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Discord login failed",
          details:
            loginError instanceof Error ? loginError.message : "Unknown error",
        }),
      };
    }

    // Test guild access
    console.log("Fetching guild...");
    const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID!);
    console.log("Guild found:", guild.name);

    // Test category access
    console.log("Fetching category...");
    const category = await guild.channels.fetch(
      process.env.DISCORD_SUPPORT_CATEGORY_ID!
    );
    console.log("Category found:", category?.name);

    const { orderId, username } = JSON.parse(event.body || "{}");
    console.log("Creating channel for order:", orderId);

    // Create the channel
    const channel = await guild.channels.create({
      name: `order-${orderId.substring(0, 8)}`,
      type: 0,
      parent: process.env.DISCORD_SUPPORT_CATEGORY_ID,
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

    console.log("Channel created:", channel.name);

    // Create webhook
    console.log("Creating webhook...");
    const webhook = await channel.createWebhook({
      name: "Order Bot",
      avatar: "https://your-bot-avatar.png",
    });
    console.log("Webhook created");

    return {
      statusCode: 200,
      body: JSON.stringify({
        channelId: channel.id,
        webhookUrl: webhook.url,
      }),
    };
  } catch (error) {
    console.error("Function error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Failed to create Discord channel",
        details: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      }),
    };
  } finally {
    if (client.isReady()) {
      console.log("Destroying Discord client...");
      await client.destroy();
    }
  }
};
