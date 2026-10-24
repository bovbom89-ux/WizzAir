
require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");

const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
} = require("discord.js");

// ============================================================
// GARDEN ADVENTURES BOT
// Discord.js v14
// Six slash commands only
// No embed colours or emoji characters
// ============================================================

if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID) {
  console.error("Missing DISCORD_TOKEN or CLIENT_ID in .env");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "garden-data.json");

const STAFF_PERMISSION = PermissionFlagsBits.ManageGuild;
const EPHEMERAL = MessageFlags.Ephemeral;

// ============================================================
// PERSISTENT DATA
// ============================================================

let db = {
  polls: {},
  notificationPanels: {},
};

function loadData() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  if (!fs.existsSync(DATA_FILE)) {
    saveData();
    return;
  }

  try {
    const saved = JSON.parse(
      fs.readFileSync(DATA_FILE, "utf8")
    );

    // Keep unrelated data from older versions.
    db = {
      ...saved,
      polls: saved.polls || {},
      notificationPanels: saved.notificationPanels || {},
    };
  } catch (error) {
    console.error("Could not read the data file:", error);
    throw error;
  }
}

function saveData() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const temporaryFile = DATA_FILE + ".tmp";

  fs.writeFileSync(
    temporaryFile,
    JSON.stringify(db, null, 2)
  );

  fs.renameSync(temporaryFile, DATA_FILE);
}

loadData();

// ============================================================
// EMBED AND RESPONSE HELPERS
// No setColor calls are used anywhere.
// ============================================================

function makeEmbed(title, description) {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description || "No details provided.")
    .setTimestamp();
}

async function privateReply(interaction, options) {
  const payload =
    typeof options === "string"
      ? { content: options }
      : { ...options };

  payload.flags = (payload.flags || 0) | EPHEMERAL;

  if (interaction.deferred || interaction.replied) {
    return interaction.followUp(payload);
  }

  return interaction.reply(payload);
}

function isStaff(interaction) {
  return Boolean(
    interaction.memberPermissions?.has(STAFF_PERMISSION) ||
    interaction.memberPermissions?.has(
      PermissionFlagsBits.Administrator
    )
  );
}

async function requireStaff(interaction) {
  if (isStaff(interaction)) return true;

  await privateReply(interaction, {
    embeds: [
      makeEmbed(
        "Permission denied",
        "You need the Manage Server permission to use this command."
      ),
    ],
  });

  return false;
}

function isTextChannel(channel) {
  return Boolean(
    channel &&
    channel.isTextBased() &&
    channel.guild
  );
}

function canSendEmbed(channel) {
  const botMember = channel.guild.members.me;

  if (!botMember) return false;

  return Boolean(
    channel.permissionsFor(botMember)?.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
    ])
  );
}

function clampText(value, maximum = 4000) {
  const text = String(value ?? "");
  return text.length > maximum
    ? text.slice(0, maximum - 3) + "..."
    : text;
}

function safeError(error) {
  console.error(error);
  return "Something went wrong. Check the bot logs for details.";
}

// ============================================================
// COMMAND DEFINITIONS
// Only these six commands are registered.
// ============================================================

const commands = [
  new SlashCommandBuilder()
    .setName("embed")
    .setDescription("Publish a custom embed")
    .setDefaultMemberPermissions(STAFF_PERMISSION)
    .addChannelOption(option =>
      option
        .setName("channel")
        .setDescription("Channel to publish in")
        .addChannelTypes(
          ChannelType.GuildText,
          ChannelType.GuildAnnouncement
        )
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("title")
        .setDescription("Embed title")
        .setMaxLength(256)
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("description")
        .setDescription("Embed description")
        .setMaxLength(4000)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("publishupdate")
    .setDescription("Publish a Garden Adventures game update")
    .setDefaultMemberPermissions(STAFF_PERMISSION)
    .addChannelOption(option =>
      option
        .setName("channel")
        .setDescription("Channel to publish in")
        .addChannelTypes(
          ChannelType.GuildText,
          ChannelType.GuildAnnouncement
        )
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("version")
        .setDescription("Update version")
        .setMaxLength(50)
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("title")
        .setDescription("Update title")
        .setMaxLength(256)
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("details")
        .setDescription("Update details")
        .setMaxLength(4000)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Publish a two-option poll")
    .setDefaultMemberPermissions(STAFF_PERMISSION)
    .addChannelOption(option =>
      option
        .setName("channel")
        .setDescription("Channel to publish in")
        .addChannelTypes(
          ChannelType.GuildText,
          ChannelType.GuildAnnouncement
        )
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("question")
        .setDescription("Poll question")
        .setMaxLength(1000)
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("option1")
        .setDescription("First voting option")
        .setMaxLength(80)
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("option2")
        .setDescription("Second voting option")
        .setMaxLength(80)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("notificationroles")
    .setDescription("Create a notification-role panel")
    .setDefaultMemberPermissions(STAFF_PERMISSION)
    .addChannelOption(option =>
      option
        .setName("channel")
        .setDescription("Channel for the role panel")
        .addChannelTypes(
          ChannelType.GuildText,
          ChannelType.GuildAnnouncement
        )
        .setRequired(true)
    )
    .addRoleOption(option =>
      option
        .setName("role1")
        .setDescription("First selectable role")
        .setRequired(true)
    )
    .addRoleOption(option =>
      option
        .setName("role2")
        .setDescription("Second selectable role")
        .setRequired(false)
    )
    .addRoleOption(option =>
      option
        .setName("role3")
        .setDescription("Third selectable role")
        .setRequired(false)
    )
    .addRoleOption(option =>
      option
        .setName("role4")
        .setDescription("Fourth selectable role")
        .setRequired(false)
    )
    .addRoleOption(option =>
      option
        .setName("role5")
        .setDescription("Fifth selectable role")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Publish a server announcement")
    .setDefaultMemberPermissions(STAFF_PERMISSION)
    .addChannelOption(option =>
      option
        .setName("channel")
        .setDescription("Channel for the announcement")
        .addChannelTypes(
          ChannelType.GuildText,
          ChannelType.GuildAnnouncement
        )
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("title")
        .setDescription("Announcement title")
        .setMaxLength(256)
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("message")
        .setDescription("Announcement message")
        .setMaxLength(4000)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("health")
    .setDescription("Check the bot's operational status"),
].map(command => command.toJSON());

// ============================================================
// REGISTER SLASH COMMANDS
// If GUILD_ID is configured, guild commands are registered
// and the global command list is cleared.
// Otherwise, the six commands are registered globally.
// ============================================================

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(
    process.env.DISCORD_TOKEN
  );

  const applicationRoute = Routes.applicationCommands(
    process.env.CLIENT_ID
  );

  if (process.env.GUILD_ID) {
    await rest.put(applicationRoute, { body: [] });

    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    );

    console.log("Registered six guild slash commands.");
  } else {
    await rest.put(applicationRoute, { body: commands });
    console.log("Registered six global slash commands.");
  }
}

// ============================================================
// POLL HELPERS
// Votes are saved by user ID, so a person has one active vote.
// ============================================================

function pollCounts(poll) {
  const counts = [0, 0];

  for (const vote of Object.values(poll.votes || {})) {
    if (vote === 0 || vote === 1) counts[vote]++;
  }

  return counts;
}

function makePollEmbed(poll) {
  const counts = pollCounts(poll);
  const total = counts[0] + counts[1];

  return makeEmbed(
    poll.question,
    [
      `**${poll.options[0]}**`,
      `Votes: ${counts[0]}`,
      "",
      `**${poll.options[1]}**`,
      `Votes: ${counts[1]}`,
      "",
      `Total votes: ${total}`,
      "",
      "Select an option below to cast or change your vote.",
    ].join("\n")
  );
}

function makePollButtons(pollId, poll) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ga_poll:${pollId}:0`)
      .setLabel(clampText(poll.options[0], 80))
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`ga_poll:${pollId}:1`)
      .setLabel(clampText(poll.options[1], 80))
      .setStyle(ButtonStyle.Secondary)
  );
}

// ============================================================
// NOTIFICATION ROLE HELPERS
// Buttons add or remove the selected role.
// No reaction emojis are used.
// ============================================================

function makeRoleRows(roles) {
  const rows = [];

  for (let i = 0; i < roles.length; i += 5) {
    const row = new ActionRowBuilder();

    for (const role of roles.slice(i, i + 5)) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`ga_role:${role.id}`)
          .setLabel(clampText(role.name, 80))
          .setStyle(ButtonStyle.Secondary)
      );
    }

    rows.push(row);
  }

  return rows;
}

function makeRolePanelEmbed(roles) {
  const descriptions = roles.map(
    role => `**${role.name}**\nSelect the button to add or remove this role.`
  );

  return makeEmbed(
    "Notification roles",
    [
      "Choose which notifications you want to receive.",
      "Select a role button to add that role. Select it again to remove the role.",
      "",
      descriptions.join("\n\n"),
    ].join("\n")
  );
}

// ============================================================
// COMMAND HANDLERS
// ============================================================

async function handleEmbed(interaction) {
  if (!(await requireStaff(interaction))) return;

  const channel = interaction.options.getChannel("channel");
  const title = interaction.options.getString("title", true);
  const description = interaction.options.getString(
    "description",
    true
  );

  if (!isTextChannel(channel) || !canSendEmbed(channel)) {
    return privateReply(interaction, {
      embeds: [
        makeEmbed(
          "Cannot publish",
          "The bot needs permission to view the selected channel, send messages and embed links."
        ),
      ],
    });
  }

  const embed = makeEmbed(title, description);

  await channel.send({
    embeds: [embed],
    allowedMentions: { parse: [] },
  });

  return privateReply(interaction, {
    embeds: [
      makeEmbed(
        "Embed published",
        `Your embed was published in ${channel}.`
      ),
    ],
  });
}

async function handlePublishUpdate(interaction) {
  if (!(await requireStaff(interaction))) return;

  const channel = interaction.options.getChannel("channel");
  const version = interaction.options.getString("version", true);
  const title = interaction.options.getString("title", true);
  const details = interaction.options.getString("details", true);

  if (!isTextChannel(channel) || !canSendEmbed(channel)) {
    return privateReply(interaction, {
      embeds: [
        makeEmbed(
          "Cannot publish",
          "The bot needs permission to view the selected channel, send messages and embed links."
        ),
      ],
    });
  }

  const embed = makeEmbed(
    title,
    `Version: ${version}\n\n${details}`
  );

  await channel.send({
    embeds: [embed],
    allowedMentions: { parse: [] },
  });

  return privateReply(interaction, {
    embeds: [
      makeEmbed(
        "Update published",
        `The game update was published in ${channel}.`
      ),
    ],
  });
}

async function handleAnnounce(interaction) {
  if (!(await requireStaff(interaction))) return;

  const channel = interaction.options.getChannel("channel");
  const title = interaction.options.getString("title", true);
  const message = interaction.options.getString("message", true);

  if (!isTextChannel(channel) || !canSendEmbed(channel)) {
    return privateReply(interaction, {
      embeds: [
        makeEmbed(
          "Cannot publish",
          "The bot needs permission to view the selected channel, send messages and embed links."
        ),
      ],
    });
  }

  await channel.send({
    embeds: [makeEmbed(title, message)],
    allowedMentions: { parse: [] },
  });

  return privateReply(interaction, {
    embeds: [
      makeEmbed(
        "Announcement published",
        `Your announcement was published in ${channel}.`
      ),
    ],
  });
}

async function handlePoll(interaction) {
  if (!(await requireStaff(interaction))) return;

  const channel = interaction.options.getChannel("channel");
  const question = interaction.options.getString("question", true);
  const option1 = interaction.options.getString("option1", true);
  const option2 = interaction.options.getString("option2", true);

  if (option1.trim() === option2.trim()) {
    return privateReply(interaction, {
      content: "Please provide two different voting options.",
    });
  }

  if (!isTextChannel(channel) || !canSendEmbed(channel)) {
    return privateReply(interaction, {
      embeds: [
        makeEmbed(
          "Cannot publish",
          "The bot needs permission to view the selected channel, send messages and embed links."
        ),
      ],
    });
  }

  const pollId = `${Date.now()}_${interaction.id}`;

  const poll = {
    guildId: interaction.guildId,
    channelId: channel.id,
    question,
    options: [option1, option2],
    votes: {},
    createdAt: new Date().toISOString(),
  };

  db.polls[pollId] = poll;
  saveData();

  try {
    const message = await channel.send({
      embeds: [makePollEmbed(poll)],
      components: [makePollButtons(pollId, poll)],
      allowedMentions: { parse: [] },
    });

    poll.messageId = message.id;
    saveData();
  } catch (error) {
    delete db.polls[pollId];
    saveData();
    throw error;
  }

  return privateReply(interaction, {
    embeds: [
      makeEmbed(
        "Poll published",
        `Your poll was published in ${channel}.`
      ),
    ],
  });
}

async function handleNotificationRoles(interaction) {
  if (!(await requireStaff(interaction))) return;

  const channel = interaction.options.getChannel("channel");

  const roles = [];

  for (let i = 1; i <= 5; i++) {
    const role = interaction.options.getRole(`role${i}`);

    if (role && !roles.some(existing => existing.id === role.id)) {
      roles.push({
        id: role.id,
        name: role.name,
      });
    }
  }

  if (!roles.length) {
    return privateReply(interaction, {
      content: "Select at least one role.",
    });
  }

  if (
    roles.some(role => role.id === interaction.guildId)
  ) {
    return privateReply(interaction, {
      content: "The everyone role cannot be used in this panel.",
    });
  }

  if (!isTextChannel(channel) || !canSendEmbed(channel)) {
    return privateReply(interaction, {
      embeds: [
        makeEmbed(
          "Cannot publish",
          "The bot needs permission to view the selected channel, send messages and embed links."
        ),
      ],
    });
  }

  const botMember = interaction.guild.members.me;

  if (
    !botMember ||
    !channel.permissionsFor(botMember)?.has(
      PermissionFlagsBits.SendMessages
    )
  ) {
    return privateReply(interaction, {
      content: "The bot cannot send messages in that channel.",
    });
  }

  const manageableRoles = roles.filter(role => {
    const guildRole = interaction.guild.roles.cache.get(role.id);

    return Boolean(
      guildRole &&
      !guildRole.managed &&
      guildRole.position < botMember.roles.highest.position
    );
  });

  if (manageableRoles.length !== roles.length) {
    return privateReply(interaction, {
      embeds: [
        makeEmbed(
          "Role hierarchy issue",
          "Move the bot's highest role above every selected notification role, then try again."
        ),
      ],
    });
  }

  const panelMessage = await channel.send({
    embeds: [makeRolePanelEmbed(roles)],
    components: makeRoleRows(roles),
    allowedMentions: { parse: [] },
  });

  db.notificationPanels[panelMessage.id] = {
    guildId: interaction.guildId,
    channelId: channel.id,
    roles,
  };

  saveData();

  return privateReply(interaction, {
    embeds: [
      makeEmbed(
        "Notification panel published",
        `The notification-role panel was published in ${channel}.`
      ),
    ],
  });
}

async function handleHealth(interaction) {
  const seconds = Math.floor(client.uptime / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const memoryMb = Math.round(
    process.memoryUsage().rss / 1024 / 1024
  );

  const guildCount = client.guilds.cache.size;
  const ping = Math.round(client.ws.ping);

  return privateReply(interaction, {
    embeds: [
      makeEmbed(
        "Bot health",
        [
          "Status: Online",
          `WebSocket latency: ${ping} ms`,
          `Uptime: ${days} days, ${hours} hours, ${minutes} minutes`,
          `Servers: ${guildCount}`,
          `Memory usage: ${memoryMb} MB`,
          "Command registration: Six configured commands",
        ].join("\n")
      ),
    ],
  });
}

// ============================================================
// BUTTON HANDLERS
// ============================================================

async function handlePollButton(interaction, pollId, optionIndex) {
  const poll = db.polls[pollId];

  if (!poll) {
    return privateReply(interaction, {
      content: "This poll is no longer available.",
    });
  }

  if (poll.guildId !== interaction.guildId) {
    return privateReply(interaction, {
      content: "This poll belongs to another server.",
    });
  }

  if (optionIndex !== 0 && optionIndex !== 1) {
    return privateReply(interaction, {
      content: "That voting option is invalid.",
    });
  }

  poll.votes ||= {};
  poll.votes[interaction.user.id] = optionIndex;
  saveData();

  try {
    await interaction.message.edit({
      embeds: [makePollEmbed(poll)],
      components: [makePollButtons(pollId, poll)],
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    console.error("Could not refresh poll:", error);
  }

  return privateReply(interaction, {
    content: `Your vote for "${poll.options[optionIndex]}" has been recorded.`,
  });
}

async function handleRoleButton(interaction, roleId) {
  if (!interaction.inGuild()) {
    return privateReply(interaction, {
      content: "This control can only be used in a server.",
    });
  }

  const panel = db.notificationPanels[interaction.message.id];

  if (
    !panel ||
    panel.guildId !== interaction.guildId ||
    !panel.roles.some(role => role.id === roleId)
  ) {
    return privateReply(interaction, {
      content: "This notification-role panel is no longer available.",
    });
  }

  const role = interaction.guild.roles.cache.get(roleId);

  if (!role || role.managed || role.id === interaction.guildId) {
    return privateReply(interaction, {
      content: "This role cannot be assigned.",
    });
  }

  const botMember = interaction.guild.members.me;

  if (
    !botMember ||
    role.position >= botMember.roles.highest.position ||
    !botMember.permissions.has(PermissionFlagsBits.ManageRoles)
  ) {
    return privateReply(interaction, {
      content: "The bot cannot manage this role. Check its Manage Roles permission and role position.",
    });
  }

  const member = await interaction.guild.members.fetch(
    interaction.user.id
  );

  if (member.roles.cache.has(roleId)) {
    await member.roles.remove(roleId);

    return privateReply(interaction, {
      content: `The role "${role.name}" has been removed from your account.`,
    });
  }

  await member.roles.add(roleId);

  return privateReply(interaction, {
    content: `The role "${role.name}" has been added to your account.`,
  });
}

// ============================================================
// BACKGROUND SPAM MONITOR
// This is an automatic safeguard, not a slash command.
// ============================================================

const recentMessages = new Map();
const SPAM_WINDOW_MS = 5000;
const SPAM_LIMIT = 6;
const SPAM_COOLDOWN_MS = 10000;
const spamCooldowns = new Map();

client.on("messageCreate", async message => {
  if (!message.guild || message.author.bot) return;

  const member = message.member;

  if (
    member?.permissions.has(PermissionFlagsBits.ManageMessages) ||
    member?.permissions.has(PermissionFlagsBits.Administrator)
  ) {
    return;
  }

  const now = Date.now();
  const key = `${message.guild.id}:${message.author.id}`;

  const previous = recentMessages.get(key) || [];
  const current = previous.filter(
    timestamp => now - timestamp < SPAM_WINDOW_MS
  );

  current.push(now);
  recentMessages.set(key, current);

  const cooldownEnd = spamCooldowns.get(key) || 0;

  if (
    current.length >= SPAM_LIMIT &&
    now >= cooldownEnd
  ) {
    spamCooldowns.set(key, now + SPAM_COOLDOWN_MS);

    try {
      if (message.deletable) {
        await message.delete();
      }

      console.log(
        `Spam threshold reached in guild ${message.guild.id} by user ${message.author.id}.`
      );
    } catch (error) {
      console.error("Could not remove a spam message:", error);
    }
  }
});

// Periodically clean expired message tracking entries.
setInterval(() => {
  const now = Date.now();

  for (const [key, timestamps] of recentMessages.entries()) {
    const current = timestamps.filter(
      timestamp => now - timestamp < SPAM_WINDOW_MS
    );

    if (current.length) {
      recentMessages.set(key, current);
    } else {
      recentMessages.delete(key);
    }
  }

  for (const [key, expiresAt] of spamCooldowns.entries()) {
    if (expiresAt <= now) spamCooldowns.delete(key);
  }
}, 30000).unref();

// ============================================================
// BACKGROUND JOIN-SPIKE MONITOR
// Logs unusually large bursts of joins.
// It does not automatically ban or kick members.
// ============================================================

const recentJoins = new Map();
const JOIN_WINDOW_MS = 15000;
const JOIN_SPIKE_LIMIT = 10;

client.on("guildMemberAdd", member => {
  const now = Date.now();
  const previous = recentJoins.get(member.guild.id) || [];

  const current = previous.filter(
    timestamp => now - timestamp < JOIN_WINDOW_MS
  );

  current.push(now);
  recentJoins.set(member.guild.id, current);

  if (current.length >= JOIN_SPIKE_LIMIT) {
    console.warn(
      `Join spike detected in guild ${member.guild.id}: ${current.length} joins within ${JOIN_WINDOW_MS / 1000} seconds.`
    );
  }
});

// ============================================================
// INTERACTION ROUTER
// ============================================================

client.on("interactionCreate", async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      switch (interaction.commandName) {
        case "embed":
          return await handleEmbed(interaction);

        case "publishupdate":
          return await handlePublishUpdate(interaction);

        case "poll":
          return await handlePoll(interaction);

        case "notificationroles":
          return await handleNotificationRoles(interaction);

        case "announce":
          return await handleAnnounce(interaction);

        case "health":
          return await handleHealth(interaction);

        default:
          // No help command or other command handlers.
          return privateReply(interaction, {
            content: "This command is not available.",
          });
      }
    }

    if (interaction.isButton()) {
      const pollMatch = interaction.customId.match(
        /^ga_poll:(.+):([01])$/
      );

      if (pollMatch) {
        return await handlePollButton(
          interaction,
          pollMatch[1],
          Number(pollMatch[2])
        );
      }

      const roleMatch = interaction.customId.match(
        /^ga_role:(\d+)$/
      );

      if (roleMatch) {
        return await handleRoleButton(
          interaction,
          roleMatch[1]
        );
      }
    }
  } catch (error) {
    console.error("Interaction error:", error);

    if (interaction.isRepliable()) {
      try {
        await privateReply(interaction, {
          embeds: [
            makeEmbed(
              "Something went wrong",
              "The request could not be completed. Please try again later."
            ),
          ],
        });
      } catch (replyError) {
        console.error(
          "Could not send the error response:",
          replyError
        );
      }
    }
  }
});

// ============================================================
// LOGIN AND STARTUP
// ============================================================

client.once("ready", () => {
  console.log(`Garden Adventures bot is online as ${client.user.tag}.`);
  console.log("Configured slash commands: embed, publishupdate, poll, notificationroles, announce, health.");
  console.log("Embed colours and emoji characters are not used by the bot.");
});

async function start() {
  try {
    await registerCommands();
    await client.login(process.env.DISCORD_TOKEN);
  } catch (error) {
    console.error("Bot startup failed:", error);
    process.exitCode = 1;
  }
}

process.on("unhandledRejection", error => {
  console.error("Unhandled promise rejection:", error);
});

start();
