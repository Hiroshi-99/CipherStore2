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
    const { action, userId, discordId, message } = JSON.parse(
      event.body || "{}"
    );

    if (!action || !discordId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing required fields" }),
      };
    }

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

    switch (action) {
      case "add_to_server": {
        try {
          // Add user to server using OAuth2 token
          await guild.members.add(discordId);
          return {
            statusCode: 200,
            body: JSON.stringify({ success: true }),
          };
        } catch (error) {
          logError(error, "Adding user to server");
          throw error;
        }
      }

      case "send_dm": {
        try {
          const user = await discordClient.users.fetch(discordId);
          await user.send(message);
          return {
            statusCode: 200,
            body: JSON.stringify({ success: true }),
          };
        } catch (error) {
          logError(error, "Sending DM");
          throw error;
        }
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
