import { Handler } from "@netlify/functions";

export const handler: Handler = async (event) => {
  // Only allow POST requests
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const { webhookUrl, message } = JSON.parse(event.body || "{}");

    if (!webhookUrl || !message) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Missing required fields",
          required: ["webhookUrl", "message"],
        }),
      };
    }

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Discord returned ${response.status}: ${errorText}`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
    };
  } catch (error) {
    console.error("Discord webhook error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Failed to send Discord message",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
    };
  }
};
