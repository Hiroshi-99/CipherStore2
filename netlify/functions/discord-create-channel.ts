import { Handler } from "@netlify/functions";
import {
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
  ChannelType,
} from "discord.js";
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

// Create a function to get client config to avoid duplication
const getClientConfig = () => ({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  rest: {
    timeout: 60000,
    retries: 3,
  },
});

export const handler: Handler = async (event) => {
  console.log("Handler called with method:", event.httpMethod);

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  let discordClient: Client | null = null;

  try {
    // Create new client instance for each request using the config function
    discordClient = new Client(getClientConfig());

    // Test Discord connection
    console.log("Attempting to login to Discord...");
    await discordClient.login(process.env.DISCORD_BOT_TOKEN);
    console.log("Discord login successful!");

    // Wait for client to be ready
    await new Promise((resolve) => {
      if (discordClient!.isReady()) resolve(true);
      else discordClient!.once("ready", resolve);
    });
    console.log("Discord client ready");

    // Test guild access
    console.log("Fetching guild...");
    const guild = await discordClient.guilds.fetch(
      process.env.DISCORD_GUILD_ID!
    );
    if (!guild) {
      throw new Error("Could not find Discord server");
    }
    console.log("Guild found:", guild.name);

    // Test category access
    console.log("Fetching category...");
    const category = await guild.channels.fetch(
      process.env.DISCORD_SUPPORT_CATEGORY_ID!
    );
    if (!category) {
      throw new Error("Could not find category");
    }
    console.log("Category found:", category.name);

    const { orderId, username } = JSON.parse(event.body || "{}");
    if (!orderId || !username) {
      throw new Error("Missing orderId or username");
    }
    console.log("Creating channel for order:", orderId);

    // Create the channel with correct type specification
    const channel = await guild.channels.create({
      name: `order-${orderId.substring(0, 8)}`,
      type: ChannelType.GuildText,
      parent: process.env.DISCORD_SUPPORT_CATEGORY_ID,
      topic: `Support channel for ${username}'s order`,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: discordClient.user!.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ManageWebhooks,
          ],
        },
      ],
    });

    console.log("Channel created:", channel.name);

    // Create webhook with default Discord avatar
    console.log("Creating webhook...");
    const webhook = await channel.createWebhook({
      name: "Order Bot",
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
    if (discordClient?.isReady()) {
      console.log("Destroying Discord client...");
      try {
        await discordClient.destroy();
      } catch (error) {
        console.error("Error destroying client:", error);
      }
    }
  }
};
