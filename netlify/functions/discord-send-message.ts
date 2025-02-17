import { Handler } from "@netlify/functions";
import { WebhookClient } from "discord.js";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { webhookUrl, content, username, avatar_url } = JSON.parse(
      event.body || "{}"
    );

    if (!webhookUrl || !content) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing required fields" }),
      };
    }

    const webhook = new WebhookClient({ url: webhookUrl });
    const message = await webhook.send({
      content,
      username,
      avatarURL: avatar_url,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        id: message.id,
        content: message.content,
      }),
    };
  } catch (error) {
    console.error("Error sending Discord message:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to send Discord message" }),
    };
  }
};
