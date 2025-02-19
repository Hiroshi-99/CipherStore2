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
    const { orderId, username, userId } = JSON.parse(event.body || "{}");

    // Validate all required fields
    if (!orderId || !username || !userId) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Missing required fields",
          details: "orderId, username, and userId are required",
        }),
      };
    }

    // Verify the order exists and belongs to the user
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id")
      .eq("id", orderId)
      .eq("user_id", userId)
      .single();

    if (orderError || !order) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          error: "Order not found",
          details:
            "The specified order does not exist or does not belong to this user",
        }),
      };
    }

    // Create new client instance for each request using the config function
    discordClient = new Client(getClientConfig());

    // Test Discord connection and wait for ready
    console.log("Attempting to login to Discord...");

    // Login and wait for ready state
    await Promise.all([
      discordClient.login(process.env.DISCORD_BOT_TOKEN),
      new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Discord client ready timeout"));
        }, 15000); // 15 second timeout

        const readyHandler = () => {
          if (!discordClient?.user) {
            clearTimeout(timeout);
            reject(new Error("Discord client user not available after ready"));
            return;
          }
          clearTimeout(timeout);
          resolve();
        };

        discordClient.once("ready", readyHandler);
      }),
    ]);

    if (!discordClient.user) {
      throw new Error("Discord client user not available after initialization");
    }

    console.log("Discord client ready with user:", discordClient.user.tag);

    // Test guild access
    const guild = await discordClient.guilds.fetch(
      process.env.DISCORD_GUILD_ID!
    );
    if (!guild) {
      throw new Error("Could not find Discord server");
    }
    console.log("Guild found:", guild.name);

    // Store bot user ID for permission setup
    const botId = discordClient.user.id;
    console.log("Bot ID:", botId);

    // Test category access
    const category = await guild.channels.fetch(
      process.env.DISCORD_SUPPORT_CATEGORY_ID!
    );
    if (!category) {
      throw new Error("Could not find category");
    }
    console.log("Category found:", category.name);

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
          id: botId,
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

    // After creating the Discord channel and webhook, store in Supabase
    const { error: dbError } = await supabase
      .from("discord_channels")
      .insert([
        {
          order_id: orderId,
          channel_id: channel.id,
          webhook_url: webhook.url,
          user_id: userId,
        },
      ])
      .single();

    if (dbError) {
      console.error("Database error:", dbError);
      throw new Error(`Database error: ${dbError.message}`);
    }

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
