import { Handler } from "@netlify/functions";
import { Client, GatewayIntentBits } from "discord.js";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

    const { action, userId, discordId, message } = JSON.parse(
      event.body || "{}"
    );

    if (!action || !userId || !discordId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing required fields" }),
      };
    }

    // Initialize Discord client
    discordClient = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages,
      ],
    });

    await discordClient.login(process.env.DISCORD_TOKEN);

    const guild = await discordClient.guilds.fetch(
      process.env.DISCORD_GUILD_ID!
    );
    if (!guild) {
      throw new Error("Could not find Discord guild");
    }

    switch (action) {
      case "add_to_guild":
        try {
          // Try to add user to guild
          await guild.members.add(discordId);
          return {
            statusCode: 200,
            body: JSON.stringify({ success: true, action: "added_to_guild" }),
          };
        } catch (error) {
          logError(error, "Adding user to guild");
          // Don't throw here as the user might already be in the guild
          return {
            statusCode: 200,
            body: JSON.stringify({
              success: false,
              error: "Failed to add to guild, user might already be a member",
            }),
          };
        }

      case "send_dm":
        try {
          const user = await discordClient.users.fetch(discordId);
          await user.send(message || "Your payment has been approved!");
          return {
            statusCode: 200,
            body: JSON.stringify({ success: true, action: "dm_sent" }),
          };
        } catch (error) {
          logError(error, "Sending DM");
          throw new Error("Failed to send DM to user");
        }

      default:
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Invalid action" }),
        };
    }
  } catch (error) {
    logError(error, "discord-user-manager");
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Operation failed",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
    };
  } finally {
    if (discordClient) {
      await discordClient.destroy();
    }
  }
};
