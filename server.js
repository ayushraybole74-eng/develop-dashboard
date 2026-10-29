require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
const required = ['DISCORD_CLIENT_ID','DISCORD_CLIENT_SECRET','DISCORD_REDIRECT_URI','SESSION_SECRET'];
const missing = required.filter(k => !process.env[k]);
app.use(session({
  secret: process.env.SESSION_SECRET || 'development-only-change-me',
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 7*24*60*60*1000 }
}));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/auth/discord', (req,res) => {
  if (missing.length) return res.status(503).send('Setup required. Copy .env.example to .env and fill in Discord OAuth credentials.');
  const url = new URL('https://discord.com/oauth2/authorize');
  url.searchParams.set('client_id', process.env.DISCORD_CLIENT_ID);
  url.searchParams.set('redirect_uri', process.env.DISCORD_REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'identify guilds');
  req.session.oauthState = require('crypto').randomBytes(24).toString('hex');
  url.searchParams.set('state', req.session.oauthState);
  req.session.save((err) => {
  if (err) {
    return res.status(500).send('Session save failed. Please try again.');
  }
  res.redirect(url.toString());
});
});
app.get('/auth/discord/callback', async (req,res) => {
  if (missing.length) return res.status(503).send('OAuth is not configured.');
  if (!req.query.code || !req.query.state || req.query.state !== req.session.oauthState) return res.status(400).send('Invalid OAuth state. Please try logging in again.');
  try {
    const form = new URLSearchParams({client_id:process.env.DISCORD_CLIENT_ID, client_secret:process.env.DISCORD_CLIENT_SECRET, grant_type:'authorization_code', code:req.query.code, redirect_uri:process.env.DISCORD_REDIRECT_URI});
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:form});
    const token = await tokenRes.json();
    if (!tokenRes.ok) {
  console.error('Discord OAuth status:', tokenRes.status);
  console.error('Discord OAuth response:', await tokenRes.text());
  return res.status(400).send('Discord token exchange failed. Check Render logs.');
    }
    const headers = {Authorization:`Bearer ${token.access_token}`};
    const [userRes, guildRes] = await Promise.all([fetch('https://discord.com/api/users/@me',{headers}), fetch('https://discord.com/api/users/@me/guilds',{headers})]);
    if (!userRes.ok || !guildRes.ok) return res.status(400).send('Could not read your Discord profile/server list. Please try again.');
    req.session.user = await userRes.json();
    req.session.guilds = await guildRes.json();
    delete req.session.oauthState;
    res.redirect('/');
  } catch (e) { console.error('OAuth callback failed:', e.message); res.status(500).send('Login failed. Please check server logs.'); }
});
app.get('/api/me', (req,res) => {
  if (!req.session.user) return res.status(401).json({loggedIn:false});
  const user = req.session.user;
  res.json({loggedIn:true,user:{id:user.id,username:user.username,global_name:user.global_name,avatar:user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128` : null},guilds:(req.session.guilds||[]).filter(g => (BigInt(g.permissions) & 0x8n) === 0x8n).map(g=>({id:g.id,name:g.name,icon:g.icon,owner:g.owner}))});
});
app.post('/auth/logout', (req,res) => req.session.destroy(()=>res.redirect('/')));
app.listen(PORT, () => console.log(`DEVELOP dashboard running on http://localhost:${PORT}`));
