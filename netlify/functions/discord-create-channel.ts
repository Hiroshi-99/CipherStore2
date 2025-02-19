import { Handler } from "@netlify/functions";
import {
  Client,
  GatewayIntentBits,
  ChannelType,
  ThreadAutoArchiveDuration,
  EmbedBuilder,
} from "discord.js";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Add more detailed debug logging
console.log("Function loaded, checking environment...");
console.log("DISCORD_TOKEN length:", process.env.DISCORD_TOKEN?.length);
console.log("GUILD_ID:", process.env.DISCORD_GUILD_ID);
console.log("DISCORD_CHANNEL_ID:", process.env.DISCORD_CHANNEL_ID);

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
    console.log("Raw event body:", event.body);
    const parsedBody = JSON.parse(event.body || "{}");
    console.log("Parsed event body:", parsedBody);

    const { orderId, customerName, paymentProofUrl, userId } = parsedBody;

    console.log("Extracted fields:", {
      orderId,
      customerName,
      paymentProofUrl,
      userId,
    });

    if (!orderId || !customerName || !userId) {
      console.log("Missing fields:", { orderId, customerName, userId });
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Missing required fields",
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
        GatewayIntentBits.GuildMessageReactions,
      ],
    });

    try {
      await discordClient.login(process.env.DISCORD_TOKEN);
    } catch (loginError) {
      console.error("Error logging in to Discord:", loginError);
      if (
        loginError instanceof Error &&
        loginError.message.includes("TokenInvalid")
      ) {
        return {
          statusCode: 401,
          body: JSON.stringify({
            error:
              "Invalid Discord token. Please check your DISCORD_TOKEN environment variable.",
            details: loginError.message,
          }),
        };
      }
      throw loginError;
    }

    const guild = await discordClient.guilds.fetch(
      process.env.DISCORD_GUILD_ID!
    );

    // Fetch the existing channel
    const channel = await guild.channels.fetch(process.env.DISCORD_CHANNEL_ID!);

    if (!channel || channel.type !== ChannelType.GuildText) {
      throw new Error(
        "The specified channel was not found or is not a text channel."
      );
    }

    // Create initial message with order details and payment proof
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

    // Create thread for the order
    const thread = await channel.threads.create({
      name: `Order-${orderId.slice(0, 8)}`,
      autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
      reason: `Thread for order ${orderId}`,
    });

    // Send initial message with embed
    await thread.send({ embeds: [embed] });

    // Create webhook for the channel if it doesn't exist
    let webhook;
    const existingWebhooks = await channel.fetchWebhooks();
    const existingWebhook = existingWebhooks.find(
      (hook) => hook.name === "Chat Relay"
    );

    if (existingWebhook) {
      webhook = existingWebhook;
    } else {
      webhook = await channel.createWebhook({
        name: "Chat Relay",
        reason: "Relay messages between web app and Discord",
      });
    }

    // Store channel and thread info in database
    const { error: dbError } = await supabase.from("discord_channels").insert([
      {
        order_id: orderId,
        channel_id: channel.id,
        thread_id: thread.id,
        webhook_url: webhook.url,
      },
    ]);

    if (dbError) {
      throw new Error(`Database error: ${dbError.message}`);
    }

    // Create initial inbox message for customer
    const { error: inboxError } = await supabase.from("inbox_messages").insert([
      {
        user_id: userId,
        title: "Order Received",
        content: `Your order (ID: ${orderId}) has been received and is pending review. We'll notify you once your payment has been verified.`,
        type: "order_status",
      },
    ]);

    if (inboxError) {
      console.error("Error creating inbox message:", inboxError);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        channelId: channel.id,
        threadId: thread.id,
        webhookUrl: webhook.url,
      }),
    };
  } catch (error) {
    console.error("Error in Discord channel creation process:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "An error occurred during channel creation",
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
