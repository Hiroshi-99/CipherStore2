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

// Add better error logging with more context
const logError = (error: any, context: string) => {
  console.error(`Error in ${context}:`, {
    message: error.message,
    stack: error.stack,
    details: JSON.stringify(error, null, 2),
    timestamp: new Date().toISOString(),
  });
};

// Validate environment variables
const validateEnv = () => {
  const requiredEnvVars = {
    DISCORD_TOKEN: process.env.DISCORD_TOKEN,
    DISCORD_GUILD_ID: process.env.DISCORD_GUILD_ID,
    DISCORD_CHANNEL_ID: process.env.DISCORD_CHANNEL_ID,
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };

  const missingVars = Object.entries(requiredEnvVars)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(", ")}`
    );
  }
};

// Validate authentication token
const validateAuth = async (authHeader: string | undefined) => {
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Missing or invalid authorization header");
  }

  const token = authHeader.split(" ")[1];
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    throw new Error(
      `Authentication failed: ${authError?.message || "No user found"}`
    );
  }

  return user;
};

// Validate request body
const validateRequestBody = (body: string | null) => {
  if (!body) {
    throw new Error("Request body is empty");
  }

  try {
    const parsedBody = JSON.parse(body);
    const { orderId, customerName, userId } = parsedBody;

    if (!orderId || !customerName || !userId) {
      throw new Error(
        `Missing required fields: ${!orderId ? "orderId, " : ""}${
          !customerName ? "customerName, " : ""
        }${!userId ? "userId" : ""}`
      );
    }

    return parsedBody;
  } catch (error) {
    throw new Error(
      `Invalid JSON in request body: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
};

export const handler: Handler = async (event) => {
  let discordClient: Client | null = null;

  try {
    // Validate environment variables
    validateEnv();

    // Verify authentication
    const user = await validateAuth(event.headers.authorization);

    // Parse and validate request body
    const { orderId, customerName, paymentProofUrl, userId } =
      validateRequestBody(event.body);

    // Initialize Discord client with retry mechanism
    let retries = 0;
    const maxRetries = 3;

    while (retries < maxRetries) {
      try {
        discordClient = new Client({
          intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
          ],
        });

        await discordClient.login(process.env.DISCORD_TOKEN);
        break; // Success, exit retry loop
      } catch (loginError) {
        retries++;
        logError(loginError, `Discord login attempt ${retries}`);

        if (retries >= maxRetries) {
          throw new Error(
            `Failed to log in to Discord after ${maxRetries} attempts`
          );
        }

        // Exponential backoff
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, retries)));
      }
    }

    // Get guild and channel
    const guild = await discordClient.guilds.fetch(
      process.env.DISCORD_GUILD_ID!
    );
    if (!guild) {
      throw new Error("Could not find Discord guild");
    }

    const channel = await discordClient.channels.fetch(
      process.env.DISCORD_CHANNEL_ID!
    );
    if (!channel || channel.type !== ChannelType.GuildText) {
      throw new Error(
        "Could not find Discord channel or it's not a text channel"
      );
    }

    // Get or create webhook
    const webhooks = await channel.fetchWebhooks();
    let webhook = webhooks.find((wh) => wh.name === "Order Management");

    if (!webhook) {
      webhook = await channel.createWebhook({
        name: "Order Management",
        avatar: "https://i.imgur.com/AfFp7pu.png",
      });
    }

    // Create rich embed for initial message
    const embed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle(`New Order #${orderId}`)
      .setDescription(`Customer: ${customerName}`)
      .addFields([
        {
          name: "Order Status",
          value: "Pending",
          inline: true,
        },
        {
          name: "Created",
          value: new Date().toLocaleString(),
          inline: true,
        },
      ])
      .setTimestamp();

    if (paymentProofUrl) {
      embed.setImage(paymentProofUrl);
    }

    // Create thread with retry mechanism
    let thread;
    let threadRetries = 0;
    const maxThreadRetries = 3;

    while (threadRetries < maxThreadRetries) {
      try {
        thread = await channel.threads.create({
          name: `Order #${orderId} - ${customerName}`,
          autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
          reason: `Order thread for ${customerName}`,
        });
        break; // Success, exit retry loop
      } catch (threadError) {
        threadRetries++;
        logError(threadError, `Thread creation attempt ${threadRetries}`);

        if (threadRetries >= maxThreadRetries) {
          throw new Error(
            "Failed to create Discord thread after multiple attempts"
          );
        }

        // Exponential backoff
        await new Promise((r) =>
          setTimeout(r, 1000 * Math.pow(2, threadRetries))
        );
      }
    }

    // Send initial message using webhook
    await webhook.send({
      threadId: thread.id,
      embeds: [embed],
    });

    // Store channel info in database with transaction
    const { data: channelData, error: dbError } = await supabase
      .from("discord_channels")
      .insert({
        order_id: orderId,
        channel_id: channel.id,
        thread_id: thread.id,
        webhook_url: webhook.url,
      })
      .select()
      .single();

    if (dbError) {
      // Log error but don't fail the function
      logError(dbError, "Database insertion");
      console.warn("Discord channel created but database record failed");
    }

    // Create initial inbox message
    try {
      await supabase.from("inbox_messages").insert([
        {
          user_id: userId,
          title: "Order Received",
          content: `Your order (ID: ${orderId}) has been received and is pending review. We'll notify you once your payment has been verified.`,
          type: "order_status",
        },
      ]);
    } catch (inboxError) {
      // Log error but don't fail the function
      logError(inboxError, "Inbox message insertion");
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

    // Determine appropriate status code based on error type
    let statusCode = 500;
    let errorMessage = "Failed to create Discord channel";

    if (error instanceof Error) {
      if (
        error.message.includes("authentication") ||
        error.message.includes("Unauthorized")
      ) {
        statusCode = 401;
        errorMessage = "Authentication failed";
      } else if (
        error.message.includes("Missing required") ||
        error.message.includes("Invalid JSON")
      ) {
        statusCode = 400;
        errorMessage = "Bad request";
      } else if (error.message.includes("Not found")) {
        statusCode = 404;
        errorMessage = "Resource not found";
      }
    }

    return {
      statusCode,
      body: JSON.stringify({
        error: errorMessage,
        details:
          error instanceof Error ? error.message : "Unknown error occurred",
      }),
    };
  } finally {
    // Always clean up the Discord client
    if (discordClient) {
      await discordClient.destroy();
    }
  }
};
