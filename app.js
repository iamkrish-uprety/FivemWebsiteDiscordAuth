require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const axios = require('axios');
const path = require('path');
const compression = require('compression');
const MongoStore = require('connect-mongo');

const app = express();

// --- DB helper (expects ./db to export connectToDB and getDB) ---
const { connectToDB, getDB } = require('./db');

// connectToDB() should initialize a shared connection and be idempotent.
// Call it once during cold start so later requests reuse the connection.
connectToDB().catch((err) => console.error('Initial DB connect failed:', err));

// Configure view engine
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(compression());
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1d' }));
app.use(express.urlencoded({ extended: true }));

// Sessions: use a persistent store (MongoDB) — required for serverless environments
if (!process.env.MONGO_URI) console.warn('MONGO_URI not set — sessions will fail.');
app.use(session({
  secret: process.env.SESSION_SECRET || 'change_this',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  }
}));

app.use(passport.initialize());
app.use(passport.session());
app.set('trust proxy', 1);

// Passport Discord Strategy
passport.use(new DiscordStrategy({
  clientID: process.env.DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET,
  callbackURL: process.env.DISCORD_CALLBACK_URL,
  scope: ['identify', 'guilds', 'email']
}, (accessToken, refreshToken, profile, done) => {
  // store token on profile if you need it later
  profile.accessToken = accessToken;
  return done(null, profile);
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// Helper: fetch member from guild
async function getGuildMember(discordUserId) {
  try {
    const res = await axios.get(`https://discord.com/api/guilds/${process.env.TARGET_GUILD_ID}/members/${discordUserId}`, {
      headers: { Authorization: `Bot ${process.env.BOT_TOKEN}` }
    });
    return res.data;
  } catch (err) {
    console.error('Error fetching member:', err.response?.data || err.message || err);
    return null;
  }
}

// priority roles mapping
const priorityRoles = {
  [process.env.QUEUE_PRIORITY_PLATINUM_ID]: 'Platinum Priority',
  [process.env.QUEUE_PRIORITY_GOLD_ID]: 'Gold Priority',
  [process.env.QUEUE_PRIORITY_SILVER_ID]: 'Silver Priority',
  [process.env.QUEUE_PRIORITY_BRONZE_ID]: 'Bronze Priority'
};

// Middleware checks
function isAuthenticated(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/login');
}

function isAdmin(req, res, next) {
  if (req.isAuthenticated() && req.user && req.user.id === process.env.ADMIN_DISCORD_ID) return next();
  res.redirect('/');
}

// FiveM status checker
async function checkServerStatus() {
  try {
    const response = await axios.get(`http://${process.env.FIVEM_SERVER_IP}/info.json`, { timeout: 2000 });
    return {
      online: true,
      players: response.data.clients || 0,
      maxPlayers: response.data.sv_maxclients || 0,
      hostname: response.data.hostname || 'FiveM Server'
    };
  } catch (error) {
    return { online: false };
  }
}

// Routes
app.get('/', async (req, res) => {
  let serverStatus = null;
  let isWhitelisted = false;

  try {
    serverStatus = await checkServerStatus();

    if (req.isAuthenticated()) {
      const member = await getGuildMember(req.user.id);
      const whitelistedRoleId = process.env.WHITELIST_ROLE_ID;
      isWhitelisted = member?.roles?.includes(whitelistedRoleId);
    }
  } catch (error) {
    console.error('Error in / route:', error);
  }

  res.render('index', {
    user: req.user,
    isWhitelisted,
    serverStatus,
    fivemIP: process.env.FIVEM_SERVER_IP
  });
});

app.get('/dashboard', isAuthenticated, async (req, res) => {
  const serverId = process.env.TARGET_GUILD_ID;
  let server = null;
  let memberCount = 0;
  let isWhitelisted = false;
  let userPriority = null;

  const member = await getGuildMember(req.user.id);

  if (member && Array.isArray(member.roles)) {
    const whitelistedRoleId = process.env.WHITELIST_ROLE_ID;
    isWhitelisted = member.roles.includes(whitelistedRoleId);

    for (const roleId of member.roles) {
      if (priorityRoles[roleId]) {
        userPriority = priorityRoles[roleId];
        break;
      }
    }
  }

  try {
    const guildInfo = await axios.get(`https://discord.com/api/guilds/${serverId}?with_counts=true`, {
      headers: { Authorization: `Bot ${process.env.BOT_TOKEN}` }
    });
    memberCount = guildInfo.data.approximate_member_count;
  } catch (err) {
    console.error('Error fetching member count:', err.response?.data || err);
  }

  if (req.user && req.user.guilds) server = req.user.guilds.find(g => g.id === serverId);

  res.render('dashboard', { user: req.user, server, isWhitelisted, userPriority, memberCount, fivemIP: process.env.FIVEM_SERVER_IP });
});

app.get('/rules', isAuthenticated, (req, res) => res.render('rules', { user: req.user }));
app.get('/application-submitted', isAuthenticated, (req, res) => res.render('application-submitted', { user: req.user }));

app.get('/applications-form', isAuthenticated, async (req, res) => {
  const serverId = process.env.TARGET_GUILD_ID;
  let server = null;
  let memberCount = 0;
  let isWhitelisted = false;
  let userPriority = null;

  const member = await getGuildMember(req.user.id);

  if (member && Array.isArray(member.roles)) {
    const whitelistedRoleId = process.env.WHITELIST_ROLE_ID;
    isWhitelisted = member.roles.includes(whitelistedRoleId);
    for (const roleId of member.roles) if (priorityRoles[roleId]) { userPriority = priorityRoles[roleId]; break; }
  }

  try {
    const guildInfo = await axios.get(`https://discord.com/api/guilds/${serverId}?with_counts=true`, { headers: { Authorization: `Bot ${process.env.BOT_TOKEN}` } });
    memberCount = guildInfo.data.approximate_member_count;
  } catch (err) { console.error('Error fetching member count:', err.response?.data || err); }

  if (req.user && req.user.guilds) server = req.user.guilds.find(g => g.id === serverId);

  const notifications = req.session.notifications || [];
  req.session.notifications = [];

  res.render('applications-form', { user: req.user, server, isWhitelisted, userPriority, memberCount, notifications });
});

app.get('/faq', (req, res) => res.render('faq', { user: req.user }));

app.get('/whitelistform', isAuthenticated, async (req, res) => {
  // similar to applications-form — reuse logic or refactor
  const serverId = process.env.TARGET_GUILD_ID;
  let server = null;
  let memberCount = 0;
  let isWhitelisted = false;
  let userPriority = null;

  const member = await getGuildMember(req.user.id);

  if (member && Array.isArray(member.roles)) {
    const whitelistedRoleId = process.env.WHITELIST_ROLE_ID;
    isWhitelisted = member.roles.includes(whitelistedRoleId);
    for (const roleId of member.roles) if (priorityRoles[roleId]) { userPriority = priorityRoles[roleId]; break; }
  }

  try {
    const guildInfo = await axios.get(`https://discord.com/api/guilds/${serverId}?with_counts=true`, { headers: { Authorization: `Bot ${process.env.BOT_TOKEN}` } });
    memberCount = guildInfo.data.approximate_member_count;
  } catch (err) { console.error('Error fetching member count:', err.response?.data || err); }

  if (req.user && req.user.guilds) server = req.user.guilds.find(g => g.id === serverId);

  const notifications = req.session.notifications || [];
  req.session.notifications = [];

  res.render('whitelistform', { user: req.user, server, isWhitelisted, userPriority, memberCount, notifications });
});

// POST application
app.post('/submit-application', async (req, res) => {
  const db = getDB();

  const formData = {
    discordId: req.body.discord_id,
    discordName: req.body.name,
    ooc_info: req.body.ooc_info,
    age: req.body.age,
    region: req.body.region,
    experience: req.body.experience,
    whyApply: req.body.whyApply,
    stream: req.body.stream,
    backstory: req.body.backstory,
    metagaming: req.body.metagaming,
    failrp: req.body.failrp,
    scenario1: req.body.scenario1,
    scenario2: req.body.scenario2,
    rulebreak: req.body.rulebreak,
    rulesLocation: req.body.rulesLocation,
    submittedAt: new Date()
  };

  try {
    await db.collection('applications').insertOne(formData);

    const webhookUrl = process.env.APPLICATION_WEBHOOK_URL; // move webhook into env
    if (webhookUrl) {
      const embed = {
        title: '📜 New Application Submitted',
        color: 0x5865F2,
        fields: [
          { name: 'Discord ID', value: formData.discordId || 'N/A', inline: true },
          { name: 'Name', value: formData.discordName || 'N/A', inline: true },
          { name: 'Age', value: formData.age || 'N/A', inline: true },
          { name: 'Region', value: formData.region || 'N/A', inline: true },
          { name: 'Experience', value: formData.experience || 'N/A' },
          { name: 'Why Apply', value: formData.whyApply || 'N/A' },
          { name: 'Stream', value: formData.stream || 'N/A' },
          { name: 'Backstory', value: formData.backstory || 'N/A' },
          { name: 'Metagaming', value: formData.metagaming || 'N/A' },
          { name: 'FailRP', value: formData.failrp || 'N/A' },
          { name: 'Scenario 1', value: formData.scenario1 || 'N/A' },
          { name: 'Scenario 2', value: formData.scenario2 || 'N/A' },
          { name: 'Rule Break', value: formData.rulebreak || 'N/A' },
          { name: 'Rules Location', value: formData.rulesLocation || 'N/A' }
        ],
        timestamp: formData.submittedAt
      };

      // use axios POST
      await axios.post(webhookUrl, { embeds: [embed] });
    } else {
      console.warn('No APPLICATION_WEBHOOK_URL set — skipping webhook.');
    }

    res.redirect('/application-submitted');
  } catch (err) {
    console.error('Form submission failed:', err);
    res.status(500).send('Something went wrong!');
  }
});

app.get('/admin', isAdmin, async (req, res) => {
  const db = getDB();

  try {
    const applications = await db.collection('applications').find({}).sort({ submittedAt: -1 }).toArray();
    const notifications = req.session.notifications || [];
    req.session.notifications = [];
    res.render('admin', { applications, notifications, user: req.user });
  } catch (err) {
    console.error('Error fetching applications:', err);
    res.status(500).send('Failed to load admin panel.');
  }
});

app.get('/login', (req, res) => res.render('login', { user: req.user }));
app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect: '/login', successRedirect: '/dashboard' }));

app.get('/logout', (req, res, next) => {
  req.logout(function(err) {
    if (err) return next(err);
    res.redirect('/');
  });
});

// 404
app.use((req, res) => res.status(404).render('404', { user: req.user }));

// Export the Express app for serverless platform (Vercel)
module.exports = app;
