// api/generate.js — Vercel Serverless Function
// Proxies AI requests so the API key stays server-side only
// Deploy: add MINIMAX_API_KEY to Vercel Environment Variables

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Basic rate limiting via headers (Vercel adds these)
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "API key not configured on server" });
  }

  try {
    const { prompt, systemPrompt } = req.body;

    if (!prompt || !systemPrompt) {
      return res.status(400).json({ error: "Missing prompt or systemPrompt" });
    }

    // Forward to MiniMax
    const response = await fetch("https://api.minimax.io/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "MiniMax-M2.5",
        max_tokens: 4096,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: prompt },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || "API error" });
    }

    // Return just the text content
    const text = data.choices?.[0]?.message?.content || "";
    return res.status(200).json({ text });

  } catch (err) {
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
