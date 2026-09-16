# Anaya

A private-messaging-style chat app for texting with "Anaya," an AI character with her own
personality — built to feel like a real messaging app, not a chatbot UI.

```
anaya-app/
├── backend/          Node/Express server — talks to the OpenAI API, keeps the key secret
│   ├── server.js
│   ├── persona.js    Anaya's personality (system prompt) — separate from the frontend
│   ├── package.json
│   └── .env.example
└── frontend/         Static HTML/CSS/JS — the messaging UI, works as a PWA
    ├── index.html
    ├── css/style.css
    ├── js/app.js
    ├── manifest.json
    ├── service-worker.js
    └── icons/
```

## How it works

- **Frontend** never talks to OpenAI directly — it only calls your own backend at `/api/chat`
  and `/api/summarize`. No API key ever touches the browser.
- **Backend** holds your OpenAI API key in a `.env` file (never committed, never sent to the
  client) and forwards requests to OpenAI with Anaya's personality prompt attached.
- **Conversation history** and **memories** are stored in the browser's `localStorage`, so they
  survive a refresh but stay on your device. Recent messages are sent to the AI as context on
  each turn; once the conversation gets long, older messages are folded into a short summary
  instead of being sent in full, so the context never grows without bound.
- **Memory**: Anaya can quietly note down durable facts worth remembering (your name, an
  interest, something you ask her to remember) — never every message. You can view or delete
  anything she's saved from the Memory screen, or add your own.

## 1. Get a OpenAI API key

1. Go to <https://platform.openai.com/api-keys> and create an API key.
2. Check <https://platform.openai.com/docs> for the current model names available to you, in case the
   default in `.env.example` has since been replaced by a newer one.

## 2. Set up the backend

```bash
cd backend
npm install
cp .env.example .env
```

Open `.env` and paste in your key:

```
OPENAI_API_KEY=sk-ant-...
```

Then start the server:

```bash
npm start
```

You should see:

```
[Anaya] server running on http://localhost:3000
```

The backend also serves the frontend automatically — you don't need a separate static server.

## 3. Open the app

Visit **http://localhost:3000** in your browser. That's it — one server, one URL.

## 4. Running it on Android

The app is a normal web app, so on your phone you just need to reach the same server:

**Option A — same Wi-Fi network (quickest for trying it out):**
1. On the computer running the backend, find its local IP address (e.g. `192.168.1.42`).
2. Make sure your phone is on the same Wi-Fi network.
3. On your phone's browser, go to `http://192.168.1.42:3000`.

**Option B — a real deployment (so it works away from home):**
Deploy the `backend` folder (which also serves the frontend) to any Node host — Render,
Railway, Fly.io, a VPS, etc. Set the `OPENAI_API_KEY` environment variable in that host's
dashboard instead of a `.env` file, then visit the public URL it gives you from your phone.

**Installing it as an app icon on Android:**
1. Open the app's URL in Chrome on your phone.
2. Tap the ⋮ menu → **"Add to Home screen"** (or Chrome may prompt you automatically).
3. Confirm — Anaya now opens full-screen from your home screen like a normal app, using the
   manifest and service worker already included in `frontend/`.

## Configuration notes

- `backend/.env` → `OPENAI_MODEL` lets you pick a different OpenAI model without touching code.
- `backend/persona.js` is where Anaya's personality lives — edit the prompt there to adjust her
  tone; it's kept out of the frontend on purpose.
- Everything user-specific (chat history, memories, theme) lives in the browser's
  `localStorage` under keys prefixed `anaya.` — clearing site data resets the app.

## Testing the main flow

1. `npm start` in `backend/`, then open the app URL.
2. You should land on the chat screen with Anaya's opening message.
3. Send a message → a typing indicator appears → Anaya replies after a short natural delay.
4. Refresh the page → the conversation is still there.
5. Tap the ⋮ menu → **Settings** → try switching Light/Dark/System.
6. Tap the ⋮ menu → **Memory** → add a memory manually, delete one.
7. Tap the ⋮ menu → **Clear conversation** → confirm → chat resets to Anaya's opener.

If the backend isn't running or the API key is missing/invalid, the chat will show a friendly
in-conversation error instead of crashing.


## What I improved in this build

- Switched the backend from the old Claude integration to OpenAI's Responses API with GPT-5.6 Luna as the default model.
- Kept the API key server-side.
- Preserved the polished messaging UI, typing indicator, memory screen, themes, local conversation history, and PWA shell.
- Kept Anaya's personality prompt separate from the frontend.
- Added the playfulness setting to the actual AI request.

For Android-only use, the app still needs a remotely reachable backend. The PWA can then be added to the Android home screen. Running the Node backend locally on the phone is not part of this build.
