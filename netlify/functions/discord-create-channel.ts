import { Handler } from "@netlify/functions";
import { Client, GatewayIntentBits, ChannelType } from "discord.js";
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

export const handler: Handler = async (event) => {
  let discordClient: Client | null = null;

  // Log the incoming request
  console.log("Received request body:", event.body);

  // Verify authentication
  const authHeader = event.headers.authorization;
  if (!authHeader) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: "No authorization header" }),
    };
  }

  try {
    const { orderId, customerName } = JSON.parse(event.body || "{}");

    // Log parsed data
    console.log("Parsed request data:", { orderId, customerName });

    if (!orderId || !customerName) {
      console.log("Missing fields:", { orderId, customerName });
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Missing required fields",
          received: { orderId, customerName },
        }),
      };
    }

    // Initialize Discord client
    discordClient = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    await discordClient.login(process.env.DISCORD_BOT_TOKEN);

    const guild = await discordClient.guilds.fetch(
      process.env.DISCORD_GUILD_ID!
    );

    // Create the channel
    const channel = await guild.channels.create({
      name: `support-${orderId.slice(0, 8)}`,
      type: ChannelType.GuildText,
      parent: process.env.DISCORD_SUPPORT_CATEGORY_ID,
      topic: `Support channel for ${customerName} - Order ID: ${orderId}`,
    });

    // Create webhook for the channel
    const webhook = await channel.createWebhook({
      name: "Chat Relay",
      reason: "Relay messages between web app and Discord",
    });

    // Store channel info in database
    const { error: dbError } = await supabase.from("discord_channels").insert([
      {
        order_id: orderId,
        channel_id: channel.id,
        webhook_url: webhook.url,
      },
    ]);

    if (dbError) {
      throw new Error(`Database error: ${dbError.message}`);
    }

    // Send initial message
    await channel.send(
      `New support channel created for ${customerName}\nOrder ID: ${orderId}`
    );

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
