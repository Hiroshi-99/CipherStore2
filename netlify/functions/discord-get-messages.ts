import { Handler } from "@netlify/functions";
import { Client, GatewayIntentBits } from "discord.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const DISCORD_TOKEN = process.env.DISCORD_BOT_TOKEN;

if (!DISCORD_TOKEN) {
  throw new Error("Missing DISCORD_BOT_TOKEN");
}

export const handler: Handler = async (event) => {
  const channelId = event.path.split("/").pop();

  if (!channelId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Channel ID is required" }),
    };
  }

  try {
    await client.login(DISCORD_TOKEN);
    const channel = await client.channels.fetch(channelId);

    if (!channel?.isTextBased()) {
      throw new Error("Invalid channel");
    }

    const messages = await channel.messages.fetch({ limit: 100 });
    const formattedMessages = messages.map((msg) => ({
      id: msg.id,
      content: msg.content,
      author: {
        id: msg.author.id,
        username: msg.author.username,
        avatar: msg.author.avatarURL(),
        bot: msg.author.bot,
      },
      timestamp: msg.createdTimestamp,
    }));

    return {
      statusCode: 200,
      body: JSON.stringify(formattedMessages),
    };
  } catch (error) {
    console.error("Error fetching Discord messages:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to fetch Discord messages" }),
    };
  } finally {
    client.destroy();
  }
};
