# CCNA 200-301 Lab Simulator

A Cisco IOS CLI simulator for practicing CCNA exam labs. Built with React + Vite, deployed on Vercel.

## Features
Try it out: https://ccnalabs.vercel.app/

- 27 pre-built CCNA labs covering Routing, Switching, IP Services, Security, IPv6
- Full Cisco IOS CLI emulation with Tab completion and `?` inline help
- Lab Editor with AI-powered lab generation
- SVG network topology renderer with Cisco-style device symbols
- Task verification with automatic check against running-config

---

## Project Structure

```
/
├── api/
│   └── generate.js          ← Vercel serverless proxy (optional)
├── src/
│   ├── CiscoLabSimulator.jsx
│   ├── LabEditor.jsx
│   ├── iosCommands.js
│   ├── iosCmdTree.js
│   ├── iosConfig.js
│   ├── iosHelpers.js
│   ├── iosShow.js
│   ├── iosValidate.js
│   ├── labData.js
│   ├── taskVerification.js
│   ├── themes.js
│   ├── topoImages.js
│   ├── topoRenderer.js
│   └── main.jsx
├── vercel.json
└── index.html
```

---

## Getting Started

```bash
npm install
npm run dev
```

Runs locally at `http://localhost:5173`

---

## Deployment (Vercel)

```bash
npm run build
```

Push to GitHub — Vercel auto-deploys on every push.

`vercel.json` handles SPA routing:
```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

---

## AI Lab Generator — Serverless Proxy

The Lab Editor can generate labs using AI. The API key can be handled two ways:

### Option A — Manual (user provides key)

Each user enters their own MiniMax API key in the UI. The key is stored only in their browser.

In `src/LabEditor.jsx`, set:
```js
const USE_PROXY = false;
```

No other setup needed. The API key input field will appear in the UI automatically.

---

### Option B — Serverless Proxy (recommended for public sites)

The API key is stored securely in Vercel — never exposed to users or visible in GitHub.

#### Step 1 — Add API key to Vercel

1. Go to [vercel.com](https://vercel.com) → your project → **Settings** → **Environment Variables**
2. Add a new variable:
   - Name: `YOUR_API_KEY`
   - Value: your Claude/Gemini/OpenAI/MiniMax API key
   - Environment: Production (and Preview if needed)
3. Click **Save**

#### Step 2 — Deploy the serverless function

Make sure `api/generate.js` exists in your project root (not inside `src/`).

The file structure should be:
```
/api/generate.js   ← must be here
/src/...
/index.html
```

#### Step 3 — Enable proxy mode in LabEditor

In `src/LabEditor.jsx`, set:
```js
const USE_PROXY = true;
```

#### Step 4 — Redeploy

Push to GitHub or trigger a manual redeploy in Vercel. The API key field will disappear from the UI — users can generate labs without needing their own key.

---

### Switching Between Modes

| Mode | `USE_PROXY` | API key field shown | Key stored |
|------|-------------|---------------------|------------|
| Manual | `false` | Yes | User's browser only |
| Serverless | `true` | No | Vercel (server-side) |

To switch modes, change one line in `src/LabEditor.jsx`:
```js
const USE_PROXY = true;   // serverless proxy
const USE_PROXY = false;  // manual, user provides key
```

---

### Removing the Serverless Proxy Completely

If you want to remove the proxy and go fully manual:

1. Set `USE_PROXY = false` in `src/LabEditor.jsx`
2. Delete `api/generate.js` (optional — it won't be called if `USE_PROXY = false`)
3. Remove `MINIMAX_API_KEY` from Vercel Environment Variables (optional)
4. Redeploy

---

## Admin Access

Visit `/admin/123` to unlock the **Show Solution** button on all labs.

The session persists until the browser tab is closed.

---

## Supported AI Providers (Manual Mode)

| Provider | Model | Key format |
|----------|-------|------------|
| MiniMax | MiniMax-M2.5 | `eyJhbGci...` |
| Claude (Anthropic) | claude-sonnet | `sk-ant-...` |
| ChatGPT (OpenAI) | gpt-4o | `sk-...` |
| Gemini (Google) | gemini-2.0-flash | `AIzaSy...` |

---

## License

Private repository — all rights reserved.  
© Z-eq
