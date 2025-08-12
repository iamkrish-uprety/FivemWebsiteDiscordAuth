require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const axios = require('axios');
const fetch = require('node-fetch');
async function getGuildMember(discordUserId) {
    try {
        const res = await axios.get(`https://discord.com/api/guilds/${process.env.TARGET_GUILD_ID}/members/${discordUserId}`, {
            headers: {
                Authorization: `Bot ${process.env.BOT_TOKEN}`
            }
        });
        return res.data;
    } catch (err) {
        console.error('Error fetching member:', err.response?.data || err);
        return null;
    }
}
const path = require('path');

const app = express();
const { connectToDB } = require('./db');

connectToDB().then(() => {
  app.listen(3000, () => {
    console.log('🚀 Server running on http://localhost:3000');
  });
}).catch(console.error);

// Configure view engine
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

const compression = require('compression');
app.use(compression());

// Middleware
app.use(express.static(path.join(__dirname, 'public'),{ maxAge: '1d' ,}));
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

// Passport Discord Strategy
passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: process.env.DISCORD_CALLBACK_URL,
    scope: ['identify', 'guilds', 'email']
}, (accessToken, refreshToken, profile, done) => {
    return done(null, profile);
}));

passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((obj, done) => {
    done(null, obj);
});

// Routes
app.get('/', async (req, res) => {
    let serverStatus = null;
    let isWhitelisted = false;

    try {
        serverStatus = await checkServerStatus();

        if (req.isAuthenticated()) {
            const member = await getGuildMember(req.user.id); // Make sure this function exists
            const whitelistedRoleId = process.env.WHITELIST_ROLE_ID;
            isWhitelisted = member?.roles.includes(whitelistedRoleId);
        }
    } catch (error) {
        console.error('Error in / route:', error);
    }

    res.render('index', {
        user: req.user,
        isWhitelisted,
        serverStatus,
        fivemIP: process.env.FIVEM_SERVER_IP // used internally only
    });
});



//ROLES NAME
const priorityRoles = {
  [process.env.QUEUE_PRIORITY_PLATINUM_ID]: 'Platinum Priority',
  [process.env.QUEUE_PRIORITY_GOLD_ID]: 'Gold Priority',
  [process.env.QUEUE_PRIORITY_SILVER_ID]: 'Silver Priority',
  [process.env.QUEUE_PRIORITY_BRONZE_ID]: 'Bronze Priority'
};

app.get('/dashboard', isAuthenticated, async (req, res) => {
  const serverId = process.env.TARGET_GUILD_ID;
  let server = null;
  let memberCount = 0;
  let isWhitelisted = false;
  let userPriority = null;

  const member = await getGuildMember(req.user.id);

  if (member && Array.isArray(member.roles)) {
    // Check for whitelist
    const whitelistedRoleId = process.env.WHITELIST_ROLE_ID;
    isWhitelisted = member.roles.includes(whitelistedRoleId);

    // Detect priority
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

  if (req.user && req.user.guilds) {
    server = req.user.guilds.find(g => g.id === serverId);
  }

  res.render('dashboard', {
    user: req.user,
    server,
    isWhitelisted,
    userPriority,
    memberCount,
    fivemIP: process.env.FIVEM_SERVER_IP
  });
});



app.get('/rules', isAuthenticated, (req, res) => {
    res.render('rules', { user: req.user });
});

app.get('/application-submitted', isAuthenticated, (req, res) => {
    res.render('application-submitted', { user: req.user });
});

app.get('/applications-form', isAuthenticated, async (req, res) => {
  const serverId = process.env.TARGET_GUILD_ID;
  let server = null;
  let memberCount = 0;
  let isWhitelisted = false;
  let userPriority = null;

  const member = await getGuildMember(req.user.id);

  if (member && Array.isArray(member.roles)) {
    // Check for whitelist
    const whitelistedRoleId = process.env.WHITELIST_ROLE_ID;
    isWhitelisted = member.roles.includes(whitelistedRoleId);

    // Detect priority
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

  if (req.user && req.user.guilds) {
    server = req.user.guilds.find(g => g.id === serverId);
  }

  const notifications = req.session.notifications || [];
    req.session.notifications = [];

    
  res.render('applications-form', {
    user: req.user,
    server,
    isWhitelisted,
    userPriority,
    memberCount,
    notifications
  });
});



app.get('/faq', (req, res) => {
    res.render('faq', { user: req.user });
});

app.get('/whitelistform', isAuthenticated, async (req, res) => {
  const serverId = process.env.TARGET_GUILD_ID;
  let server = null;
  let memberCount = 0;
  let isWhitelisted = false;
  let userPriority = null;

  const member = await getGuildMember(req.user.id);

  if (member && Array.isArray(member.roles)) {
    // Check for whitelist
    const whitelistedRoleId = process.env.WHITELIST_ROLE_ID;
    isWhitelisted = member.roles.includes(whitelistedRoleId);

    // Detect priority
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

  if (req.user && req.user.guilds) {
    server = req.user.guilds.find(g => g.id === serverId);
  }

  const notifications = req.session.notifications || [];
    req.session.notifications = [];

    
  res.render('whitelistform', {
    user: req.user,
    server,
    isWhitelisted,
    userPriority,
    memberCount,
    notifications
  });
});

const { getDB } = require('./db');

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
    // 1️⃣ Save to DB
    await db.collection('applications').insertOne(formData);

    // 2️⃣ Send to Discord Webhook
    const webhookUrl = 'https://discord.com/api/webhooks/1403529414565822597/-TKxsd724q3YSxhmD_4YUbiofVPbeU-MMysjc7Yjzv5oh24WOm8Va1R-y20RGV84yAU6';

    const embed = {
      title: '📜 New Application Submitted',
      color: 0x5865F2, // Discord blurple
      fields: [
        { name: 'Discord ID', value: formData.discordId || 'N/A', inline: true },
        { name: 'Name', value: formData.discordName || 'N/A', inline: true },
        { name: 'Age', value: formData.age || 'N/A', inline: true },
        { name: 'Region', value: formData.region || 'N/A', inline: true },
        { name: 'Experience', value: formData.experience || 'N/A' },
        { name: 'Why Apply', value: formData.whyApply || 'N/A' },
        { name: 'Stream', value: formData.stream || 'N/A' },
        { name: 'Metagaming', value: formData.metagaming || 'N/A' },
        { name: 'FailRP', value: formData.failrp || 'N/A' },
        { name: 'Rules Location', value: formData.rulesLocation || 'N/A' },
      ],
      timestamp: formData.submittedAt
    };

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] })
    });

    // 3️⃣ Redirect user
    res.redirect('/application-submitted');

  } catch (err) {
    console.error('Form submission failed:', err);
    res.status(500).send('Something went wrong!');
  }
});



app.get('/admin', isAdmin, async (req, res) => {
  const db = getDB(); // Ensure this gets the connected DB

  try {
    const applications = await db.collection('applications')
      .find({})
      .sort({ submittedAt: -1 })
      .toArray();

    const notifications = req.session.notifications || [];
    req.session.notifications = []; // Clear after use

    res.render('admin', { applications, notifications, user: req.user });
  } catch (err) {
    console.error('Error fetching applications:', err);
    res.status(500).send('Failed to load admin panel.');
  }
});


function isAdmin(req, res, next) {
  const adminIds = [process.env.ADMIN_DISCORD_ID]; // or an array of admin user IDs
  if (adminIds.includes(req.user.id)) {
    return next();
  }
  res.status(403).send('Unauthorized');
}


app.get('/login', (req, res) => {
    res.render('login', { user: req.user });
});

app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', {
    failureRedirect: '/login',
    successRedirect: '/dashboard'
}));

app.get('/logout', (req, res, next) => {
    req.logout(function(err) {
        if (err) { return next(err); }
        res.redirect('/');
    });
});


// 404 Handler
app.use((req, res) => {
    res.status(404).render('404', { user: req.user });
});

// Middleware functions
function isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) return next();
    res.redirect('/login');
}

function isAdmin(req, res, next) {
    if (req.isAuthenticated() && req.user.id === process.env.ADMIN_DISCORD_ID) return next();
    res.redirect('/');
}

// FiveM Server Status Check
async function checkServerStatus() {
    try {
        const response = await axios.get(`http://${process.env.FIVEM_SERVER_IP}/info.json`,{ timeout: 2000 });
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

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});