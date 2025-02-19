import { Handler } from "@netlify/functions";
import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const { orderId, status, notes } = JSON.parse(event.body || "{}");

    if (!orderId || !status) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing required fields" }),
      };
    }

    // Update payment proof status
    const { error: updateError } = await supabase
      .from("payment_proofs")
      .update({ status, admin_notes: notes })
      .eq("order_id", orderId);

    if (updateError) {
      throw updateError;
    }

    // Update order status
    const { error: orderError } = await supabase
      .from("orders")
      .update({ status: status === "approved" ? "active" : "rejected" })
      .eq("id", orderId);

    if (orderError) {
      throw orderError;
    }

    // Get order details
    const { data: order } = await supabase
      .from("orders")
      .select("*, discord_channels(*)")
      .eq("id", orderId)
      .single();

    if (!order) {
      throw new Error("Order not found");
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

    await supabase.from("inbox_messages").insert([message]);

    // Update Discord thread
    const client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
    });

    await client.login(process.env.DISCORD_TOKEN);

    const channel = await client.channels.fetch(
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

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Payment status updated successfully" }),
    };
  } catch (error) {
    console.error("Error updating payment status:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Failed to update payment status",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
    };
  }
};
