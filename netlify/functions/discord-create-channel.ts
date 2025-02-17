import { Handler } from "@netlify/functions";
import { Client, GatewayIntentBits } from "discord.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const DISCORD_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const SUPPORT_CATEGORY_ID = process.env.DISCORD_SUPPORT_CATEGORY_ID;

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { orderId, username } = JSON.parse(event.body || "{}");

    await client.login(DISCORD_TOKEN);
    const guild = await client.guilds.fetch(GUILD_ID);

    // Create channel
    const channel = await guild.channels.create({
      name: `order-${orderId}`,
      parent: SUPPORT_CATEGORY_ID,
      topic: `Support channel for ${username}'s order`,
    });

    // Create webhook for the channel
    const webhook = await channel.createWebhook({
      name: "Order Bot",
      avatar: "https://your-bot-avatar.png",
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        channelId: channel.id,
        webhookUrl: webhook.url,
      }),
    };
  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to create Discord channel" }),
    };
  }
};
