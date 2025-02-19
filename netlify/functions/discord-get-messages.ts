import { Handler } from "@netlify/functions";
import { Client, GatewayIntentBits } from "discord.js";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const DISCORD_TOKEN = process.env.DISCORD_BOT_TOKEN;

if (!DISCORD_TOKEN) {
  throw new Error("Missing DISCORD_TOKEN");
}

export const handler: Handler = async (event) => {
  // Verify authentication
  const authHeader = event.headers.authorization;
  if (!authHeader) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: "No authorization header" }),
    };
  }

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));

    if (error || !user) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "Invalid token" }),
      };
    }

    if (event.httpMethod !== "GET") {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: "Method Not Allowed" }),
      };
    }

    const channelId = event.path.split("/").pop();

    if (!channelId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing channelId" }),
      };
    }

    await client.login(DISCORD_TOKEN);

    const channel = await client.channels.fetch(channelId);

    if (!channel || channel.type !== 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          error: "Channel not found or not a text channel",
        }),
      };
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
      timestamp: msg.createdAt.toISOString(),
    }));

    return {
      statusCode: 200,
      body: JSON.stringify(formattedMessages),
    };
  } catch (error) {
    console.error("Error fetching Discord messages:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Failed to fetch Discord messages",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
    };
  } finally {
    if (client.isReady()) {
      console.log("Destroying Discord client...");
      try {
        await client.destroy();
      } catch (error) {
        console.error("Error destroying client:", error);
      }
    }
  }
};
