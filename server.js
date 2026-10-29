
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

const required = [
  'DISCORD_CLIENT_ID',
  'DISCORD_CLIENT_SECRET',
  'DISCORD_REDIRECT_URI',
  'SESSION_SECRET'
];

app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
}));

app.use(express.static(path.join(__dirname, 'public')));

app.get('/auth/discord', (req, res, next) => {
  if (required.some(k => !process.env[k])) {
    return res.status(503).send('Discord OAuth settings are missing in Render Environment.');
  }

  const url = new URL('https://discord.com/oauth2/authorize');
  url.searchParams.set('client_id', process.env.DISCORD_CLIENT_ID);
  url.searchParams.set('redirect_uri', process.env.DISCORD_REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'identify guilds');

  req.session.oauthState = crypto.randomBytes(24).toString('hex');

  url.searchParams.set('state', req.session.oauthState);

  req.session.save(err => {
    if (err) return next(err);
    res.redirect(url.toString());
  });
});

app.get('/auth/discord/callback', async (req, res) => {
  if (required.some(k => !process.env[k])) {
    return res.status(503).send('Discord OAuth settings are missing.');
  }

  if (
    !req.query.code ||
    !req.query.state ||
    !req.session.oauthState ||
    req.query.state !== req.session.oauthState
  ) {
    return res.status(400).send(
      'Invalid OAuth State. Open the dashboard in a fresh tab and try again.'
    );
  }

  delete req.session.oauthState;

  try {
    const form = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code: req.query.code,
      redirect_uri: process.env.DISCORD_REDIRECT_URI
    });

    const tokenRes = await fetch(
      'https://discord.com/api/oauth2/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: form
      }
    );

    const raw = await tokenRes.text();
    let token;

    try {
      token = JSON.parse(raw);
    } catch {
      token = {};
    }

    if (!tokenRes.ok || !token.access_token) {
      console.error('Discord token exchange status:', tokenRes.status);
      console.error('Discord token error:', token.error || 'unknown');
      console.error(
        'Discord token description:',
        token.error_description || 'No description provided'
      );

      return res.status(400).send(
        'Discord token exchange failed. Check Render logs and OAuth settings.'
      );
    }

    const headers = {
      Authorization: `Bearer ${token.access_token}`
    };

    const [userRes, guildRes] = await Promise.all([
      fetch('https://discord.com/api/users/@me', { headers }),
      fetch('https://discord.com/api/users/@me/guilds', { headers })
    ]);

    if (!userRes.ok || !guildRes.ok) {
      console.error(
        'Discord profile request status:',
        userRes.status,
        guildRes.status
      );
      return res.status(400).send(
        'Could not load Discord profile. Please try again.'
      );
    }

    req.session.user = await userRes.json();
    req.session.guilds = await guildRes.json();

    req.session.save(err => {
      if (err) {
        console.error('Session save failed:', err.message);
        return res.status(500).send('Could not save login session.');
      }

      res.redirect('/');
    });
  } catch (e) {
    console.error('OAuth callback failed:', e.message);
    res.status(500).send('Login failed. Please check Render logs.');
  }
});

app.get('/api/me', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ loggedIn: false });
  }

  const user = req.session.user;

  res.json({
    loggedIn: true,
    user: {
      id: user.id,
      username: user.username,
      global_name: user.global_name,
      avatar: user.avatar
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
        : null
    },
    guilds: (req.session.guilds || [])
      .filter(g => {
        try {
          return (BigInt(g.permissions) & 0x8n) === 0x8n;
        } catch {
          return false;
        }
      })
      .map(g => ({
        id: g.id,
        name: g.name,
        icon: g.icon,
        owner: g.owner
      }))
  });
});

app.post('/auth/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).send('Could not log out.');
    }

    res.clearCookie('connect.sid');
    res.redirect('/');
  });
});

app.listen(PORT, () => {
  console.log(`DEVELOP dashboard running on port ${PORT}`);
});
