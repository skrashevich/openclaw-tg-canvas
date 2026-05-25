# Task: Add Chat Sessions UI to Telegram Mini App

## Goal
Extend the existing Telegram Mini App (`openclaw-tg-canvas`) to show a list of recent OpenClaw chat sessions, allow switching between them, and send messages to sessions directly from the Mini App.

## Context
- This is a Telegram Mini App served by `server.js` (Node.js, no frameworks)
- Frontend is in `miniapp/` directory (vanilla HTML/JS/CSS)
- The app already has Canvas rendering, Terminal, and auth via Telegram initData + JWT
- OpenClaw gateway runs locally on port 18789 with a REST API
- Gateway auth token is available via `OPENCLAW_GATEWAY_TOKEN` env var

## Requirements

### 1. Sessions List View
- Add a "Sessions" tab/button in the top navigation (next to Terminal and Control)
- Fetch sessions from OpenClaw gateway: `GET http://127.0.0.1:18789/api/sessions` (or equivalent)
- Show a scrollable list with session title/label, last message preview, timestamp
- Highlight currently active session
- Pull to refresh

### 2. Session Chat View
- Tapping a session opens its chat view
- Load recent messages from the session via OpenClaw gateway API
- Display messages in a chat-like UI (user messages on right, assistant on left)
- Show timestamps

### 3. Send Messages
- Text input at the bottom of the chat view
- On send, POST message to OpenClaw gateway: `POST /api/sessions/{key}/messages` (or the correct endpoint)
- Optimistic UI update — show message immediately, confirm on server response
- Clear input after send

### 4. Real-time Updates
- Use WebSocket connection to receive new messages in open session
- The gateway supports WebSocket on the same port

### 5. Auth
- All session API calls go through the server as a proxy (to avoid CORS and expose gateway token)
- Add server-side proxy routes: `GET /api/sessions`, `GET /api/sessions/:key/history`, `POST /api/sessions/:key/send`
- These routes forward to OpenClaw gateway with `Authorization: Bearer ${OPENCLAW_GATEWAY_TOKEN}`

## API Reference (OpenClaw Gateway)
- Gateway base: `http://127.0.0.1:18789`
- Auth header: `Authorization: Bearer <token>`
- List sessions: check `docs/` or source for the correct REST endpoints
- The gateway has a REST API for session management

## Design Notes
- Keep the existing dark theme aesthetic
- Mobile-first — this runs inside Telegram's WebView
- Keep it lightweight — no build tools, no frameworks
- The miniapp/ directory contains `index.html` — extend it with new views

## Files to Modify
- `server.js` — add proxy routes for sessions API
- `miniapp/index.html` — add sessions UI, chat view, navigation

## Don't Touch
- Auth logic (JWT, initData verification)
- Terminal feature
- Canvas/push feature
- `.env` file
