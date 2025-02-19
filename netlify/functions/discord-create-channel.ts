import { Handler } from "@netlify/functions";
import {
  Client,
  GatewayIntentBits,
  ChannelType,
  ThreadAutoArchiveDuration,
  EmbedBuilder,
} from "discord.js";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase client with service role key for admin access
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Validate environment variables
const requiredEnvVars = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  DISCORD_GUILD_ID: process.env.DISCORD_GUILD_ID,
  DISCORD_CHANNEL_ID: process.env.DISCORD_CHANNEL_ID,
};

// Check all required environment variables
Object.entries(requiredEnvVars).forEach(([key, value]) => {
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
});

// Add more detailed debug logging
// console.log("Function loaded, checking environment...");
// console.log("DISCORD_TOKEN length:", process.env.DISCORD_TOKEN?.length);
// console.log("GUILD_ID:", process.env.DISCORD_GUILD_ID);
// console.log("DISCORD_CHANNEL_ID:", process.env.DISCORD_CHANNEL_ID);

export const handler: Handler = async (event) => {
  let discordClient: Client | null = null;

  try {
    // Verify authentication
    const authHeader = event.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "Unauthorized" }),
      };
    }

    const token = authHeader.split(" ")[1];
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "Invalid token" }),
      };
    }

    // Parse and validate request body
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Bad Request",
          details: "Request body is empty",
        }),
      };
    }

    const parsedBody = JSON.parse(event.body);
    // Remove this line in production
    // console.log("Parsed request body:", parsedBody);

    const { orderId, customerName, paymentProofUrl, userId } = parsedBody;

    if (!orderId || !customerName || !userId) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Bad Request",
          details: "Missing required fields",
          received: { orderId, customerName, userId },
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

    // Login to Discord
    try {
      await discordClient.login(process.env.DISCORD_TOKEN);
      // Remove this line in production
      // console.log("Successfully logged into Discord");
    } catch (loginError) {
      console.error("Discord login error:", loginError);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Discord Authentication Failed",
          details:
            loginError instanceof Error
              ? loginError.message
              : "Unknown login error",
        }),
      };
    }

    // Fetch guild and channel
    const guild = await discordClient.guilds.fetch(
      process.env.DISCORD_GUILD_ID!
    );
    if (!guild) {
      throw new Error("Could not find Discord guild");
    }

    const channel = await guild.channels.fetch(process.env.DISCORD_CHANNEL_ID!);
    if (!channel || channel.type !== ChannelType.GuildText) {
      throw new Error(
        "Could not find Discord channel or channel is not a text channel"
      );
    }

    // Create embed for order details
    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle(`New Order - ${customerName}`)
      .setDescription(`Order ID: ${orderId}`)
      .addFields(
        { name: "Customer", value: customerName, inline: true },
        { name: "Status", value: "Pending Review", inline: true }
      )
      .setTimestamp();

    if (paymentProofUrl) {
      embed.setImage(paymentProofUrl);
    }

    // Create thread
    let thread;
    try {
      thread = await channel.threads.create({
        name: `Order #${orderId} - ${customerName}`,
        autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
        reason: `Order thread for ${customerName}`,
      });
      // Remove this line in production
      // console.log("Successfully created thread:", thread.id);
    } catch (threadError) {
      console.error("Thread creation error:", threadError);
      throw new Error("Failed to create Discord thread");
    }

    // Send initial message
    try {
      await thread.send({ embeds: [embed] });
      // Remove this line in production
      // console.log("Successfully sent initial message to thread");
    } catch (messageError) {
      console.error("Failed to send initial message:", messageError);
      throw new Error("Failed to send initial message to thread");
    }

    // Create webhook
    let webhook;
    try {
      webhook = await thread.createWebhook({
        name: "Order Bot",
        avatar: "https://i.imgur.com/AfFp7pu.png",
      });
      // Remove this line in production
      // console.log("Successfully created webhook");
    } catch (webhookError) {
      console.error("Webhook creation error:", webhookError);
      throw new Error("Failed to create Discord webhook");
    }

    // Store channel info in database
    try {
      const { error: dbError } = await supabase
        .from("discord_channels")
        .insert([
          {
            order_id: orderId,
            channel_id: channel.id,
            thread_id: thread.id,
            webhook_url: webhook.url,
          },
        ]);

      if (dbError) {
        throw new Error(
          `Failed to store channel info in database: ${dbError.message}`
        );
      }
    } catch (dbInsertError) {
      console.error("Database insertion error:", dbInsertError);
      throw dbInsertError;
    }

    // Create initial inbox message
    try {
      const { error: inboxError } = await supabase
        .from("inbox_messages")
        .insert([
          {
            user_id: userId,
            title: "Order Received",
            content: `Your order (ID: ${orderId}) has been received and is pending review. We'll notify you once your payment has been verified.`,
            type: "order_status",
          },
        ]);

      if (inboxError) {
        console.error("Failed to create inbox message:", inboxError);
        // Don't throw here as it's not critical
      }
    } catch (inboxInsertError) {
      console.error("Inbox message insertion error:", inboxInsertError);
      // Don't throw here as it's not critical
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        threadId: thread.id,
        webhookUrl: webhook.url,
      }),
    };
  } catch (error) {
    console.error("Error in discord-create-channel:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Failed to create Discord channel",
        details: error.message,
      }),
    };
  } finally {
    if (discordClient) {
      await discordClient.destroy();
      // Remove this line in production
      // console.log("Discord client destroyed");
    }
  }
};
