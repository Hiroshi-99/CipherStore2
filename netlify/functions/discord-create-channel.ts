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

  try {
    // Verify authentication
    const authHeader = event.headers.authorization;
    if (!authHeader) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "No authorization header" }),
      };
    }

    console.log("Raw event body:", event.body);
    const parsedBody = JSON.parse(event.body || "{}");
    console.log("Parsed event body:", parsedBody);

    const { orderId, customerName, paymentProofUrl, userId } = parsedBody;

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
      console.error("Discord login error:", loginError);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Failed to login to Discord",
          details:
            loginError instanceof Error ? loginError.message : "Unknown error",
        }),
      };
    }

    // Fetch guild and channel
    const guild = await discordClient.guilds.fetch(
      process.env.DISCORD_GUILD_ID!
    );
    const channel = await guild.channels.fetch(process.env.DISCORD_CHANNEL_ID!);

    if (!channel || channel.type !== ChannelType.GuildText) {
      throw new Error("Channel not found or is not a text channel");
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

    // Create thread
    let thread;
    try {
      thread = await channel.threads.create({
        name: `Order #${orderId} - ${customerName}`,
        autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
        reason: `Order thread for ${customerName}`,
      });
    } catch (threadError) {
      console.error("Thread creation error:", threadError);
      throw new Error("Failed to create thread");
    }

    // Send initial message
    await thread.send({ embeds: [embed] });

    // Create webhook
    let webhook;
    try {
      webhook = await thread.createWebhook({
        name: "Order Bot",
        avatar: "https://i.imgur.com/AfFp7pu.png",
      });
    } catch (webhookError) {
      console.error("Webhook creation error:", webhookError);
      throw new Error("Failed to create webhook");
    }

    // Store channel info in database
    const { error: dbError } = await supabase.from("discord_channels").insert([
      {
        order_id: orderId,
        channel_id: channel.id,
        thread_id: thread.id,
        webhook_url: webhook.url,
      },
    ]);

    if (dbError) {
      console.error("Database error:", dbError);
      throw new Error(`Database error: ${dbError.message}`);
    }

    // Create initial inbox message
    await supabase.from("inbox_messages").insert([
      {
        user_id: userId,
        title: "Order Received",
        content: `Your order (ID: ${orderId}) has been received and is pending review. We'll notify you once your payment has been verified.`,
        type: "order_status",
      },
    ]);

    return {
      statusCode: 200,
      body: JSON.stringify({
        channelId: channel.id,
        threadId: thread.id,
        webhookUrl: webhook.url,
      }),
    };
  } catch (error) {
    console.error("Error in Discord channel creation:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Failed to create Discord channel",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
    };
  } finally {
    if (discordClient) {
      discordClient.destroy();
    }
  }
};
