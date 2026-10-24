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
  ChannelSelectMenuBuilder,
  ChannelType,
} = require("discord.js");

// ============================================================
// GARDEN ADVENTURES BOT
// ============================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
  ],
});

const GREEN = 0x2e8b57;
const RED = 0xe74c3c;
const ORANGE = 0xf39c12;
const MAX_REASON = 900;

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "garden-data.json");

if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID) {
  console.error("Missing DISCORD_TOKEN or CLIENT_ID in .env");
  process.exit(1);
}

// ============================================================
// DATA STORAGE
// ============================================================

let db = {
  warnings: {},
  cases: [],
  nextCaseId: 1,
  notificationPanels: {},
  maintenance: {},
};

function loadData() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });

    if (!fs.existsSync(DATA_FILE)) {
      saveData();
      return;
    }

    const saved = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

    // Preserve unrelated legacy data rather than deleting it.
    db = {
      ...saved,
      warnings: saved.warnings || {},
      cases: Array.isArray(saved.cases) ? saved.cases : [],
      nextCaseId: Number(saved.nextCaseId) || 1,
      notificationPanels: saved.notificationPanels || {},
      maintenance: saved.maintenance || {},
    };
  } catch (error) {
    console.error("Could not load data:", error);
  }
}

function saveData() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });

    const temporaryFile = DATA_FILE + ".tmp";
    fs.writeFileSync(temporaryFile, JSON.stringify(db, null, 2));
    fs.renameSync(temporaryFile, DATA_FILE);
  } catch (error) {
    console.error("Could not save data:", error);
  }
}

loadData();

// ============================================================
// GENERAL HELPERS
// ============================================================

function privateReply(interaction, options) {
  const payload =
    typeof options === "string"
      ? { content: options }
      : { ...options };

  payload.flags = (payload.flags || 0) | MessageFlags.Ephemeral;

  if (interaction.deferred || interaction.replied) {
    return interaction.followUp(payload);
  }

  return interaction.reply(payload);
}

function makeEmbed(title, description, color = GREEN) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description || "No details provided.")
    .setTimestamp();
}

function truncate(value, limit = 1024) {
  const text = String(value ?? "");
  return text.length > limit
    ? text.slice(0, limit - 3) + "..."
    : text;
}

function safeReason(reason) {
  return truncate(reason || "No reason provided.", MAX_REASON);
}

function isStaff(interaction) {
  return interaction.memberPermissions?.has(
    PermissionFlagsBits.ManageGuild
  ) || interaction.memberPermissions?.has(
    PermissionFlagsBits.Administrator
  );
}

function isAdmin(interaction) {
  return interaction.memberPermissions?.has(
    PermissionFlagsBits.Administrator
  );
}

function staffOnly(interaction) {
  if (isStaff(interaction)) return true;

  privateReply(interaction, {
    embeds: [
      makeEmbed(
        "Permission denied",
        "You need the **Manage Server** permission to use this command.",
        RED
      ),
    ],
  });

  return false;
}

function adminOnly(interaction) {
  if (isAdmin(interaction)) return true;

  privateReply(interaction, {
    embeds: [
      makeEmbed(
        "Permission denied",
        "You need the **Administrator** permission to use this command.",
        RED
      ),
    ],
  });

  return false;
}

function getBotMember(guild) {
  return guild.members.me;
}

function canBot(guild, permissions) {
  const me = getBotMember(guild);
  return Boolean(me?.permissions.has(permissions));
}

function saveCase(guild, type, targetId, moderatorId, reason) {
  const entry = {
    id: db.nextCaseId++,
    guildId: guild.id,
    type,
    targetId,
    moderatorId,
    reason: safeReason(reason),
    timestamp: new Date().toISOString(),
  };

  db.cases.push(entry);
  saveData();

  return entry;
}

async function logModeration(guild, title, description, color = ORANGE) {
  try {
    const channel = guild.systemChannel;
    if (!channel || !channel.isTextBased()) return;

    const me = getBotMember(guild);
    if (
      !me ||
      !channel.permissionsFor(me)?.has(PermissionFlagsBits.SendMessages)
    ) {
      return;
    }

    await channel.send({
      embeds: [makeEmbed(title, description, color)],
    });
  } catch (error) {
    console.error("Moderation logging failed:", error);
  }
}

async function sendSecurityAlert(guild, title, description) {
  try {
    const channel = guild.systemChannel;
    if (!channel || !channel.isTextBased()) return;

    const me = getBotMember(guild);
    if (
      !me ||
      !channel.permissionsFor(me)?.has(PermissionFlagsBits.SendMessages)
    ) {
      return;
    }

    await channel.send({
      embeds: [makeEmbed(title, description, RED)],
    });
  } catch (error) {
    console.error("Security alert failed:", error);
  }
}

function getGuildCases(guildId) {
  return db.cases.filter((entry) => entry.guildId === guildId);
}

function makeCommand(name, description) {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription(description);
}

// ============================================================
// SLASH COMMANDS
// ============================================================

const commands = [];

// Help
commands.push(
  makeCommand("help", "Show the bot's commands")
);

// Server information
commands.push(
  makeCommand("serverinfo", "View server information")
);

// Member count
commands.push(
  makeCommand("membercount", "View the server member count")
);

// Member information
commands.push(
  makeCommand("memberinfo", "View information about a member")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("Member to inspect")
        .setRequired(true)
    )
);

// Profile
commands.push(
  makeCommand("profile", "View a member's Discord profile")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("Member to inspect; defaults to you")
        .setRequired(false)
    )
);

// Warn
commands.push(
  makeCommand("warn", "Warn a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("Member to warn")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for the warning")
        .setRequired(true)
    )
);

// Warnings
commands.push(
  makeCommand("warnings", "View a member's warnings")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("Member to inspect")
        .setRequired(true)
    )
);

// Timeout
commands.push(
  makeCommand("timeout", "Timeout a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("Member to timeout")
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("minutes")
        .setDescription("Timeout duration in minutes")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(40320)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for the timeout")
        .setRequired(false)
    )
);

// Kick
commands.push(
  makeCommand("kick", "Kick a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("Member to kick")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for the kick")
        .setRequired(false)
    )
);

// Ban
commands.push(
  makeCommand("ban", "Ban a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("Member to ban")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for the ban")
        .setRequired(false)
    )
);

// Purge
commands.push(
  makeCommand("purge", "Delete recent messages")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("Number of messages to delete")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    )
);

// Slowmode
commands.push(
  makeCommand("slowmode", "Set a channel's slowmode")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addIntegerOption((option) =>
      option
        .setName("seconds")
        .setDescription("Slowmode duration in seconds; 0 disables it")
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(21600)
    )
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Channel to update; defaults to this channel")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    )
);

// Lock
commands.push(
  makeCommand("lock", "Lock a text channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Channel to lock; defaults to this channel")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    )
);

// Unlock
commands.push(
  makeCommand("unlock", "Unlock a text channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Channel to unlock; defaults to this channel")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    )
);

// Purge user
commands.push(
  makeCommand("purgeuser", "Delete recent messages from one member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("Member whose messages should be deleted")
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("Number of recent messages to inspect")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    )
);

// Case
commands.push(
  makeCommand("case", "View a moderation case")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addIntegerOption((option) =>
      option
        .setName("id")
        .setDescription("Case ID")
        .setRequired(true)
        .setMinValue(1)
    )
);

// Announcement
commands.push(
  makeCommand("announce", "Publish an announcement")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Channel where the announcement will be published")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("title")
        .setDescription("Announcement title")
        .setRequired(true)
        .setMaxLength(256)
    )
    .addStringOption((option) =>
      option
        .setName("message")
        .setDescription("Announcement message")
        .setRequired(true)
        .setMaxLength(4000)
    )
);

// Publish update
commands.push(
  makeCommand("publishupdate", "Publish a Garden Adventures game update")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Channel where the update will be published")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("version")
        .setDescription("Update version, for example 1.2.0")
        .setRequired(true)
        .setMaxLength(50)
    )
    .addStringOption((option) =>
      option
        .setName("title")
        .setDescription("Update title")
        .setRequired(true)
        .setMaxLength(256)
    )
    .addStringOption((option) =>
      option
        .setName("details")
        .setDescription("What changed in this update?")
        .setRequired(true)
        .setMaxLength(4000)
    )
);

// Poll
commands.push(
  makeCommand("poll", "Publish a poll with two choices")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Channel where the poll will be published")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("question")
        .setDescription("Poll question")
        .setRequired(true)
        .setMaxLength(256)
    )
    .addStringOption((option) =>
      option
        .setName("option1")
        .setDescription("First choice")
        .setRequired(true)
        .setMaxLength(100)
    )
    .addStringOption((option) =>
      option
        .setName("option2")
        .setDescription("Second choice")
        .setRequired(true)
        .setMaxLength(100)
    )
);

// Embed
commands.push(
  makeCommand("embed", "Publish a custom embed")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Channel where the embed will be published")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("title")
        .setDescription("Embed title")
        .setRequired(true)
        .setMaxLength(256)
    )
    .addStringOption((option) =>
      option
        .setName("description")
        .setDescription("Embed description")
        .setRequired(true)
        .setMaxLength(4000)
    )
);

// Notification roles
commands.push(
  makeCommand("notificationroles", "Create a notification role panel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Channel where the role panel will be published")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
);

// Health
commands.push(
  makeCommand("health", "Check the bot's health")
);

// Maintenance
commands.push(
  makeCommand("maintenance", "Enable or disable maintenance mode")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addBooleanOption((option) =>
      option
        .setName("enabled")
        .setDescription("Whether maintenance mode should be enabled")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("message")
        .setDescription("Optional maintenance message")
        .setRequired(false)
        .setMaxLength(500)
    )
);

// ============================================================
// REGISTER SLASH COMMANDS
// ============================================================

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(
    process.env.DISCORD_TOKEN
  );

  const body = commands.map((command) => command.toJSON());

  try {
    if (process.env.GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(
          process.env.CLIENT_ID,
          process.env.GUILD_ID
        ),
        { body }
      );

      console.log("Guild slash commands registered.");
    } else {
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body }
      );

      console.log("Global slash commands registered.");
    }
  } catch (error) {
    console.error("Could not register slash commands:", error);
  }
}

// ============================================================
// HELP COMMAND
// ============================================================

function helpEmbed() {
  return new EmbedBuilder()
    .setColor(GREEN)
    .setTitle("🌿 Garden Adventures — Bot Commands")
    .setDescription("Commands are grouped by their purpose.")
    .addFields(
      {
        name: "🌱 General",
        value: [
          "`/help` — View this help menu",
          "`/serverinfo` — Server information",
          "`/membercount` — Member count",
          "`/memberinfo` — Member details",
          "`/profile` — Discord profile information",
          "`/health` — Bot health status",
        ].join("\n"),
      },
      {
        name: "🛡️ Moderation",
        value: [
          "`/warn` — Warn a member",
          "`/warnings` — View warnings",
          "`/timeout` — Timeout a member",
          "`/kick` — Kick a member",
          "`/ban` — Ban a member",
          "`/purge` — Delete recent messages",
          "`/purgeuser` — Delete a member's recent messages",
          "`/slowmode` — Configure slowmode",
          "`/lock` — Lock a channel",
          "`/unlock` — Unlock a channel",
          "`/case` — View a moderation case",
        ].join("\n"),
      },
      {
        name: "📢 Server publishing",
        value: [
          "`/announce` — Publish an announcement",
          "`/publishupdate` — Publish a game update",
          "`/poll` — Publish a two-option poll",
          "`/embed` — Publish a custom embed",
          "`/notificationroles` — Create reaction notification roles",
        ].join("\n"),
      },
      {
        name: "⚙️ Administration",
        value: [
          "`/maintenance` — Manage maintenance mode",
        ].join("\n"),
      }
    )
    .setFooter({ text: "Garden Adventures Utility Bot" })
    .setTimestamp();
}

// ============================================================
// ANNOUNCEMENT AND UPDATE PUBLISHING
// ============================================================

async function publishAnnouncement(interaction) {
  if (!staffOnly(interaction)) return;

  const channel = interaction.options.getChannel("channel");
  const title = interaction.options.getString("title");
  const message = interaction.options.getString("message");

  const me = getBotMember(interaction.guild);

  if (
    !me ||
    !channel.permissionsFor(me)?.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
    ])
  ) {
    return privateReply(interaction, {
      embeds: [
        makeEmbed(
          "Cannot publish",
          "I need permission to view the selected channel, send messages, and embed links.",
          RED
        ),
      ],
    });
  }

  const embed = new EmbedBuilder()
    .setColor(GREEN)
    .setTitle(`📢 ${title}`)
    .setDescription(message)
    .setFooter({ text: "Garden Adventures" })
    .setTimestamp();

  try {
    const sent = await channel.send({ embeds: [embed] });

    return privateReply(interaction, {
      embeds: [
        makeEmbed(
          "Announcement published",
          `Your announcement was published in ${channel}.\nMessage ID: \`${sent.id}\``
        ),
      ],
    });
  } catch (error) {
    console.error("Announcement publishing failed:", error);

    return privateReply(interaction, {
      embeds: [
        makeEmbed(
          "Publishing failed",
          "I could not publish the announcement. Check the channel permissions.",
          RED
        ),
      ],
    });
  }
}

async function publishUpdate(interaction) {
  if (!staffOnly(interaction)) return;

  const channel = interaction.options.getChannel("channel");
  const version = interaction.options.getString("version");
  const title = interaction.options.getString("title");
  const details = interaction.options.getString("details");

  const me = getBotMember(interaction.guild);

  if (
    !me ||
    !channel.permissionsFor(me)?.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
    ])
  ) {
    return privateReply(interaction, {
      embeds: [
        makeEmbed(
          "Cannot publish update",
          "I need permission to view the selected channel, send messages, and embed links.",
          RED
        ),
      ],
    });
  }

  const embed = new EmbedBuilder()
    .setColor(GREEN)
    .setTitle(`🌿 ${title}`)
    .setDescription(details)
    .addFields({
      name: "Update version",
      value: `\`${version}\``,
      inline: true,
    })
    .addFields({
      name: "Game",
      value: "Garden Adventures",
      inline: true,
    })
    .setFooter({ text: "Garden Adventures • Game Update" })
    .setTimestamp();

  try {
    const sent = await channel.send({ embeds: [embed] });

    return privateReply(interaction, {
      embeds: [
        makeEmbed(
          "Update published successfully",
          `Your game update was published in ${channel}.\nVersion: \`${version}\`\nMessage ID: \`${sent.id}\``
        ),
      ],
    });
  } catch (error) {
    console.error("Update publishing failed:", error);

    return privateReply(interaction, {
      embeds: [
        makeEmbed(
          "Publishing failed",
          "I could not publish the update. Check the channel permissions.",
          RED
        ),
      ],
    });
  }
}

// ============================================================
// NOTIFICATION ROLES
// ============================================================

const ROLE_CHOICES = [
  { emoji: "🎮", name: "Game Updates" },
  { emoji: "📅", name: "Events" },
  { emoji: "🎁", name: "Giveaways" },
  { emoji: "📢", name: "Announcements" },
  { emoji: "✨", name: "New Content" },
  { emoji: "👀", name: "Sneak Peeks" },
  { emoji: "🌿", name: "Community News" },
];

async function createNotificationPanel(interaction) {
  if (!staffOnly(interaction)) return;

  const channel = interaction.options.getChannel("channel");
  const guild = interaction.guild;
  const me = getBotMember(guild);

  if (!me) {
    return privateReply(interaction, "I could not access my server member information.");
  }

  if (
    !channel.permissionsFor(me)?.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.AddReactions,
      PermissionFlagsBits.ManageRoles,
    ])
  ) {
    return privateReply(interaction, {
      embeds: [
        makeEmbed(
          "Missing permissions",
          "I need View Channel, Send Messages, Embed Links, Add Reactions, and Manage Roles permissions.",
          RED
        ),
      ],
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const roleMap = {};

  try {
    for (const choice of ROLE_CHOICES) {
      let role = guild.roles.cache.find(
        (item) => item.name === choice.name
      );

      if (!role) {
        role = await guild.roles.create({
          name: choice.name,
          color: GREEN,
          reason: "Creating Garden Adventures notification roles",
        });
      }

      if (role.position >= me.roles.highest.position) {
        return interaction.editReply({
          embeds: [
            makeEmbed(
              "Role hierarchy issue",
              `I cannot manage the **${role.name}** role because it is at or above my highest role. Move my bot role above the notification roles and try again.`,
              RED
            ),
          ],
        });
      }

      roleMap[choice.emoji] = {
        roleId: role.id,
        name: choice.name,
      };
    }

    const description = ROLE_CHOICES.map(
      (choice) =>
        `${choice.emoji} — **${choice.name}**`
    ).join("\n");

    const embed = new EmbedBuilder()
      .setColor(GREEN)
      .setTitle("🔔 Garden Adventures Notifications")
      .setDescription(
        "React below to choose which notifications you want to receive.\n\n" +
        description +
        "\n\nRemove your reaction to remove that notification role."
      )
      .setFooter({ text: "You can select more than one role." })
      .setTimestamp();

    const panelMessage = await channel.send({ embeds: [embed] });

    for (const choice of ROLE_CHOICES) {
      await panelMessage.react(choice.emoji);
    }

    db.notificationPanels[guild.id] = {
      channelId: channel.id,
      messageId: panelMessage.id,
      roles: roleMap,
    };

    saveData();

    return interaction.editReply({
      embeds: [
        makeEmbed(
          "Notification panel created",
          `The notification role panel has been published in ${channel}.\n\nThe roles have been created if they did not already exist. Make sure the bot's highest role stays above them.`
        ),
      ],
    });
  } catch (error) {
    console.error("Notification panel creation failed:", error);

    return interaction.editReply({
      embeds: [
        makeEmbed(
          "Could not create panel",
          "Something went wrong while creating the notification roles or publishing the panel. Check the bot's role hierarchy and permissions.",
          RED
        ),
      ],
    });
  }
}

async function handleNotificationReaction(reaction, user, addRole) {
  try {
    if (user.bot) return;

    if (reaction.partial) {
      await reaction.fetch();
    }

    const message = reaction.message;
    if (!message.guild) return;

    const panel = db.notificationPanels[message.guild.id];
    if (!panel) return;

    if (message.id !== panel.messageId) return;

    const emoji = reaction.emoji.name;
    const entry = panel.roles?.[emoji];
    if (!entry) return;

    const member = await message.guild.members.fetch(user.id);
    const role = await message.guild.roles.fetch(entry.roleId);

    if (!role || !member) return;

    const me = getBotMember(message.guild);
    if (!me || !me.permissions.has(PermissionFlagsBits.ManageRoles)) {
      console.error("Cannot manage notification roles: missing Manage Roles.");
      return;
    }

    if (role.position >= me.roles.highest.position) {
      console.error(`Cannot manage role ${role.name}: role hierarchy issue.`);
      return;
    }

    if (addRole) {
      await member.roles.add(role, "Selected a notification role");
    } else {
      await member.roles.remove(role, "Removed a notification role");
    }
  } catch (error) {
    console.error("Notification reaction handling failed:", error);
  }
}

client.on("messageReactionAdd", async (reaction, user) => {
  await handleNotificationReaction(reaction, user, true);
});

client.on("messageReactionRemove", async (reaction, user) => {
  await handleNotificationReaction(reaction, user, false);
});

// ============================================================
// ANTI-SPAM AND INVITE PROTECTION
// ============================================================

const recentMessages = new Map();
const spamCooldowns = new Map();

const SPAM_WINDOW_MS = 7000;
const SPAM_MESSAGE_LIMIT = 6;
const SPAM_TIMEOUT_MINUTES = 2;

function containsDiscordInvite(content) {
  return /(?:discord\.gg\/|discord(?:app)?\.com\/invite\/|discord\.me\/)/i.test(
    content
  );
}

function hasStaffExemption(member) {
  if (!member) return false;

  return (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild) ||
    member.permissions.has(PermissionFlagsBits.ManageMessages)
  );
}

client.on("messageCreate", async (message) => {
  if (!message.guild || message.author.bot) return;

  const guild = message.guild;
  const member = message.member;

  if (!member || hasStaffExemption(member)) return;

  const maintenance = db.maintenance[guild.id];

  // Invite protection
  if (containsDiscordInvite(message.content)) {
    try {
      if (
        canBot(guild, [
          PermissionFlagsBits.ManageMessages,
        ])
      ) {
        await message.delete().catch(() => {});
      }

      await message.channel.send({
        content: `${message.author}, Discord invite links are not allowed here.`,
      }).then((sent) => {
        setTimeout(() => sent.delete().catch(() => {}), 5000);
      }).catch(() => {});

      await sendSecurityAlert(
        guild,
        "Discord invite blocked",
        `A Discord invite link was detected from ${message.author} in ${message.channel}.`
      );
    } catch (error) {
      console.error("Invite protection failed:", error);
    }

    return;
  }

  // Anti-spam
  const key = `${guild.id}:${message.author.id}`;
  const now = Date.now();

  const recent = (recentMessages.get(key) || []).filter(
    (timestamp) => now - timestamp < SPAM_WINDOW_MS
  );

  recent.push(now);
  recentMessages.set(key, recent);

  if (recent.length >= SPAM_MESSAGE_LIMIT) {
    if (spamCooldowns.get(key) && now < spamCooldowns.get(key)) {
      return;
    }

    spamCooldowns.set(key, now + 30000);

    try {
      if (
        canBot(guild, [
          PermissionFlagsBits.ManageMessages,
        ])
      ) {
        await message.channel.bulkDelete(
          Math.min(recent.length, 100),
          true
        ).catch(() => {});
      }

      if (
        canBot(guild, [
          PermissionFlagsBits.ModerateMembers,
        ])
      ) {
        await member.timeout(
          SPAM_TIMEOUT_MINUTES * 60 * 1000,
          "Automatic anti-spam protection"
        ).catch(() => {});
      }

      await sendSecurityAlert(
        guild,
        "Anti-spam triggered",
        `${message.author} sent too many messages in a short period. The bot attempted to remove recent messages and apply a short timeout if permissions allowed.`
      );
    } catch (error) {
      console.error("Anti-spam action failed:", error);
    }

    recentMessages.delete(key);
  }

  // Maintenance mode is informational; it does not automatically block messages.
  if (maintenance?.enabled) {
    // Reserved for future maintenance restrictions.
  }
});

// ============================================================
// RAID PROTECTION
// ============================================================

const recentJoins = new Map();
const RAID_WINDOW_MS = 15000;
const RAID_JOIN_LIMIT = 10;

client.on("guildMemberAdd", async (member) => {
  const guild = member.guild;
  const now = Date.now();

  const joins = (recentJoins.get(guild.id) || []).filter(
    (timestamp) => now - timestamp < RAID_WINDOW_MS
  );

  joins.push(now);
  recentJoins.set(guild.id, joins);

  if (joins.length >= RAID_JOIN_LIMIT) {
    await sendSecurityAlert(
      guild,
      "⚠️ Possible join raid detected",
      `${joins.length} members have joined within approximately ${RAID_WINDOW_MS / 1000} seconds.\n\nPlease ask staff to review the server. The bot does not automatically mass-ban members.`
    );

    // Avoid sending an alert for every single join during the same burst.
    recentJoins.set(guild.id, []);
  }
});

// ============================================================
// INTERACTION HANDLER
// ============================================================

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (!interaction.guild && interaction.commandName !== "help") {
        return privateReply(
          interaction,
          "This command can only be used in a server."
        );
      }

      const command = interaction.commandName;

      // Help
      if (command === "help") {
        return privateReply(interaction, {
          embeds: [helpEmbed()],
        });
      }

      // Server info
      if (command === "serverinfo") {
        const guild = interaction.guild;

        return privateReply(interaction, {
          embeds: [
            new EmbedBuilder()
              .setColor(GREEN)
              .setTitle(`📊 ${guild.name}`)
              .setThumbnail(guild.iconURL({ size: 256 }))
              .addFields(
                {
                  name: "Server ID",
                  value: guild.id,
                  inline: true,
                },
                {
                  name: "Members",
                  value: String(guild.memberCount),
                  inline: true,
                },
                {
                  name: "Text and voice channels",
                  value: String(guild.channels.cache.size),
                  inline: true,
                },
                {
                  name: "Created",
                  value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`,
                  inline: true,
                },
                {
                  name: "Owner",
                  value: `<@${guild.ownerId}>`,
                  inline: true,
                },
                {
                  name: "Boost level",
                  value: String(guild.premiumTier),
                  inline: true,
                }
              )
              .setTimestamp(),
          ],
        });
      }

      // Member count
      if (command === "membercount") {
        const guild = interaction.guild;

        return privateReply(interaction, {
          embeds: [
            makeEmbed(
              "👥 Server Member Count",
              `**Total members:** ${guild.memberCount}\n**Bots:** ${guild.members.cache.filter((m) => m.user.bot).size} currently cached.`
            ),
          ],
        });
      }

      // Member info
      if (command === "memberinfo" || command === "profile") {
        const user =
          interaction.options.getUser("user") || interaction.user;

        let member = null;

        try {
          member = await interaction.guild.members.fetch(user.id);
        } catch {
          // The user may no longer be in the server.
        }

        const embed = new EmbedBuilder()
          .setColor(GREEN)
          .setTitle(command === "profile" ? "👤 Profile" : "ℹ️ Member Information")
          .setThumbnail(user.displayAvatarURL({ size: 256 }))
          .addFields(
            {
              name: "Username",
              value: user.tag,
              inline: true,
            },
            {
              name: "User ID",
              value: user.id,
              inline: true,
            },
            {
              name: "Account created",
              value: `<t:${Math.floor(user.createdTimestamp / 1000)}:D>`,
              inline: true,
            },
            {
              name: "In this server",
              value: member
                ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:D>`
                : "Not currently a member",
              inline: true,
            },
            {
              name: "Bot account",
              value: user.bot ? "Yes" : "No",
              inline: true,
            },
            {
              name: "Roles",
              value: member
                ? truncate(
                    member.roles.cache
                      .filter((role) => role.id !== interaction.guild.id)
                      .map((role) => role.toString())
                      .join(", ") || "No roles",
                    1000
                  )
                : "Unavailable",
            }
          )
          .setTimestamp();

        return privateReply(interaction, { embeds: [embed] });
      }

      // Health
      if (command === "health") {
        const latency = Math.round(client.ws.ping);

        return privateReply(interaction, {
          embeds: [
            new EmbedBuilder()
              .setColor(GREEN)
              .setTitle("💚 Bot Health")
              .addFields(
                {
                  name: "Status",
                  value: "Online",
                  inline: true,
                },
                {
                  name: "WebSocket latency",
                  value: `${latency} ms`,
                  inline: true,
                },
                {
                  name: "Uptime",
                  value: `${Math.floor(client.uptime / 1000)} seconds`,
                  inline: true,
                },
                {
                  name: "Guilds",
                  value: String(client.guilds.cache.size),
                  inline: true,
                }
              )
              .setTimestamp(),
          ],
        });
      }

      // Maintenance
      if (command === "maintenance") {
        if (!adminOnly(interaction)) return;

        const enabled = interaction.options.getBoolean("enabled");
        const message =
          interaction.options.getString("message") ||
          "Garden Adventures is currently undergoing maintenance.";

        db.maintenance[interaction.guild.id] = {
          enabled,
          message,
          updatedBy: interaction.user.id,
          updatedAt: new Date().toISOString(),
        };

        saveData();

        return privateReply(interaction, {
          embeds: [
            makeEmbed(
              enabled ? "🔧 Maintenance enabled" : "✅ Maintenance disabled",
              enabled
                ? `Maintenance mode has been enabled for this server.\n\nMessage: ${message}`
                : "Maintenance mode has been disabled."
            ),
          ],
        });
      }

      // Announcement
      if (command === "announce") {
        return publishAnnouncement(interaction);
      }

      // Publish update
      if (command === "publishupdate") {
        return publishUpdate(interaction);
      }

      // Notification roles
      if (command === "notificationroles") {
        return createNotificationPanel(interaction);
      }

      // Poll
      if (command === "poll") {
        if (!staffOnly(interaction)) return;

        const channel = interaction.options.getChannel("channel");
        const question = interaction.options.getString("question");
        const option1 = interaction.options.getString("option1");
        const option2 = interaction.options.getString("option2");
        const me = getBotMember(interaction.guild);

        if (
          !me ||
          !channel.permissionsFor(me)?.has([
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.AddReactions,
          ])
        ) {
          return privateReply(
            interaction,
            "I need permission to send messages, embed links, and add reactions in that channel."
          );
        }

        try {
          const sent = await channel.send({
            embeds: [
              new EmbedBuilder()
                .setColor(GREEN)
                .setTitle(`📊 ${question}`)
                .setDescription(
                  `🇦 **${option1}**\n\n🇧 **${option2}**`
                )
                .setFooter({ text: "React to vote!" })
                .setTimestamp(),
            ],
          });

          await sent.react("🇦");
          await sent.react("🇧");

          return privateReply(
            interaction,
            `Poll published successfully in ${channel}.`
          );
        } catch (error) {
          console.error("Poll publishing failed:", error);

          return privateReply(
            interaction,
            "I couldn't publish the poll. Please check my permissions."
          );
        }
      }

      // Custom embed
      if (command === "embed") {
        if (!staffOnly(interaction)) return;

        const channel = interaction.options.getChannel("channel");
        const title = interaction.options.getString("title");
        const description = interaction.options.getString("description");
        const me = getBotMember(interaction.guild);

        if (
          !me ||
          !channel.permissionsFor(me)?.has([
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.EmbedLinks,
          ])
        ) {
          return privateReply(
            interaction,
            "I need permission to send messages and embed links in that channel."
          );
        }

        try {
          await channel.send({
            embeds: [
              new EmbedBuilder()
                .setColor(GREEN)
                .setTitle(title)
                .setDescription(description)
                .setFooter({ text: "Garden Adventures" })
                .setTimestamp(),
            ],
          });

          return privateReply(
            interaction,
            `Your embed has been published in ${channel}.`
          );
        } catch (error) {
          console.error("Embed publishing failed:", error);

          return privateReply(
            interaction,
            "I couldn't publish the embed. Please check my permissions."
          );
        }
      }

      // Warn
      if (command === "warn") {
        if (!staffOnly(interaction)) return;

        const user = interaction.options.getUser("user");
        const reason = safeReason(
          interaction.options.getString("reason")
        );

        if (user.id === interaction.user.id) {
          return privateReply(interaction, "You cannot warn yourself.");
        }

        if (user.bot) {
          return privateReply(interaction, "You cannot warn a bot.");
        }

        const key = `${interaction.guild.id}:${user.id}`;

        db.warnings[key] ||= [];

        db.warnings[key].push({
          moderatorId: interaction.user.id,
          reason,
          timestamp: new Date().toISOString(),
        });

        const entry = saveCase(
          interaction.guild,
          "WARN",
          user.id,
          interaction.user.id,
          reason
        );

        saveData();

        await logModeration(
          interaction.guild,
          "⚠️ Member warned",
          `**Member:** ${user.tag} (${user.id})\n**Moderator:** ${interaction.user.tag}\n**Reason:** ${reason}\n**Case:** #${entry.id}`
        );

        return privateReply(interaction, {
          embeds: [
            makeEmbed(
              "Warning recorded",
              `${user} has been warned.\n**Reason:** ${reason}\n**Case:** #${entry.id}`
            ),
          ],
        });
      }

      // Warnings
      if (command === "warnings") {
        if (!staffOnly(interaction)) return;

        const user = interaction.options.getUser("user");
        const key = `${interaction.guild.id}:${user.id}`;
        const warnings = db.warnings[key] || [];

        const description = warnings.length
          ? warnings
              .slice(-10)
              .map(
                (warning, index) =>
                  `**${index + 1}.** ${warning.reason}\n` +
                  `Moderator: <@${warning.moderatorId}> • ` +
                  `<t:${Math.floor(new Date(warning.timestamp).getTime() / 1000)}:R>`
              )
              .join("\n\n")
          : "This member has no recorded warnings.";

        return privateReply(interaction, {
          embeds: [
            makeEmbed(
              `Warnings for ${user.tag}`,
              `**Total warnings:** ${warnings.length}\n\n${description}`
            ),
          ],
        });
      }

      // Timeout
      if (command === "timeout") {
        if (!staffOnly(interaction)) return;

        const user = interaction.options.getUser("user");
        const minutes = interaction.options.getInteger("minutes");
        const reason = safeReason(
          interaction.options.getString("reason")
        );

        const member = await interaction.guild.members
          .fetch(user.id)
          .catch(() => null);

        if (!member) {
          return privateReply(interaction, "That member is not in this server.");
        }

        if (
          user.id === interaction.user.id ||
          user.id === client.user.id
        ) {
          return privateReply(
            interaction,
            "You cannot timeout yourself or the bot."
          );
        }

        if (
          !interaction.memberPermissions.has(
            PermissionFlagsBits.Administrator
          ) &&
          member.roles.highest.position >=
            interaction.member.roles.highest.position
        ) {
          return privateReply(
            interaction,
            "You cannot timeout a member with an equal or higher role."
          );
        }

        if (!member.moderatable) {
          return privateReply(
            interaction,
            "I cannot timeout this member. Check my permissions and role hierarchy."
          );
        }

        await member.timeout(minutes * 60 * 1000, reason);

        const entry = saveCase(
          interaction.guild,
          "TIMEOUT",
          user.id,
          interaction.user.id,
          `${reason} (${minutes} minutes)`
        );

        await logModeration(
          interaction.guild,
          "⏱️ Member timed out",
          `**Member:** ${user.tag}\n**Duration:** ${minutes} minutes\n**Moderator:** ${interaction.user.tag}\n**Reason:** ${reason}\n**Case:** #${entry.id}`
        );

        return privateReply(
          interaction,
          `${user} has been timed out for ${minutes} minutes. Case #${entry.id}.`
        );
      }

      // Kick
      if (command === "kick") {
        if (!staffOnly(interaction)) return;

        const user = interaction.options.getUser("user");
        const reason = safeReason(
          interaction.options.getString("reason")
        );

        const member = await interaction.guild.members
          .fetch(user.id)
          .catch(() => null);

        if (!member) {
          return privateReply(interaction, "That member is not in this server.");
        }

        if (
          user.id === interaction.user.id ||
          user.id === client.user.id
        ) {
          return privateReply(
            interaction,
            "You cannot kick yourself or the bot."
          );
        }

        if (
          !interaction.memberPermissions.has(
            PermissionFlagsBits.Administrator
          ) &&
          member.roles.highest.position >=
            interaction.member.roles.highest.position
        ) {
          return privateReply(
            interaction,
            "You cannot kick a member with an equal or higher role."
          );
        }

        if (!member.kickable) {
          return privateReply(
            interaction,
            "I cannot kick this member. Check my permissions and role hierarchy."
          );
        }

        await member.kick(reason);

        const entry = saveCase(
          interaction.guild,
          "KICK",
          user.id,
          interaction.user.id,
          reason
        );

        await logModeration(
          interaction.guild,
          "👢 Member kicked",
          `**Member:** ${user.tag}\n**Moderator:** ${interaction.user.tag}\n**Reason:** ${reason}\n**Case:** #${entry.id}`
        );

        return privateReply(
          interaction,
          `${user.tag} has been kicked. Case #${entry.id}.`
        );
      }

      // Ban
      if (command === "ban") {
        if (!staffOnly(interaction)) return;

        const user = interaction.options.getUser("user");
        const reason = safeReason(
          interaction.options.getString("reason")
        );

        if (
          user.id === interaction.user.id ||
          user.id === client.user.id
        ) {
          return privateReply(
            interaction,
            "You cannot ban yourself or the bot."
          );
        }

        const member = await interaction.guild.members
          .fetch(user.id)
          .catch(() => null);

        if (member) {
          if (
            !interaction.memberPermissions.has(
              PermissionFlagsBits.Administrator
            ) &&
            member.roles.highest.position >=
              interaction.member.roles.highest.position
          ) {
            return privateReply(
              interaction,
              "You cannot ban a member with an equal or higher role."
            );
          }

          if (!member.bannable) {
            return privateReply(
              interaction,
              "I cannot ban this member. Check my permissions and role hierarchy."
            );
          }
        }

        await interaction.guild.members.ban(user.id, {
          reason,
        });

        const entry = saveCase(
          interaction.guild,
          "BAN",
          user.id,
          interaction.user.id,
          reason
        );

        await logModeration(
          interaction.guild,
          "🔨 Member banned",
          `**Member:** ${user.tag} (${user.id})\n**Moderator:** ${interaction.user.tag}\n**Reason:** ${reason}\n**Case:** #${entry.id}`,
          RED
        );

        return privateReply(
          interaction,
          `${user.tag} has been banned. Case #${entry.id}.`
        );
      }

      // Purge
      if (command === "purge") {
        if (!staffOnly(interaction)) return;

        const amount = interaction.options.getInteger("amount");
        const channel = interaction.channel;

        if (!channel?.isTextBased() || !channel.messages) {
          return privateReply(
            interaction,
            "This command can only be used in a text channel."
          );
        }

        if (!canBot(interaction.guild, [
          PermissionFlagsBits.ManageMessages,
        ])) {
          return privateReply(
            interaction,
            "I need the Manage Messages permission."
          );
        }

        const deleted = await channel.bulkDelete(amount, true);

        return privateReply(
          interaction,
          `Deleted ${deleted.size} recent messages. Messages older than 14 days cannot be bulk-deleted.`
        );
      }

      // Slowmode
      if (command === "slowmode") {
        if (!staffOnly(interaction)) return;

        const seconds = interaction.options.getInteger("seconds");
        const channel =
          interaction.options.getChannel("channel") ||
          interaction.channel;

        if (
          !channel ||
          !channel.isTextBased() ||
          typeof channel.setRateLimitPerUser !== "function"
        ) {
          return privateReply(
            interaction,
            "Choose a supported text channel."
          );
        }

        if (!canBot(interaction.guild, [
          PermissionFlagsBits.ManageChannels,
        ])) {
          return privateReply(
            interaction,
            "I need the Manage Channels permission."
          );
        }

        await channel.setRateLimitPerUser(
          seconds,
          `Slowmode updated by ${interaction.user.tag}`
        );

        return privateReply(
          interaction,
          seconds === 0
            ? `Slowmode has been disabled in ${channel}.`
            : `Slowmode in ${channel} is now ${seconds} seconds.`
        );
      }

      // Lock
      if (command === "lock" || command === "unlock") {
        if (!staffOnly(interaction)) return;

        const channel =
          interaction.options.getChannel("channel") ||
          interaction.channel;

        if (
          !channel ||
          !channel.isTextBased() ||
          !channel.permissionOverwrites
        ) {
          return privateReply(
            interaction,
            "Choose a supported text channel."
          );
        }

        if (!canBot(interaction.guild, [
          PermissionFlagsBits.ManageChannels,
        ])) {
          return privateReply(
            interaction,
            "I need the Manage Channels permission."
          );
        }

        const everyoneRole = interaction.guild.roles.everyone;

        if (command === "lock") {
          await channel.permissionOverwrites.edit(everyoneRole, {
            SendMessages: false,
            AddReactions: false,
            SendMessagesInThreads: false,
          });

          return privateReply(
            interaction,
            `🔒 ${channel} has been locked for @everyone.`
          );
        }

        await channel.permissionOverwrites.edit(everyoneRole, {
          SendMessages: null,
          AddReactions: null,
          SendMessagesInThreads: null,
        });

        return privateReply(
          interaction,
          `🔓 ${channel} has been unlocked. Previous explicit permission overrides for @everyone may need to be restored manually if they were customised.`
        );
      }

      // Purge user
      if (command === "purgeuser") {
        if (!staffOnly(interaction)) return;

        const user = interaction.options.getUser("user");
        const amount = interaction.options.getInteger("amount");
        const channel = interaction.channel;

        if (!channel?.isTextBased() || !channel.messages) {
          return privateReply(
            interaction,
            "This command can only be used in a text channel."
          );
        }

        if (!canBot(interaction.guild, [
          PermissionFlagsBits.ManageMessages,
        ])) {
          return privateReply(
            interaction,
            "I need the Manage Messages permission."
          );
        }

        await interaction.deferReply({
          flags: MessageFlags.Ephemeral,
        });

        const fetched = await channel.messages.fetch({
          limit: amount,
        });

        const matching = fetched.filter(
          (message) =>
            message.author.id === user.id &&
            Date.now() - message.createdTimestamp <
              14 * 24 * 60 * 60 * 1000
        );

        if (!matching.size) {
          return interaction.editReply(
            `No eligible recent messages from ${user} were found in the latest ${amount} messages.`
          );
        }

        const deleted = await channel.bulkDelete(matching, true);

        return interaction.editReply(
          `Deleted ${deleted.size} recent messages from ${user}. Messages older than 14 days cannot be bulk-deleted.`
        );
      }

      // Case lookup
      if (command === "case") {
        if (!staffOnly(interaction)) return;

        const id = interaction.options.getInteger("id");

        const entry = db.cases.find(
          (item) =>
            item.id === id &&
            item.guildId === interaction.guild.id
        );

        if (!entry) {
          return privateReply(
            interaction,
            `No case with ID #${id} was found in this server.`
          );
        }

        return privateReply(interaction, {
          embeds: [
            new EmbedBuilder()
              .setColor(GREEN)
              .setTitle(`📁 Moderation Case #${entry.id}`)
              .addFields(
                {
                  name: "Type",
                  value: entry.type,
                  inline: true,
                },
                {
                  name: "Member ID",
                  value: entry.targetId,
                  inline: true,
                },
                {
                  name: "Moderator",
                  value: `<@${entry.moderatorId}>`,
                  inline: true,
                },
                {
                  name: "Reason",
                  value: truncate(entry.reason, 1024),
                },
                {
                  name: "Date",
                  value: `<t:${Math.floor(new Date(entry.timestamp).getTime() / 1000)}:F>`,
                }
              )
              .setTimestamp(),
          ],
        });
      }

      return privateReply(
        interaction,
        "That command is not recognised. Use `/help` to see the available commands."
      );
    }
  } catch (error) {
    console.error("Interaction error:", error);

    if (interaction.isRepliable()) {
      try {
        await privateReply(interaction, {
          embeds: [
            makeEmbed(
              "Something went wrong",
              "The command could not be completed. Check the bot's permissions and try again.",
              RED
            ),
          ],
        });
      } catch {
        // The interaction may have expired or already been acknowledged.
      }
    }
  }
});

// ============================================================
// READY EVENT
// ============================================================

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log(`Serving ${client.guilds.cache.size} server(s).`);

  await registerCommands();
});

// ============================================================
// SAFE ERROR HANDLING
// ============================================================

process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
});

// ============================================================
// START BOT
// ============================================================

client.login(process.env.DISCORD_TOKEN);
