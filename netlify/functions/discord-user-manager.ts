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
    const { action, discordId, message } = JSON.parse(event.body || "{}");

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

    switch (action) {
      case "add_to_server": {
        try {
          const guild = await discordClient.guilds.fetch(
            process.env.DISCORD_GUILD_ID!
          );

          // Create an invite
          const channel = await discordClient.channels.fetch(
            process.env.DISCORD_CHANNEL_ID!
          );

          if (!channel?.isTextBased()) {
            throw new Error("Invalid channel");
          }

          const invite = await channel.createInvite({
            maxAge: 86400, // 24 hours
            maxUses: 1,
            unique: true,
          });

          return {
            statusCode: 200,
            body: JSON.stringify({
              success: true,
              inviteUrl: invite.url,
            }),
          };
        } catch (error) {
          logError(error, "Creating invite");
          throw error;
        }
      }

      case "send_dm": {
        try {
          const user = await discordClient.users.fetch(discordId);
          await user.send({
            content: message,
            flags: ["SUPPRESS_EMBEDS"],
          });
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
