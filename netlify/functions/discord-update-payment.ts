import { Handler } from "@netlify/functions";
import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Add error logging
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
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: "Method not allowed" }),
      };
    }

    const { orderId, status, notes } = JSON.parse(event.body || "{}");

    if (!orderId || !status) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing required fields" }),
      };
    }

    // Get order and user details first
    const { data: order, error: fetchError } = await supabase
      .from("orders")
      .select(
        `
        *,
        discord_channels (*),
        user:user_id (
          raw_user_meta_data
        )
      `
      )
      .eq("id", orderId)
      .single();

    if (fetchError || !order) {
      logError(fetchError || new Error("Order not found"), "Order fetch");
      throw fetchError || new Error("Order not found");
    }

    // Update payment proof status
    const { error: updateError } = await supabase
      .from("payment_proofs")
      .update({
        status,
        admin_notes: notes || `Payment ${status} by admin`,
      })
      .eq("order_id", orderId);

    if (updateError) {
      logError(updateError, "Payment proof update");
      throw updateError;
    }

    // Update order status
    const { error: orderError } = await supabase
      .from("orders")
      .update({
        status: status === "approved" ? "active" : "rejected",
      })
      .eq("id", orderId);

    if (orderError) {
      logError(orderError, "Order update");
      throw orderError;
    }

    // Create inbox message
    const message = {
      user_id: order.user_id,
      title: `Payment ${status.charAt(0).toUpperCase() + status.slice(1)}`,
      content:
        status === "approved"
          ? "Your payment has been verified and your order is now active!"
          : `Your payment was rejected. Reason: ${
              notes || "No reason provided"
            }`,
      type: "payment_status",
    };

    const { error: inboxError } = await supabase
      .from("inbox_messages")
      .insert([message]);

    if (inboxError) {
      logError(inboxError, "Inbox message creation");
    }

    // Initialize Discord client
    discordClient = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
      ],
    });

    await discordClient.login(process.env.DISCORD_TOKEN);

    // Send message to thread if available
    if (order.discord_channels?.channel_id) {
      const channel = await discordClient.channels.fetch(
        order.discord_channels.channel_id
      );

      if (channel?.isTextBased()) {
        const embed = new EmbedBuilder()
          .setColor(status === "approved" ? 0x00ff00 : 0xff0000)
          .setTitle(`Payment ${status.toUpperCase()}`)
          .setDescription(message.content)
          .setTimestamp();

        await channel.send({ embeds: [embed] });
      }
    }

    // Send DM to user
    try {
      const discordUserId = order.user?.raw_user_meta_data?.provider_id;
      if (discordUserId) {
        const user = await discordClient.users.fetch(discordUserId);
        const dmEmbed = new EmbedBuilder()
          .setColor(status === "approved" ? 0x00ff00 : 0xff0000)
          .setTitle(`Order Update: Payment ${status.toUpperCase()}`)
          .setDescription(message.content)
          .addFields(
            { name: "Order ID", value: orderId, inline: true },
            {
              name: "Status",
              value: status === "approved" ? "Active" : "Rejected",
              inline: true,
            }
          )
          .setTimestamp();

        await user.send({ embeds: [dmEmbed] });
      }
    } catch (dmError) {
      logError(dmError, "Discord DM");
      // Don't throw here as DM failure shouldn't fail the whole process
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
    };
  } catch (error) {
    logError(error, "Payment status update");
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Failed to update payment status",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
    };
  } finally {
    if (discordClient) {
      await discordClient.destroy();
    }
  }
};
