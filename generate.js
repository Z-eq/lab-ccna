// api/generate.js — Vercel Serverless Function (CommonJS)
// Place this file at: /api/generate.js (project root, not in src/)
// Add MINIMAX_API_KEY to Vercel Environment Variables

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "MINIMAX_API_KEY not set in Vercel Environment Variables" });
  }

  try {
    let body = req.body;
    if (typeof body === "string") body = JSON.parse(body);

    const { prompt, systemPrompt } = body || {};
    if (!prompt || !systemPrompt) {
      return res.status(400).json({ error: "Missing prompt or systemPrompt" });
    }

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

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: `MiniMax error: ${errText}` });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";

    if (!text) return res.status(500).json({ error: "Empty response from MiniMax" });

    return res.status(200).json({ text });

  } catch (err) {
    return res.status(500).json({ error: err.message || "Unknown server error" });
  }
};
