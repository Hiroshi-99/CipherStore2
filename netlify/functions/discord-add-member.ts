import { Handler } from "@netlify/functions";
import { Client, GatewayIntentBits } from "discord.js";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const handler: Handler = async (event) => {
  let discordClient: Client | null = null;

  try {
    // Validate auth header
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

    // Get Discord ID from user metadata
    const discordId = user.user_metadata?.sub;
    if (!discordId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "No Discord ID found" }),
      };
    }

    // Initialize Discord client
    discordClient = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    });

    await discordClient.login(process.env.DISCORD_TOKEN);

    // Get the guild
    const guild = await discordClient.guilds.fetch(
      process.env.DISCORD_GUILD_ID!
    );
    if (!guild) {
      throw new Error("Could not find Discord guild");
    }

    // Add member to guild
    await guild.members.add(discordId, {
      accessToken: user.user_metadata?.provider_token,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
    };
  } catch (error) {
    console.error("Error adding member to guild:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Failed to add member to guild",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
    };
  } finally {
    if (discordClient) {
      await discordClient.destroy();
    }
  }
};
