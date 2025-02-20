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

// Add better error logging
const logError = (error: any, context: string) => {
  console.error(`Error in ${context}:`, {
    message: error.message,
    stack: error.stack,
    details: error,
  });
};

export const handler: Handler = async (event) => {
  let discordClient: Client | null = null;

  try {
    // Validate environment variables first
    const requiredEnvVars = {
      DISCORD_TOKEN: process.env.DISCORD_TOKEN,
      DISCORD_GUILD_ID: process.env.DISCORD_GUILD_ID,
      DISCORD_CHANNEL_ID: process.env.DISCORD_CHANNEL_ID,
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    };

    for (const [key, value] of Object.entries(requiredEnvVars)) {
      if (!value) {
        throw new Error(`Missing required environment variable: ${key}`);
      }
    }

    // Verify authentication
    const authHeader = event.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
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

    const { orderId, customerName, paymentProofUrl, userId } = JSON.parse(
      event.body
    );

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

    // Login to Discord with better error handling
    try {
      await discordClient.login(process.env.DISCORD_TOKEN);
    } catch (loginError) {
      logError(loginError, "Discord login");
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
    } catch (threadError) {
      logError(threadError, "Thread creation");
      throw new Error("Failed to create Discord thread");
    }

    // Send initial message
    try {
      await thread.send({ embeds: [embed] });
    } catch (messageError) {
      logError(messageError, "Sending initial message");
      throw new Error("Failed to send initial message to thread");
    }

    // Create webhook
    let webhook;
    try {
      webhook = await thread.createWebhook({
        name: "Order Bot",
        avatar: "https://i.imgur.com/AfFp7pu.png",
      });
    } catch (webhookError) {
      logError(webhookError, "Webhook creation");
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
      logError(dbInsertError, "Database insertion");
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
        logError(inboxError, "Inbox message insertion");
      }
    } catch (inboxInsertError) {
      logError(inboxInsertError, "Inbox message insertion");
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
    logError(error, "discord-create-channel");
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Failed to create Discord channel",
        details:
          error instanceof Error ? error.message : "Unknown error occurred",
      }),
    };
  } finally {
    if (discordClient) {
      await discordClient.destroy();
    }
  }
};
