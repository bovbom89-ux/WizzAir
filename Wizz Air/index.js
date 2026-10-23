require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');

const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize
} = require('discord.js');

const BRAND = 0xD5008F;
const PREFIX = 'wizz';
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'wizz-support.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

const EMOJI = {
  Wizz: '<:Wizz:1563267915807989860>',
  Loading: '<:Loading:1563267964067651705>',
  Graph: '<:Graph:1563268004324843530>',
  Gear: '<:Gear:1563268046053834903>',
  Crown: '<:Crown:1563268071752208514>',
  User: '<:User_Icon:1563268115880611840>',
  Padlock: '<:Padlock:1563268140979331243>',
  Hammer: '<:Hammer:1563268164110913646>',
  Warning: '<:Warning:1563268197942169741>',
  Shield: '<:Shield:1563268217919639583>',
  HourGlass: '<:Hour_Glass:1563268252526706749>',
  Star: '<:Star:1563268275553575142>',
  Cross: '<:Cross:1563268299163177060>',
  Tick: '<:Tick:1563268320159866941>',
  Chat: '<:Chat_Bubble:1563268340875657408>',
  Headphones: '<:Headphones:1563268362891436042>',
  Luggage: '<:Luggage:1563268383682728067>',
  Ticket: '<:Ticket:1563268421506961560>',
  Clock: '<:Clock:1563268441987616910>',
  Departure: '<:Departure:1563268463030444215>',
  Arrival: '<:Arrival:1563268506882015342>'
};

const LANGUAGES = {
  en: { name: 'English', flag: '🇬🇧' },
  fr: { name: 'French', flag: '🇫🇷' },
  es: { name: 'Spanish', flag: '🇪🇸' },
  de: { name: 'German', flag: '🇩🇪' },
  it: { name: 'Italian', flag: '🇮🇹' },
  pl: { name: 'Polish', flag: '🇵🇱' },
  ro: { name: 'Romanian', flag: '🇷🇴' },
  hu: { name: 'Hungarian', flag: '🇭🇺' }
};

const TICKET_CATEGORIES = [
  { label: 'Flight and passenger support', value: 'flight', emoji: '✈️' },
  { label: 'Staff or management complaint', value: 'staff', emoji: '👥' },
  { label: 'Report a member', value: 'report', emoji: '🛡️' },
  { label: 'Technical issue', value: 'technical', emoji: '🛠️' },
  { label: 'Partnership enquiry', value: 'partnership', emoji: '🤝' },
  { label: 'Other', value: 'other', emoji: '💬' }
];

const INFORMATION_TEXT = {
  server:
    '# Server Information\n' +
    'Welcome to Wizz Air Virtual.\n\n' +
    'This community is for virtual airline operations, flight participation, passenger support and community interaction.\n\n' +
    '**Getting started**\n' +
    '• Read the server rules.\n' +
    '• Check the available information and flight announcements.\n' +
    '• Follow instructions from authorised staff.\n' +
    '• Contact support if you need assistance.\n\n' +
    '**Community standards**\n' +
    'Treat members respectfully, keep conversations in the appropriate channels and do not impersonate staff.',

  fleet:
    '# Our Fleet\n' +
    'Wizz Air operates an Airbus-focused fleet in real-world aviation.\n\n' +
    '**Aircraft information**\n' +
    '• Airbus A320 family aircraft are associated with short- and medium-haul operations.\n' +
    '• Aircraft assignments in Wizz Air Virtual depend on the virtual airline’s current arrangements.\n' +
    '• Aircraft types, registrations and liveries should be confirmed through official virtual airline announcements.\n\n' +
    'Virtual aircraft and schedules are for simulation and entertainment. A virtual aircraft assignment does not represent a real airline booking.',

  about:
    '# About Wizz Air\n' +
    'Wizz Air is a real low-cost airline founded in 2003. It operates flights across Europe and other markets.\n\n' +
    '**About this community**\n' +
    'Wizz Air Virtual is a virtual aviation community. It is not the official Wizz Air airline, does not issue real airline tickets and is not an official customer service channel for the real airline.\n\n' +
    'For real bookings, baggage rules, refunds or travel documents, use the airline’s official customer service channels.',

  destinations:
    '# Destinations and Bases\n' +
    'Virtual routes and bases are announced by the Wizz Air Virtual management team.\n\n' +
    '**Before a flight**\n' +
    '• Check the departure and destination in the flight announcement.\n' +
    '• Confirm the scheduled time and timezone.\n' +
    '• Read the joining instructions.\n' +
    '• Check for delays, cancellations or revised details.\n\n' +
    'Do not assume that a real-world route is available as a virtual flight unless it has been announced by the virtual airline.',

  staff:
    '# Staff and Departments\n' +
    'Staff help manage the community, support members and coordinate virtual flights.\n\n' +
    '**Typical responsibilities**\n' +
    '• Support staff: answer member questions and handle support tickets.\n' +
    '• Moderation: help enforce server rules.\n' +
    '• Flight operations: publish flight information and coordinate operations.\n' +
    '• Management: oversee the community and its policies.\n\n' +
    'Staff permissions depend on the roles and permissions configured by server management. Never share passwords, bot tokens or other private credentials.',

  flights:
    '# Flights and Boarding\n' +
    'Check the flight announcements for the latest virtual operations.\n\n' +
    '**Joining a flight**\n' +
    '1. Find an upcoming flight announcement.\n' +
    '2. Check its flight number, departure, destination and time.\n' +
    '3. Select **Join Flight** if you intend to participate.\n' +
    '4. Follow any crew or boarding instructions.\n\n' +
    'Joining a virtual flight is not a real airline reservation. Flight times and availability may change. Check the announcement for updates.',

  rules:
    '# Rules and Expectations\n' +
    '• Be respectful to all members.\n' +
    '• Follow Discord’s Terms of Service and Community Guidelines.\n' +
    '• Do not spam, harass, threaten or deliberately disrupt the community.\n' +
    '• Do not impersonate staff or claim permissions you do not have.\n' +
    '• Do not share another member’s private information.\n' +
    '• Use channels for their intended purposes.\n' +
    '• Follow authorised staff instructions and published flight procedures.\n\n' +
    'Staff may take proportionate moderation action for rule violations. Read any additional rules published by the server management team.',

  support:
    '# Support and ModMail\n' +
    'Need help? Send a direct message to Wizz Air Support.\n\n' +
    '**How it works**\n' +
    '1. Choose your preferred language.\n' +
    '2. Select a support category.\n' +
    '3. Describe your issue.\n' +
    '4. The bot will create a private support channel if the server is configured correctly.\n\n' +
    'Messages can be translated for staff. Automated translations may be inaccurate, so clarify important details if needed.\n\n' +
    'Do not send passwords, payment details or other unnecessary sensitive information.',

  roblox:
    '# Roblox Information\n' +
    'Wizz Air Virtual supports virtual aviation activities on Roblox where provided by the community.\n\n' +
    '**Getting ready**\n' +
    '• Check the published experience and flight instructions.\n' +
    '• Make sure your Roblox client is working before the scheduled flight.\n' +
    '• Follow the experience’s rules and authorised staff instructions.\n' +
    '• Report technical problems through support.\n\n' +
    'Roblox participation is separate from real-world airline operations. Never share your Roblox password or account recovery codes.'
};

const DEFAULT_DB = {
  guilds: {},
  tickets: {},
  memberTickets: {},
  pendingTickets: {},
  flights: {},
  warnings: {},
  moderation: [],
  polls: {},
  faq: {},
  notificationPreferences: {},
  attendance: {},
  rewards: {},
  audit: [],
  counters: { ticket: 0, flight: 0 },
  botStartedAt: Date.now()
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureDirectories() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function loadDatabase() {
  ensureDirectories();

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_DB, null, 2));
    return clone(DEFAULT_DB);
  }

  try {
    const saved = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return {
      ...clone(DEFAULT_DB),
      ...saved,
      guilds: saved.guilds || {},
      tickets: saved.tickets || {},
      memberTickets: saved.memberTickets || {},
      pendingTickets: saved.pendingTickets || {},
      flights: saved.flights || {},
      warnings: saved.warnings || {},
      moderation: saved.moderation || [],
      polls: saved.polls || {},
      faq: saved.faq || {},
      notificationPreferences: saved.notificationPreferences || {},
      attendance: saved.attendance || {},
      rewards: saved.rewards || {},
      audit: saved.audit || [],
      counters: { ...DEFAULT_DB.counters, ...(saved.counters || {}) }
    };
  } catch (error) {
    console.error('Database could not be loaded:', error);
    throw new Error(
      `Database file is invalid. Back it up before repairing: ${DATA_FILE}`
    );
  }
}

let db = loadDatabase();
let saveQueue = Promise.resolve();

function saveDatabase() {
  saveQueue = saveQueue.then(async () => {
    ensureDirectories();
    const tempFile = `${DATA_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(db, null, 2));
    fs.renameSync(tempFile, DATA_FILE);
  }).catch(error => {
    console.error('Database save failed:', error);
  });

  return saveQueue;
}

function addAudit(guildId, action, details = {}) {
  db.audit.push({
    guildId,
    action,
    details,
    timestamp: Date.now()
  });

  if (db.audit.length > 5000) {
    db.audit.splice(0, db.audit.length - 5000);
  }

  void saveDatabase();
}

function guildConfig(guildId) {
  if (!db.guilds[guildId]) {
    db.guilds[guildId] = {
      welcomeChannelId: null,
      logChannelId: null,
      announcementChannelId: null,
      flightChannelId: null,
      modmailCategoryId: null,
      modmailStaffRoleId: null,
      autoModEnabled: true,
      spamThreshold: 6,
      spamWindowMs: 8000,
      timeoutMinutes: 10,
      timezone: 'UTC',
      reminderMinutes: [60, 15],
      reportChannelId: null
    };
  }

  return db.guilds[guildId];
}

function safeText(value, max = 1500) {
  if (typeof value !== 'string') return '';
  return value.slice(0, max);
}

function v2Container(text, rows = []) {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(safeText(text, 3900))
    );

  if (rows.length) {
    container.addActionRowComponents(...rows);
  }

  return container;
}

function v2Payload(text, options = {}) {
  const rows = options.rows || [];
  const payload = {
    flags: MessageFlags.IsComponentsV2 |
      (options.ephemeral ? MessageFlags.Ephemeral : 0),
    components: [v2Container(text, rows)],
    allowedMentions: { parse: [] }
  };

  if (options.files) payload.files = options.files;
  return payload;
}

async function sendV2(destination, text, options = {}) {
  return destination.send(v2Payload(text, options));
}

async function replyV2(interaction, text, options = {}) {
  const payload = v2Payload(text, {
    ...options,
    ephemeral: options.ephemeral !== false
  });

  try {
    if (interaction.deferred || interaction.replied) {
      return await interaction.followUp(payload);
    }
    return await interaction.reply(payload);
  } catch (error) {
    console.error('Could not reply to interaction:', error);
    return null;
  }
}

async function editV2(interaction, text, options = {}) {
  return interaction.update(
    v2Payload(text, { ...options, ephemeral: false })
  );
}

function makeButton(label, customId, style = ButtonStyle.Secondary, emoji) {
  const button = new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style);

  if (emoji) button.setEmoji(emoji);
  return button;
}

function makeRow(...buttons) {
  return new ActionRowBuilder().addComponents(...buttons);
}

function isStaff(member) {
  if (!member) return false;

  return member.permissions?.has(PermissionFlagsBits.Administrator) ||
    member.permissions?.has(PermissionFlagsBits.ManageGuild) ||
    member.permissions?.has(PermissionFlagsBits.ManageMessages) ||
    member.permissions?.has(PermissionFlagsBits.ModerateMembers);
}

function isAdmin(member) {
  return Boolean(
    member?.permissions?.has(PermissionFlagsBits.Administrator) ||
    member?.permissions?.has(PermissionFlagsBits.ManageGuild)
  );
}

async function sendLog(guild, text) {
  const config = guildConfig(guild.id);
  if (!config.logChannelId) return;

  const channel = guild.channels.cache.get(config.logChannelId) ||
    await guild.channels.fetch(config.logChannelId).catch(() => null);

  if (channel?.isTextBased()) {
    await sendV2(channel, text).catch(console.error);
  }
}

function escapeMarkdown(value) {
  return String(value || '')
    .replace(/([\\`*_{}[\]()#+\-.!|>])/g, '\\$1')
    .slice(0, 1500);
}

function languageOptions() {
  return Object.entries(LANGUAGES).map(([value, lang]) => ({
    label: lang.name,
    value,
    emoji: lang.flag
  }));
}

function languageSelect() {
  return new StringSelectMenuBuilder()
    .setCustomId('modmail:language')
    .setPlaceholder('Choose your language')
    .addOptions(languageOptions());
}

function categorySelect() {
  return new StringSelectMenuBuilder()
    .setCustomId('modmail:category')
    .setPlaceholder('Choose a support category')
    .addOptions(TICKET_CATEGORIES);
}

function makeInformationSelect() {
  return new StringSelectMenuBuilder()
    .setCustomId('information:select')
    .setPlaceholder('Choose an information category')
    .addOptions([
      { label: 'Server Information', value: 'server', emoji: '🏠' },
      { label: 'Our Fleet', value: 'fleet', emoji: '✈️' },
      { label: 'About Wizz Air', value: 'about', emoji: '💜' },
      { label: 'Destinations & Bases', value: 'destinations', emoji: '🌍' },
      { label: 'Staff & Departments', value: 'staff', emoji: '👥' },
      { label: 'Flights & Boarding', value: 'flights', emoji: '🛫' },
      { label: 'Rules & Expectations', value: 'rules', emoji: '📜' },
      { label: 'Support & ModMail', value: 'support', emoji: '🎧' },
      { label: 'Roblox Information', value: 'roblox', emoji: '🎮' }
    ]);
}

const LANGUAGE_PAIRS = {
  en: 'en',
  fr: 'fr',
  es: 'es',
  de: 'de',
  it: 'it',
  pl: 'pl',
  ro: 'ro',
  hu: 'hu'
};

function splitUtf8(text, maxBytes = 430) {
  const words = String(text).split(/(\s+)/);
  const chunks = [];
  let current = '';

  for (const word of words) {
    if (Buffer.byteLength(current + word, 'utf8') <= maxBytes) {
      current += word;
      continue;
    }

    if (current) chunks.push(current);
    current = '';

    if (Buffer.byteLength(word, 'utf8') <= maxBytes) {
      current = word;
      continue;
    }

    for (const character of word) {
      if (Buffer.byteLength(current + character, 'utf8') > maxBytes) {
        if (current) chunks.push(current);
        current = '';
      }
      current += character;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

async function translateChunk(text, from, to) {
  if (from === to || !text.trim()) return text;

  const params = new URLSearchParams({
    q: text,
    langpair: `${from}|${to}`,
    mt: '1'
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(
      `https://api.mymemory.translated.net/get?${params.toString()}`,
      {
        method: 'GET',
        headers: { 'User-Agent': 'WizzAirSupportDiscordBot/1.0' },
        signal: controller.signal
      }
    );

    if (!response.ok) {
      throw new Error(`Translation service returned HTTP ${response.status}`);
    }

    const data = await response.json();

    if (data.responseStatus !== 200 ||
        !data.responseData?.translatedText) {
      throw new Error(
        data.responseDetails || 'Translation was not available'
      );
    }

    return String(data.responseData.translatedText)
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  } finally {
    clearTimeout(timeout);
  }
}

async function translateText(text, from, to) {
  if (!LANGUAGE_PAIRS[from] || !LANGUAGE_PAIRS[to]) {
    throw new Error('Unsupported translation language.');
  }

  if (from === to) return text;

  const chunks = splitUtf8(text);
  const translated = [];

  for (const chunk of chunks) {
    translated.push(
      await translateChunk(chunk, LANGUAGE_PAIRS[from], LANGUAGE_PAIRS[to])
    );
  }

  return translated.join('');
}

async function translatedOrOriginal(text, from, to) {
  try {
    return {
      text: await translateText(text, from, to),
      translated: from !== to
    };
  } catch (error) {
    console.warn('Translation failed:', error.message);
    return { text, translated: false };
  }
}

function attachmentList(message) {
  if (!message.attachments?.size) return '';

  return '\n\n**Attachments**\n' +
    [...message.attachments.values()]
      .map(file => `${file.name || 'Attachment'}: ${file.url}`)
      .join('\n')
      .slice(0, 1500);
}

async function openModMail(user) {
  const existingId = db.memberTickets[user.id];
  const existing = existingId ? db.tickets[existingId] : null;

  if (existing && existing.status !== 'closed') {
    await sendV2(
      user,
      `You already have an open support ticket: **${existing.id}**.\n` +
      'Reply to this DM to continue your conversation.'
    );
    return;
  }

  db.pendingTickets[user.id] = {
    language: 'en',
    createdAt: Date.now()
  };

  await saveDatabase();

  await sendV2(
    user,
    `${EMOJI.Wizz} **Wizz Air Support — ModMail**\n\n` +
    'Welcome! Choose your preferred language to begin.\n\n' +
    'Your messages may be translated for support staff. ' +
    'Automated translations can be inaccurate.',
    { rows: [new ActionRowBuilder().addComponents(languageSelect())] }
  );
}

async function createTicket(guild, user, pending, description) {
  const config = guildConfig(guild.id);

  if (!config.modmailCategoryId || !config.modmailStaffRoleId) {
    throw new Error(
      'ModMail is not configured. Ask a server administrator to run /modmail-setup.'
    );
  }

  const category = guild.channels.cache.get(config.modmailCategoryId) ||
    await guild.channels.fetch(config.modmailCategoryId).catch(() => null);

  const staffRole = guild.roles.cache.get(config.modmailStaffRoleId) ||
    await guild.roles.fetch(config.modmailStaffRoleId).catch(() => null);

  if (!category || category.type !== ChannelType.GuildCategory || !staffRole) {
    throw new Error('The configured ModMail category or staff role is invalid.');
  }

  const ticketNumber = ++db.counters.ticket;
  const ticketId = `ticket-${String(ticketNumber).padStart(6, '0')}`;

  const channel = await guild.channels.create({
    name: ticketId,
    type: ChannelType.GuildText,
    parent: category.id,
    topic: `Wizz Air Support ticket ${ticketId} | Member ID: ${user.id}`,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel]
      },
      {
        id: staffRole.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles
        ]
      },
      {
        id: client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.AttachFiles
        ]
      }
    ]
  });

  const ticket = {
    id: ticketId,
    guildId: guild.id,
    channelId: channel.id,
    userId: user.id,
    username: user.username,
    language: pending.language || 'en',
    category: pending.category || 'other',
    status: 'open',
    claimedBy: null,
    createdAt: Date.now(),
    closedAt: null,
    messageCount: 0,
    history: []
  };

  db.tickets[ticketId] = ticket;
  db.memberTickets[user.id] = ticketId;
  delete db.pendingTickets[user.id];

  await saveDatabase();

  await sendV2(
    channel,
    `${EMOJI.Ticket} **${ticketId} — Support Ticket**\n\n` +
    `**Member:** ${user} (\`${user.id}\`)\n` +
    `**Category:** ${ticket.category}\n` +
    `**Language:** ${LANGUAGES[ticket.language]?.name || 'English'}\n` +
    `**Status:** Open\n\n` +
    '**Initial message — original**\n' +
    safeText(description, 1800),
    {
      rows: [
        makeRow(
          makeButton('Claim', `ticket:claim:${ticketId}`, ButtonStyle.Primary),
          makeButton('Close', `ticket:close:${ticketId}`, ButtonStyle.Danger)
        )
      ]
    }
  );

  addAudit(guild.id, 'ticket_created', {
    ticketId,
    userId: user.id,
    category: ticket.category
  });

  await sendV2(
    user,
    `${EMOJI.Tick} Your support ticket **${ticketId}** has been created.\n\n` +
    'Reply to this DM to send messages to the support team. ' +
    'Keep this conversation open while your issue is being handled.'
  );

  await sendLog(
    guild,
    `**ModMail ticket created**\nTicket: ${ticketId}\nMember: ${user.tag || user.username}`
  );

  return ticket;
}

async function findGuildForTicket(ticket) {
  return client.guilds.cache.get(ticket.guildId) ||
    await client.guilds.fetch(ticket.guildId).catch(() => null);
}

async function forwardMemberMessage(message, ticket) {
  const guild = await findGuildForTicket(ticket);
  const channel = guild
    ? guild.channels.cache.get(ticket.channelId) ||
      await guild.channels.fetch(ticket.channelId).catch(() => null)
    : null;

  if (!channel || !channel.isTextBased()) {
    await sendV2(
      message.author,
      'Your support channel is currently unavailable. Please contact a server administrator.'
    );
    return;
  }

  const original = safeText(message.content || '(No text content)', 1800);
  const translated = await translatedOrOriginal(
    original,
    ticket.language,
    'en'
  );

  const marker = translated.translated
    ? '\n\n**English translation**\n' + safeText(translated.text, 1800)
    : '\n\n*Translation unavailable; the original text is shown.*';

  const text =
    `**Member message — ${escapeMarkdown(message.author.username)}**\n` +
    `Ticket: \`${ticket.id}\`\n\n` +
    '**Original message**\n' + original +
    attachmentList(message) +
    marker;

  await sendV2(channel, text);

  ticket.messageCount++;
  ticket.history.push({
    authorId: message.author.id,
    direction: 'member_to_staff',
    content: original,
    timestamp: Date.now()
  });

  await saveDatabase();
}

async function forwardStaffMessage(message, ticket) {
  if (!ticket || ticket.status === 'closed') return;

  const user = await client.users.fetch(ticket.userId).catch(() => null);
  if (!user) {
    await sendV2(message.channel, 'Could not find the ticket member.');
    return;
  }

  const original = safeText(message.content || '(No text content)', 1800);
  const translated = await translatedOrOriginal(
    original,
    'en',
    ticket.language
  );

  const langName = LANGUAGES[ticket.language]?.name || 'English';

  const body = translated.translated
    ? `**Support reply (${langName})**\n${safeText(translated.text, 1800)}\n\n` +
      '*Automated translation — wording may not be exact.*'
    : `**Support reply**\n${original}\n\n` +
      '*Translation unavailable; the original reply is shown.*';

  try {
    await sendV2(
      user,
      `${EMOJI.Chat} **Reply from Wizz Air Support**\n` +
      `Ticket: \`${ticket.id}\`\n\n${body}` +
      attachmentList(message)
    );

    ticket.messageCount++;
    ticket.history.push({
      authorId: message.author.id,
      direction: 'staff_to_member',
      content: original,
      timestamp: Date.now()
    });

    await saveDatabase();
  } catch (error) {
    await sendV2(
      message.channel,
      'The reply could not be delivered. The member may have DMs disabled.'
    );
  }
}

async function closeTicket(ticket, staffUser, reason = 'No reason provided') {
  ticket.status = 'closed';
  ticket.closedAt = Date.now();
  ticket.closedBy = staffUser.id;
  ticket.closeReason = safeText(reason, 500);

  if (db.memberTickets[ticket.userId] === ticket.id) {
    delete db.memberTickets[ticket.userId];
  }

  await saveDatabase();

  const guild = await findGuildForTicket(ticket);
  const channel = guild
    ? guild.channels.cache.get(ticket.channelId) ||
      await guild.channels.fetch(ticket.channelId).catch(() => null)
    : null;

  if (channel) {
    await sendV2(
      channel,
      `**Ticket closed**\nClosed by: ${staffUser}\nReason: ${ticket.closeReason}`
    );

    await channel.permissionOverwrites.edit(ticket.userId, {
      ViewChannel: false
    }).catch(() => null);
  }

  const user = await client.users.fetch(ticket.userId).catch(() => null);

  if (user) {
    await sendV2(
      user,
      `Your support ticket **${ticket.id}** has been closed.\n` +
      `Reason: ${ticket.closeReason}\n\n` +
      'If you need more help, send the bot a new DM to open another ticket.'
    ).catch(() => null);
  }

  if (guild) {
    await sendLog(guild, `**Ticket closed:** ${ticket.id}\nBy: ${staffUser.tag || staffUser.username}`);
    addAudit(guild.id, 'ticket_closed', {
      ticketId: ticket.id,
      staffId: staffUser.id,
      reason
    });
  }
}

const commands = [
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure Wizz Air Support')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(o => o.setName('welcome-channel').setDescription('Welcome channel').addChannelTypes(ChannelType.GuildText))
    .addChannelOption(o => o.setName('log-channel').setDescription('Audit log channel').addChannelTypes(ChannelType.GuildText))
    .addChannelOption(o => o.setName('announcement-channel').setDescription('Announcement channel').addChannelTypes(ChannelType.GuildText))
    .addChannelOption(o => o.setName('flight-channel').setDescription('Flight announcements channel').addChannelTypes(ChannelType.GuildText))
    .addStringOption(o => o.setName('timezone').setDescription('Default timezone, e.g. Europe/London')),

  new SlashCommandBuilder()
    .setName('modmail-setup')
    .setDescription('Configure ModMail')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(o => o.setName('category').setDescription('Private ticket category').setRequired(true).addChannelTypes(ChannelType.GuildCategory))
    .addRoleOption(o => o.setName('staff-role').setDescription('Role that can view support tickets').setRequired(true)),

  new SlashCommandBuilder().setName('information').setDescription('Browse Wizz Air Virtual information'),

  new SlashCommandBuilder().setName('botinfo').setDescription('View bot status and diagnostics'),
  new SlashCommandBuilder().setName('ping').setDescription('Check bot latency'),

  new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('View member information')
    .addUserOption(o => o.setName('user').setDescription('Member to inspect')),

  new SlashCommandBuilder().setName('serverinfo').setDescription('View server information'),

  new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('View a member avatar')
    .addUserOption(o => o.setName('user').setDescription('Member')),

  new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Create a two-option poll')
    .addStringOption(o => o.setName('question').setDescription('Poll question').setRequired(true))
    .addStringOption(o => o.setName('option-a').setDescription('First option').setRequired(true))
    .addStringOption(o => o.setName('option-b').setDescription('Second option').setRequired(true)),

  new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Publish a Components V2 message')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(o => o.setName('title').setDescription('Message heading').setRequired(true))
    .addStringOption(o => o.setName('message').setDescription('Message body').setRequired(true)),

  new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Publish an announcement')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(o => o.setName('message').setDescription('Announcement text').setRequired(true)),

  new SlashCommandBuilder()
    .setName('flight')
    .setDescription('Publish a virtual flight')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o => o.setName('number').setDescription('Flight number').setRequired(true))
    .addStringOption(o => o.setName('departure').setDescription('Departure airport').setRequired(true))
    .addStringOption(o => o.setName('destination').setDescription('Destination airport').setRequired(true))
    .addStringOption(o => o.setName('departure-time').setDescription('Date/time with timezone, e.g. 2026-11-01T18:30:00Z').setRequired(true))
    .addStringOption(o => o.setName('instructions').setDescription('Joining instructions')),

  new SlashCommandBuilder().setName('flights').setDescription('List upcoming virtual flights'),

  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a member')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)),

  new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout a member')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
    .addIntegerOption(o => o.setName('minutes').setDescription('Duration in minutes').setRequired(true).setMinValue(1).setMaxValue(40320))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)),

  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)),

  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)),

  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Delete recent messages')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o => o.setName('amount').setDescription('Number of messages (1–100)').setRequired(true).setMinValue(1).setMaxValue(100)),

  new SlashCommandBuilder()
    .setName('modmail-reply')
    .setDescription('Reply to a ticket member')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(o => o.setName('ticket').setDescription('Ticket ID').setRequired(true))
    .addStringOption(o => o.setName('message').setDescription('Reply text').setRequired(true)),

  new SlashCommandBuilder()
    .setName('modmail-close')
    .setDescription('Close a support ticket')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(o => o.setName('ticket').setDescription('Ticket ID').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Closing reason')),

  new SlashCommandBuilder()
    .setName('modmail-claim')
    .setDescription('Claim a support ticket')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(o => o.setName('ticket').setDescription('Ticket ID').setRequired(true)),

  new SlashCommandBuilder()
    .setName('modmail-note')
    .setDescription('Add an internal staff-only note')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(o => o.setName('ticket').setDescription('Ticket ID').setRequired(true))
    .addStringOption(o => o.setName('note').setDescription('Internal note').setRequired(true)),

  new SlashCommandBuilder()
    .setName('modlogs')
    .setDescription('Removed command')
];

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User]
});

const spamTracker = new Map();
const pollVotes = new Map();

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const body = commands
    .filter(command => command.name !== 'modlogs')
    .map(command => command.toJSON());

  if (process.env.GUILD_ID) {
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body }
    );
  } else {
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body }
    );
  }

  console.log(`Registered ${body.length} slash commands.`);
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  client.user.setPresence({
    activities: [{ name: 'Wizz Air Virtual | /information', type: 0 }],
    status: 'online'
  });

  try {
    await registerCommands();
  } catch (error) {
    console.error('Command registration failed:', error);
  }

  await recoverFlights();
});

async function recoverFlights() {
  for (const flight of Object.values(db.flights)) {
    if (flight.status === 'scheduled' && !flight.reminders) {
      flight.reminders = [];
    }
  }

  await saveDatabase();
}

async function findTicketFromChannel(channelId) {
  return Object.values(db.tickets).find(
    ticket => ticket.channelId === channelId
  );
}

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      const { commandName } = interaction;

      if (commandName === 'setup') {
        if (!isAdmin(interaction.member)) {
          return replyV2(interaction, 'You need Manage Server or Administrator permissions.');
        }

        const config = guildConfig(interaction.guildId);
        const welcome = interaction.options.getChannel('welcome-channel');
        const logs = interaction.options.getChannel('log-channel');
        const announcements = interaction.options.getChannel('announcement-channel');
        const flights = interaction.options.getChannel('flight-channel');
        const timezone = interaction.options.getString('timezone');

        if (welcome) config.welcomeChannelId = welcome.id;
        if (logs) config.logChannelId = logs.id;
        if (announcements) config.announcementChannelId = announcements.id;
        if (flights) config.flightChannelId = flights.id;
        if (timezone) config.timezone = timezone;

        await saveDatabase();
        addAudit(interaction.guildId, 'setup_updated', {
          userId: interaction.user.id
        });

        return replyV2(
          interaction,
          `${EMOJI.Gear} **Wizz Air Support Setup**\n\n` +
          `Welcome channel: ${config.welcomeChannelId ? `<#${config.welcomeChannelId}>` : 'Not configured'}\n` +
          `Log channel: ${config.logChannelId ? `<#${config.logChannelId}>` : 'Not configured'}\n` +
          `Announcement channel: ${config.announcementChannelId ? `<#${config.announcementChannelId}>` : 'Not configured'}\n` +
          `Flight channel: ${config.flightChannelId ? `<#${config.flightChannelId}>` : 'Not configured'}\n` +
          `Timezone: ${config.timezone}\n\n` +
          'Use `/modmail-setup` to configure private support tickets.'
        );
      }

      if (commandName === 'modmail-setup') {
        if (!isAdmin(interaction.member)) {
          return replyV2(interaction, 'You need Manage Server or Administrator permissions.');
        }

        const category = interaction.options.getChannel('category');
        const role = interaction.options.getRole('staff-role');
        const config = guildConfig(interaction.guildId);

        config.modmailCategoryId = category.id;
        config.modmailStaffRoleId = role.id;

        await saveDatabase();

        return replyV2(
          interaction,
          `${EMOJI.Tick} ModMail configured.\n\n` +
          `Ticket category: ${category}\n` +
          `Support role: ${role}\n\n` +
          'Make sure the bot has Manage Channels, View Channels, Send Messages and Read Message History permissions.'
        );
      }

      if (commandName === 'information') {
        return replyV2(
          interaction,
          `${EMOJI.Wizz} **Wizz Air Virtual Information**\n\nChoose a category below.`,
          { rows: [new ActionRowBuilder().addComponents(makeInformationSelect())] }
        );
      }

      if (commandName === 'ping') {
        return replyV2(
          interaction,
          `${EMOJI.Clock} **Pong!**\n` +
          `WebSocket latency: ${client.ws.ping} ms\n` +
          `Round-trip latency: ${Date.now() - interaction.createdTimestamp} ms`
        );
      }

      if (commandName === 'botinfo') {
        const uptime = Math.floor(client.uptime / 1000);
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = uptime % 60;

        return replyV2(
          interaction,
          `${EMOJI.Wizz} **Wizz Air Support — Diagnostics**\n\n` +
          `**Version:** 1.0.0\n` +
          `**Node.js:** ${process.version}\n` +
          `**Discord.js:** ${require('discord.js').version}\n` +
          `**Uptime:** ${hours}h ${minutes}m ${seconds}s\n` +
          `**WebSocket latency:** ${client.ws.ping} ms\n` +
          `**Guilds:** ${client.guilds.cache.size}\n` +
          `**Cached users:** ${client.users.cache.size}\n` +
          `**Open tickets:** ${Object.values(db.tickets).filter(t => t.status === 'open').length}\n` +
          `**Stored flights:** ${Object.keys(db.flights).length}\n` +
          `**Database:** ${fs.existsSync(DATA_FILE) ? 'Available' : 'Missing'}\n` +
          `**Translation:** MyMemory API with fallback enabled`
        );
      }

      if (commandName === 'userinfo') {
        const user = interaction.options.getUser('user') || interaction.user;
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);

        return replyV2(
          interaction,
          `${EMOJI.User} **User Information**\n\n` +
          `**Username:** ${user.tag || user.username}\n` +
          `**User ID:** \`${user.id}\`\n` +
          `**Account created:** <t:${Math.floor(user.createdTimestamp / 1000)}:F>\n` +
          `**Server joined:** ${member?.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>` : 'Unknown'}\n` +
          `**Bot account:** ${user.bot ? 'Yes' : 'No'}`
        );
      }

      if (commandName === 'serverinfo') {
        const guild = interaction.guild;
        return replyV2(
          interaction,
          `${EMOJI.Graph} **Server Information**\n\n` +
          `**Name:** ${guild.name}\n` +
          `**Server ID:** \`${guild.id}\`\n` +
          `**Members:** ${guild.memberCount}\n` +
          `**Channels:** ${guild.channels.cache.size}\n` +
          `**Roles:** ${guild.roles.cache.size}\n` +
          `**Created:** <t:${Math.floor(guild.createdTimestamp / 1000)}:F>`
        );
      }

      if (commandName === 'avatar') {
        const user = interaction.options.getUser('user') || interaction.user;
        return replyV2(
          interaction,
          `# Avatar\n${user.displayAvatarURL({ size: 1024, extension: 'png' })}`
        );
      }

      if (commandName === 'announce' || commandName === 'embed') {
        if (!isStaff(interaction.member)) {
          return replyV2(interaction, 'You do not have permission to publish messages.');
        }

        const config = guildConfig(interaction.guildId);
        const channelId = config.announcementChannelId;
        const channel = channelId
          ? interaction.guild.channels.cache.get(channelId) ||
            await interaction.guild.channels.fetch(channelId).catch(() => null)
          : null;

        if (!channel?.isTextBased()) {
          return replyV2(interaction, 'Set an announcement channel first using `/setup`.');
        }

        let content;

        if (commandName === 'announce') {
          content = `${EMOJI.Wizz} **Wizz Air Virtual — Announcement**\n\n` +
            safeText(interaction.options.getString('message'), 3000) +
            `\n\n-# Published by ${escapeMarkdown(interaction.user.username)}`;
        } else {
          content = `# ${safeText(interaction.options.getString('title'), 200)}\n\n` +
            safeText(interaction.options.getString('message'), 3000);
        }

        await sendV2(channel, content);
        addAudit(interaction.guildId, `${commandName}_published`, {
          userId: interaction.user.id,
          channelId: channel.id
        });

        return replyV2(interaction, `Published successfully in ${channel}.`);
      }

      if (commandName === 'flight') {
        if (!isStaff(interaction.member)) {
          return replyV2(interaction, 'You do not have permission to publish flights.');
        }

        const config = guildConfig(interaction.guildId);
        const channelId = config.flightChannelId || config.announcementChannelId;
        const channel = channelId
          ? interaction.guild.channels.cache.get(channelId) ||
            await interaction.guild.channels.fetch(channelId).catch(() => null)
          : null;

        if (!channel?.isTextBased()) {
          return replyV2(interaction, 'Set a flight channel using `/setup` first.');
        }

        const number = interaction.options.getString('number');
        const departure = interaction.options.getString('departure');
        const destination = interaction.options.getString('destination');
        const departureTime = interaction.options.getString('departure-time');
        const instructions = interaction.options.getString('instructions') || 'Follow the instructions provided by flight staff.';

        const departureTimestamp = Date.parse(departureTime);
        if (!Number.isFinite(departureTimestamp) || departureTimestamp <= Date.now()) {
          return replyV2(
            interaction,
            'The departure time must be a valid future date and time. Include a timezone, for example `2026-11-01T18:30:00Z`.'
          );
        }

        const flightId = `${PREFIX}-${++db.counters.flight}`;
        const flight = {
          id: flightId,
          guildId: interaction.guildId,
          number,
          departure,
          destination,
          departureTimestamp,
          instructions,
          status: 'scheduled',
          passengers: [],
          reminders: [],
          createdBy: interaction.user.id,
          createdAt: Date.now(),
          messageId: null,
          channelId: channel.id
        };

        db.flights[flightId] = flight;
        await saveDatabase();

        const row = makeRow(
          makeButton('Join Flight (0)', `flight:join:${flightId}`, ButtonStyle.Primary, EMOJI.Ticket),
          makeButton('Flight Details', `flight:details:${flightId}`, ButtonStyle.Secondary)
        );

        const message = await sendV2(
          channel,
          `${EMOJI.Departure} **Wizz Air Virtual — Flight Announcement**\n\n` +
          `**Flight:** ${escapeMarkdown(number)}\n` +
          `**Departure:** ${escapeMarkdown(departure)}\n` +
          `**Destination:** ${escapeMarkdown(destination)}\n` +
          `**Departure time:** <t:${Math.floor(departureTimestamp / 1000)}:F>\n` +
          `**Countdown:** <t:${Math.floor(departureTimestamp / 1000)}:R>\n` +
          `**Passengers joined:** 0\n` +
          `**Status:** Scheduled\n\n` +
          `**Instructions**\n${safeText(instructions, 1200)}\n\n` +
          '-# Join the flight below if you intend to participate.',
          { rows: [row] }
        );

        flight.messageId = message.id;
        await saveDatabase();

        addAudit(interaction.guildId, 'flight_published', {
          flightId,
          userId: interaction.user.id
        });

        return replyV2(interaction, `Flight **${number}** published in ${channel}.`);
      }

      if (commandName === 'flights') {
        const flights = Object.values(db.flights)
          .filter(f => f.guildId === interaction.guildId &&
            f.status === 'scheduled' &&
            f.departureTimestamp > Date.now())
          .sort((a, b) => a.departureTimestamp - b.departureTimestamp)
          .slice(0, 15);

        if (!flights.length) {
          return replyV2(interaction, 'There are no upcoming scheduled flights at the moment.');
        }

        const text = flights.map(f =>
          `**${escapeMarkdown(f.number)}** — ${escapeMarkdown(f.departure)} → ${escapeMarkdown(f.destination)}\n` +
          `<t:${Math.floor(f.departureTimestamp / 1000)}:F> · <t:${Math.floor(f.departureTimestamp / 1000)}:R>\n` +
          `Passengers: ${f.passengers.length} · Status: ${f.status}`
        ).join('\n\n');

        return replyV2(interaction, `# Upcoming Flights\n\n${text}`);
      }

      if (commandName === 'poll') {
        if (!isStaff(interaction.member)) {
          return replyV2(interaction, 'You do not have permission to create polls.');
        }

        const question = interaction.options.getString('question');
        const optionA = interaction.options.getString('option-a');
        const optionB = interaction.options.getString('option-b');
        const pollId = `poll-${Date.now()}`;

        db.polls[pollId] = {
          guildId: interaction.guildId,
          question,
          optionA,
          optionB,
          votes: { a: [], b: [] },
          createdAt: Date.now()
        };

        await saveDatabase();

        const row = makeRow(
          makeButton(optionA, `poll:${pollId}:a`, ButtonStyle.Primary),
          makeButton(optionB, `poll:${pollId}:b`, ButtonStyle.Secondary)
        );

        await sendV2(
          interaction.channel,
          `# 📊 ${safeText(question, 250)}\n\n` +
          `Choose an option below.\n\n` +
          `**${safeText(optionA, 80)}:** 0 votes\n` +
          `**${safeText(optionB, 80)}:** 0 votes`,
          { rows: [row] }
        );

        return replyV2(interaction, 'Poll published.');
      }

      if (commandName === 'warn' || commandName === 'timeout' ||
          commandName === 'kick' || commandName === 'ban') {
        if (!isStaff(interaction.member)) {
          return replyV2(interaction, 'You do not have permission to use this moderation command.');
        }

        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason');
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);

        if (!member) {
          return replyV2(interaction, 'That member is not in this server.');
        }

        if (user.id === interaction.user.id || user.id === client.user.id) {
          return replyV2(interaction, 'You cannot use this command on yourself or the bot.');
        }

        if (member.roles.highest.position >= interaction.member.roles.highest.position &&
            interaction.guild.ownerId !== interaction.user.id) {
          return replyV2(interaction, 'You cannot moderate a member with an equal or higher role.');
        }

        if (commandName === 'warn') {
          db.warnings[user.id] ||= [];
          db.warnings[user.id].push({
            guildId: interaction.guildId,
            moderatorId: interaction.user.id,
            reason,
            timestamp: Date.now()
          });
        } else if (commandName === 'timeout') {
          const minutes = interaction.options.getInteger('minutes');
          await member.timeout(minutes * 60 * 1000, reason);
        } else if (commandName === 'kick') {
          if (!member.kickable) {
            return replyV2(interaction, 'I cannot kick this member. Check role hierarchy and bot permissions.');
          }
          await member.kick(reason);
        } else if (commandName === 'ban') {
          if (!member.bannable) {
            return replyV2(interaction, 'I cannot ban this member. Check role hierarchy and bot permissions.');
          }
          await member.ban({ reason });
        }

        db.moderation.push({
          guildId: interaction.guildId,
          action: commandName,
          targetId: user.id,
          moderatorId: interaction.user.id,
          reason,
          timestamp: Date.now()
        });

        await saveDatabase();
        addAudit(interaction.guildId, `moderation_${commandName}`, {
          targetId: user.id,
          moderatorId: interaction.user.id,
          reason
        });

        await sendLog(
          interaction.guild,
          `**Moderation action: ${commandName}**\nMember: ${user.tag || user.username}\nModerator: ${interaction.user.tag || interaction.user.username}\nReason: ${reason}`
        );

        return replyV2(
          interaction,
          `${EMOJI.Tick} **${commandName.toUpperCase()} recorded**\n` +
          `Member: ${user}\nReason: ${safeText(reason, 500)}`
        );
      }

      if (commandName === 'clear') {
        if (!isStaff(interaction.member)) {
          return replyV2(interaction, 'You do not have permission to clear messages.');
        }

        const amount = interaction.options.getInteger('amount');
        const messages = await interaction.channel.bulkDelete(amount, true);

        return replyV2(
          interaction,
          `Deleted ${messages.size} messages. Discord does not allow bulk deletion of messages older than 14 days.`
        );
      }

      if (commandName.startsWith('modmail-')) {
        if (!isStaff(interaction.member)) {
          return replyV2(interaction, 'You need support staff permissions to manage tickets.');
        }

        const ticketId = interaction.options.getString('ticket');
        const ticket = db.tickets[ticketId];

        if (!ticket) {
          return replyV2(interaction, 'Ticket not found. Check the ticket ID.');
        }

        if (commandName === 'modmail-reply') {
          if (ticket.status === 'closed') {
            return replyV2(interaction, 'This ticket is closed.');
          }

          const message = interaction.options.getString('message');
          const user = await client.users.fetch(ticket.userId).catch(() => null);

          if (!user) return replyV2(interaction, 'Could not find the ticket member.');

          const translated = await translatedOrOriginal(message, 'en', ticket.language);

          await sendV2(
            user,
            `**Reply from Wizz Air Support**\nTicket: \`${ticket.id}\`\n\n` +
            (translated.translated
              ? `${safeText(translated.text, 1800)}\n\n*Automated translation; wording may not be exact.*`
              : `${safeText(message, 1800)}\n\n*Translation unavailable; original reply shown.*`)
          );

          ticket.messageCount++;
          ticket.history.push({
            authorId: interaction.user.id,
            direction: 'staff_to_member',
            content: message,
            timestamp: Date.now()
          });

          await saveDatabase();
          return replyV2(interaction, `Reply sent to ${user}.`);
        }

        if (commandName === 'modmail-close') {
          const reason = interaction.options.getString('reason') || 'No reason provided';
          await closeTicket(ticket, interaction.user, reason);
          return replyV2(interaction, `Ticket ${ticket.id} closed.`);
        }

        if (commandName === 'modmail-claim') {
          if (ticket.status === 'closed') {
            return replyV2(interaction, 'This ticket is closed.');
          }

          ticket.claimedBy = interaction.user.id;
          await saveDatabase();

          const guild = await findGuildForTicket(ticket);
          const channel = guild?.channels.cache.get(ticket.channelId);

          if (channel) {
            await sendV2(channel, `Ticket claimed by ${interaction.user}.`);
          }

          return replyV2(interaction, `You claimed ticket ${ticket.id}.`);
        }

        if (commandName === 'modmail-note') {
          const note = interaction.options.getString('note');
          const guild = await findGuildForTicket(ticket);
          const channel = guild?.channels.cache.get(ticket.channelId);

          if (channel) {
            await sendV2(
              channel,
              `**Internal staff note — not sent to the member**\n` +
              `Author: ${interaction.user}\n${safeText(note, 1500)}`
            );
          }

          ticket.history.push({
            authorId: interaction.user.id,
            direction: 'internal_note',
            content: note,
            timestamp: Date.now()
          });

          await saveDatabase();
          return replyV2(interaction, 'Internal note added.');
        }
      }

      return replyV2(interaction, 'Unknown command.');
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'information:select') {
        const key = interaction.values[0];
        return editV2(
          interaction,
          `${EMOJI.Wizz} **Wizz Air Virtual Information**\n\n${INFORMATION_TEXT[key] || 'Information unavailable.'}`,
          {
            rows: [
              new ActionRowBuilder().addComponents(makeInformationSelect())
            ]
          }
        );
      }

      if (interaction.customId === 'modmail:language') {
        const pending = db.pendingTickets[interaction.user.id];
        if (!pending) {
          return replyV2(interaction, 'Your ModMail session expired. Send the bot a DM to start again.');
        }

        pending.language = interaction.values[0];
        await saveDatabase();

        return editV2(
          interaction,
          `Language selected: **${LANGUAGES[pending.language].name}**.\n\nNow choose the support category.`,
          { rows: [new ActionRowBuilder().addComponents(categorySelect())] }
        );
      }

      if (interaction.customId === 'modmail:category') {
        const pending = db.pendingTickets[interaction.user.id];
        if (!pending) {
          return replyV2(interaction, 'Your ModMail session expired. Send the bot a DM to start again.');
        }

        pending.category = interaction.values[0];
        await saveDatabase();

        const modal = new ModalBuilder()
          .setCustomId('modmail:description')
          .setTitle('Describe your issue');

        const description = new TextInputBuilder()
          .setCustomId('description')
          .setLabel('How can our support team help?')
          .setPlaceholder('Explain what happened and what help you need.')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1800);

        modal.addComponents(
          new ActionRowBuilder().addComponents(description)
        );

        return interaction.showModal(modal);
      }
    }

    if (interaction.isModalSubmit() &&
        interaction.customId === 'modmail:description') {
      const pending = db.pendingTickets[interaction.user.id];

      if (!pending) {
        return replyV2(interaction, 'Your ModMail session expired. Send the bot a DM to start again.');
      }

      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: 'Creating your support ticket...'
      });

      const guild = client.guilds.cache.get(process.env.GUILD_ID) ||
        client.guilds.cache.first();

      if (!guild) {
        delete db.pendingTickets[interaction.user.id];
        await saveDatabase();
        return interaction.editReply('The support server is unavailable. Please try again later.');
      }

      const description = interaction.fields.getTextInputValue('description');

      try {
        await createTicket(guild, interaction.user, pending, description);
        return interaction.editReply('Your support ticket has been created. Check your DMs.');
      } catch (error) {
        console.error('Ticket creation failed:', error);
        return interaction.editReply(
          `Could not create your ticket: ${safeText(error.message, 500)}`
        );
      }
    }

    if (interaction.isButton()) {
      const parts = interaction.customId.split(':');

      if (parts[0] === 'flight' && parts[1] === 'join') {
        const flight = db.flights[parts[2]];

        if (!flight || flight.status !== 'scheduled') {
          return replyV2(interaction, 'This flight is no longer accepting joins.');
        }

        if (flight.departureTimestamp <= Date.now()) {
          return replyV2(interaction, 'This flight has already reached its departure time.');
        }

        if (flight.passengers.includes(interaction.user.id)) {
          return replyV2(interaction, 'You have already joined this flight.');
        }

        flight.passengers.push(interaction.user.id);
        await saveDatabase();

        const guild = await client.guilds.fetch(flight.guildId).catch(() => null);
        const channel = guild?.channels.cache.get(flight.channelId);

        if (channel && flight.messageId) {
          const message = await channel.messages.fetch(flight.messageId).catch(() => null);

          if (message) {
            const row = makeRow(
              makeButton(
                `Join Flight (${flight.passengers.length})`,
                `flight:join:${flight.id}`,
                ButtonStyle.Primary,
                EMOJI.Ticket
              ),
              makeButton('Flight Details', `flight:details:${flight.id}`, ButtonStyle.Secondary)
            );

            const newText =
              `${EMOJI.Departure} **Wizz Air Virtual — Flight Announcement**\n\n` +
              `**Flight:** ${escapeMarkdown(flight.number)}\n` +
              `**Departure:** ${escapeMarkdown(flight.departure)}\n` +
              `**Destination:** ${escapeMarkdown(flight.destination)}\n` +
              `**Departure time:** <t:${Math.floor(flight.departureTimestamp / 1000)}:F>\n` +
              `**Countdown:** <t:${Math.floor(flight.departureTimestamp / 1000)}:R>\n` +
              `**Passengers joined:** ${flight.passengers.length}\n` +
              `**Status:** ${flight.status}\n\n` +
              `**Instructions**\n${safeText(flight.instructions, 1200)}\n\n` +
              '-# Join the flight below if you intend to participate.';

            await message.edit(v2Payload(newText, { rows: [row] })).catch(console.error);
          }
        }

        addAudit(flight.guildId, 'flight_joined', {
          flightId: flight.id,
          userId: interaction.user.id
        });

        return replyV2(
          interaction,
          `${EMOJI.Tick} You have joined flight **${flight.number}**.\n` +
          `Passengers currently joined: ${flight.passengers.length}`
        );
      }

      if (parts[0] === 'flight' && parts[1] === 'details') {
        const flight = db.flights[parts[2]];

        if (!flight) return replyV2(interaction, 'Flight not found.');

        return replyV2(
          interaction,
          `# Flight Details\n\n` +
          `**Flight:** ${flight.number}\n` +
          `**Route:** ${flight.departure} → ${flight.destination}\n` +
          `**Departure:** <t:${Math.floor(flight.departureTimestamp / 1000)}:F>\n` +
          `**Countdown:** <t:${Math.floor(flight.departureTimestamp / 1000)}:R>\n` +
          `**Passengers joined:** ${flight.passengers.length}\n` +
          `**Status:** ${flight.status}\n\n` +
          `**Instructions**\n${safeText(flight.instructions, 1500)}`
        );
      }

      if (parts[0] === 'poll') {
        const pollId = parts[1];
        const choice = parts[2];
        const poll = db.polls[pollId];

        if (!poll) return replyV2(interaction, 'This poll is no longer available.');

        poll.votes.a = poll.votes.a.filter(id => id !== interaction.user.id);
        poll.votes.b = poll.votes.b.filter(id => id !== interaction.user.id);
        poll.votes[choice].push(interaction.user.id);

        await saveDatabase();

        return replyV2(
          interaction,
          `Your vote has been recorded.\n\n` +
          `**${poll.optionA}:** ${poll.votes.a.length}\n` +
          `**${poll.optionB}:** ${poll.votes.b.length}`
        );
      }

      if (parts[0] === 'ticket') {
        const ticket = db.tickets[parts[2]];

        if (!ticket) return replyV2(interaction, 'Ticket not found.');
        if (!isStaff(interaction.member)) {
          return replyV2(interaction, 'You do not have permission to manage this ticket.');
        }

        if (parts[1] === 'claim') {
          if (ticket.status === 'closed') {
            return replyV2(interaction, 'This ticket is closed.');
          }

          ticket.claimedBy = interaction.user.id;
          await saveDatabase();
          await sendV2(interaction.channel, `Ticket claimed by ${interaction.user}.`);

          return replyV2(interaction, `You claimed ${ticket.id}.`);
        }

        if (parts[1] === 'close') {
          await closeTicket(ticket, interaction.user, 'Closed using the ticket controls.');
          return replyV2(interaction, `Ticket ${ticket.id} closed.`);
        }
      }
    }
  } catch (error) {
    console.error('Interaction handler error:', error);

    if (interaction.isRepliable()) {
      await replyV2(
        interaction,
        'Something went wrong while processing that action. Check the bot logs or try again.'
      ).catch(() => null);
    }
  }
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;

  try {
    if (!message.guild) {
      const ticketId = db.memberTickets[message.author.id];
      const ticket = ticketId ? db.tickets[ticketId] : null;

      if (ticket && ticket.status !== 'closed') {
        await forwardMemberMessage(message, ticket);
      } else {
        await openModMail(message.author);
      }

      return;
    }

    const config = guildConfig(message.guild.id);

    if (config.autoModEnabled && !isStaff(message.member)) {
      const now = Date.now();
      const key = `${message.guild.id}:${message.author.id}`;
      const recent = (spamTracker.get(key) || [])
        .filter(timestamp => now - timestamp < config.spamWindowMs);

      recent.push(now);
      spamTracker.set(key, recent);

      const excessiveMentions = message.mentions.users.size > 5 ||
        message.mentions.roles.size > 5;

      const repeatedContent = recent.length >= config.spamThreshold &&
        message.content.length > 0;

      if (excessiveMentions || repeatedContent) {
        await message.delete().catch(() => null);

        const member = message.member;
        if (member?.moderatable) {
          await member.timeout(
            config.timeoutMinutes * 60 * 1000,
            'Automatic anti-spam moderation'
          ).catch(() => null);
        }

        await sendLog(
          message.guild,
          `**Auto-moderation triggered**\nMember: ${message.author}\nReason: ${excessiveMentions ? 'Excessive mentions' : 'Repeated messages'}`
        );

        addAudit(message.guild.id, 'auto_moderation', {
          userId: message.author.id,
          reason: excessiveMentions ? 'excessive_mentions' : 'repeated_messages'
        });

        return;
      }
    }

    const ticket = await findTicketFromChannel(message.channel.id);

    if (ticket && ticket.status !== 'closed' && isStaff(message.member)) {
      if (!message.content.startsWith('/')) {
        await forwardStaffMessage(message, ticket);
      }
    }
  } catch (error) {
    console.error('Message handler error:', error);
  }
});

client.on('guildMemberAdd', async member => {
  try {
    const config = guildConfig(member.guild.id);
    const channel = config.welcomeChannelId
      ? member.guild.channels.cache.get(config.welcomeChannelId) ||
        await member.guild.channels.fetch(config.welcomeChannelId).catch(() => null)
      : null;

    if (!channel?.isTextBased()) return;

    await sendV2(
      channel,
      `${EMOJI.Wizz} **Welcome to Wizz Air Virtual!**\n\n` +
      `Welcome ${member}!\n\n` +
      'Thank you for joining Wizz Air Virtual! Please read our server rules before getting started. Enjoy your flight with us!\n\n' +
      `**Member number:** ${member.guild.memberCount}\n\n` +
      '-# Let\\'s WIZZ'
    );

    addAudit(member.guild.id, 'member_joined', { userId: member.id });
  } catch (error) {
    console.error('Welcome handler failed:', error);
  }
});

client.on('guildMemberRemove', async member => {
  addAudit(member.guild.id, 'member_left', { userId: member.id });

  await sendLog(
    member.guild,
    `**Member left**\n${member.user?.tag || member.id} (\`${member.id}\`)`
  );
});

client.on('messageDelete', async message => {
  if (!message.guild || message.author?.bot) return;

  await sendLog(
    message.guild,
    `**Message deleted**\nAuthor: ${message.author || 'Unknown'}\nChannel: ${message.channel}\nContent: ${safeText(message.content || '[No cached content]', 1000)}`
  );
});

client.on('messageUpdate', async (oldMessage, newMessage) => {
  if (!newMessage.guild || newMessage.author?.bot) return;
  if (oldMessage.content === newMessage.content) return;

  await sendLog(
    newMessage.guild,
    `**Message edited**\nAuthor: ${newMessage.author || 'Unknown'}\nChannel: ${newMessage.channel}\nBefore: ${safeText(oldMessage.content || '[Unavailable]', 800)}\nAfter: ${safeText(newMessage.content || '[Unavailable]', 800)}`
  );
});

client.on('error', error => {
  console.error('Discord client error:', error);
});

process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error);
});

setInterval(async () => {
  try {
    ensureDirectories();

    const backupPath = path.join(
      BACKUP_DIR,
      `wizz-support-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    );

    fs.copyFileSync(DATA_FILE, backupPath);

    const backups = fs.readdirSync(BACKUP_DIR)
      .filter(name => name.endsWith('.json'))
      .sort();

    while (backups.length > 10) {
      const old = backups.shift();
      fs.unlinkSync(path.join(BACKUP_DIR, old));
    }
  } catch (error) {
    console.error('Automatic backup failed:', error);
  }
}, 6 * 60 * 60 * 1000).unref();

if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID) {
  console.error('Missing DISCORD_TOKEN or CLIENT_ID in your .env file.');
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
