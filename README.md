# DEVELOP Control Panel — setup starter

This project contains your dashboard UI and a small Node.js backend for Discord OAuth2 login. It can show the signed-in user and servers where that user has **Manage Server** permission. It is a starter, not yet a live BDFD control panel: the existing BDFD bot does not automatically expose a supported settings API, so autorole/welcome changes will not reach the bot until a compatible integration is built.

## Requirements
- Node.js 18 or newer
- A Discord application you own
- A public HTTPS host for production (local HTTP is fine for testing)

## 1. Configure Discord OAuth
1. Open https://discord.com/developers/applications and create an application named `DEVELOP`.
2. Open **OAuth2** and copy the Client ID and Client Secret. Keep the secret private.
3. Add this Redirect URI for local testing: `http://localhost:3000/auth/discord/callback`
4. Copy `.env.example` to a new file named `.env` and fill in the credentials. Make a long random `SESSION_SECRET`.
5. Never upload `.env` or share your client secret publicly.

## 2. Run locally
```bash
npm install
npm start
```
Open http://localhost:3000. To wire the login button, edit `public/index.html` and change its demo login button to a link to `/auth/discord`. The API endpoint `/api/me` returns login status and manageable servers.

## 3. Deploy publicly
Deploy the project to a Node.js host that supports environment variables and HTTPS. Set the same environment variables in the host dashboard and change `DISCORD_REDIRECT_URI` to `https://YOUR-DOMAIN/auth/discord/callback`; add that exact URI in Discord Developer Portal. Use a persistent session store for production instead of Express's default in-memory store.

## Important limits
- This starter has no live BDFD integration.
- Do not put a Discord bot token in frontend HTML or expose it to users.
- To make dashboard settings actually control a bot, you need a bot backend that can receive settings and perform role assignment. Verify BDFD's supported capabilities before promising compatibility.
