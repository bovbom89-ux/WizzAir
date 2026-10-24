
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
  ChannelType,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID || "";

const GREEN = 0x2E8B57;
const MAX_REASON = 900;

if (!TOKEN || !CLIENT_ID) {
  console.error("Missing DISCORD_TOKEN or CLIENT_ID in .env");
  process.exit(1);
}

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

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "garden-data.json");

fs.mkdirSync(DATA_DIR, { recursive: true });

const DEFAULT_DATA = {
  warnings: {},
  cases: {},
  nextCaseId: 1,
  notificationPanels: {},
  maintenance: {},
};

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(
        DATA_FILE,
        JSON.stringify(DEFAULT_DATA, null, 2)
      );
    }

    const old = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

    return {
      ...structuredClone(DEFAULT_DATA),
      warnings: old.warnings || {},
      cases: old.cases || {},
      nextCaseId: Number(old.nextCaseId) || 1,
      notificationPanels: old.notificationPanels || {},
      maintenance: old.maintenance || {},
    };
  } catch (error) {
    console.error("Could not load data:", error);
    return structuredClone(DEFAULT_DATA);
  }
}

let db = loadData();

function saveData() {
  const temporary = `${DATA_FILE}.tmp`;

  fs.writeFileSync(
    temporary,
    JSON.stringify(db, null, 2)
  );

  fs.renameSync(temporary, DATA_FILE);
}

function makeEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(GREEN)
    .setTitle(String(title).slice(0, 256))
    .setDescription(String(description).slice(0, 4000))
    .setTimestamp();
}

async function privateReply(interaction, payload) {
  const options =
    typeof payload === "string"
      ? { content: payload }
      : { ...payload };

  options.flags = MessageFlags.Ephemeral;
  delete options.ephemeral;

  if (interaction.deferred) {
    return interaction.editReply(options);
  }

  if (interaction.replied) {
    return interaction.followUp(options);
  }

  return interaction.reply(options);
}

async function deny(interaction, message) {
  return privateReply(interaction, message);
}

function hasPermission(interaction, permission) {
  return Boolean(
    interaction.memberPermissions?.has(permission)
  );
}

function isStaff(interaction) {
  return Boolean(
    interaction.memberPermissions?.has(
      PermissionFlagsBits.ModerateMembers
    ) ||
    interaction.memberPermissions?.has(
      PermissionFlagsBits.ManageGuild
    ) ||
    interaction.memberPermissions?.has(
      PermissionFlagsBits.Administrator
    )
  );
}

function isAdmin(interaction) {
  return Boolean(
    interaction.memberPermissions?.has(
      PermissionFlagsBits.Administrator
    )
  );
}

function recordCase(
  guildId,
  targetId,
  moderatorId,
  action,
  reason,
  extra = {}
) {
  const id = String(db.nextCaseId++);

  const entry = {
    id,
    guildId,
    targetId,
    moderatorId,
    action,
    reason: String(reason || "No reason provided")
      .slice(0, MAX_REASON),
    timestamp: Date.now(),
    ...extra,
  };

  db.cases[id] = entry;
  saveData();

  return entry;
}

async function logModeration(guild, entry) {
  const channel = guild.systemChannel;

  if (
    !channel?.isTextBased() ||
    !channel.permissionsFor(guild.members.me)
      ?.has(PermissionFlagsBits.SendMessages)
  ) {
    return;
  }

  await channel.send({
    embeds: [
      makeEmbed(
        `Moderation Case #${entry.id}`,
        `**Action:** ${entry.action}\n` +
        `**Member:** <@${entry.targetId}>\n` +
        `**Moderator:** <@${entry.moderatorId}>\n` +
        `**Reason:** ${entry.reason}`
      ),
    ],
  }).catch(() => null);
}

function canManageRoles(member) {
  return Boolean(
    member?.permissions?.has(
      PermissionFlagsBits.ManageRoles
    ) ||
    member?.permissions?.has(
      PermissionFlagsBits.ManageGuild
    ) ||
    member?.permissions?.has(
      PermissionFlagsBits.Administrator
    )
  );
}

const commands = [
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("View Garden Adventures bot commands"),

  new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("View server information"),

  new SlashCommandBuilder()
    .setName("membercount")
    .setDescription("View the server member count"),

  new SlashCommandBuilder()
    .setName("memberinfo")
    .setDescription("View information about a member")
    .addUserOption(o =>
      o.setName("member")
        .setDescription("Member to inspect")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("profile")
    .setDescription("View a member's server profile")
    .addUserOption(o =>
      o.setName("member")
        .setDescription("Member to inspect")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a member")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ModerateMembers
    )
    .addUserOption(o =>
      o.setName("member")
        .setDescription("Member to warn")
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason")
        .setDescription("Reason")
        .setMaxLength(900)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("View a member's warnings")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ModerateMembers
    )
    .addUserOption(o =>
      o.setName("member")
        .setDescription("Member to inspect")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout a member")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ModerateMembers
    )
    .addUserOption(o =>
      o.setName("member")
        .setDescription("Member to timeout")
        .setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("minutes")
        .setDescription("Duration in minutes")
        .setMinValue(1)
        .setMaxValue(40320)
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason")
        .setDescription("Reason")
        .setMaxLength(900)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a member")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.KickMembers
    )
    .addUserOption(o =>
      o.setName("member")
        .setDescription("Member to kick")
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason")
        .setDescription("Reason")
        .setMaxLength(900)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a member")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.BanMembers
    )
    .addUserOption(o =>
      o.setName("member")
        .setDescription("Member to ban")
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason")
        .setDescription("Reason")
        .setMaxLength(900)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Delete recent messages")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageMessages
    )
    .addIntegerOption(o =>
      o.setName("amount")
        .setDescription("Number of messages to delete")
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Set a channel's slowmode")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageChannels
    )
    .addIntegerOption(o =>
      o.setName("seconds")
        .setDescription("Seconds; 0 disables slowmode")
        .setMinValue(0)
        .setMaxValue(21600)
        .setRequired(true)
    )
    .addChannelOption(o =>
      o.setName("channel")
        .setDescription("Channel; defaults to this channel")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Lock a text channel")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageChannels
    )
    .addChannelOption(o =>
      o.setName("channel")
        .setDescription("Channel; defaults to this channel")
        .addChannelTypes(
          ChannelType.GuildText,
          ChannelType.GuildAnnouncement
        )
        .setRequired(false)
    )
    .addStringOption(o =>
      o.setName("reason")
        .setDescription("Reason for locking")
        .setMaxLength(500)
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Unlock a text channel")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageChannels
    )
    .addChannelOption(o =>
      o.setName("channel")
        .setDescription("Channel; defaults to this channel")
        .addChannelTypes(
          ChannelType.GuildText,
          ChannelType.GuildAnnouncement
        )
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("purgeuser")
    .setDescription("Delete a member's recent messages")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageMessages
    )
    .addUserOption(o =>
      o.setName("member")
        .setDescription("Member whose messages to delete")
        .setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("amount")
        .setDescription("Messages to scan")
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("case")
    .setDescription("View a moderation case")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ModerateMembers
    )
    .addIntegerOption(o =>
      o.setName("id")
        .setDescription("Case ID")
        .setMinValue(1)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Publish a public announcement")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addChannelOption(o =>
      o.setName("channel")
        .setDescription("Channel to publish in")
        .addChannelTypes(
          ChannelType.GuildText,
          ChannelType.GuildAnnouncement
        )
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("title")
        .setDescription("Announcement title")
        .setMaxLength(256)
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("message")
        .setDescription("Announcement text")
        .setMaxLength(4000)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Publish a public reaction poll")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addChannelOption(o =>
      o.setName("channel")
        .setDescription("Channel to publish in")
        .addChannelTypes(
          ChannelType.GuildText,
          ChannelType.GuildAnnouncement
        )
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("question")
        .setDescription("Poll question")
        .setMaxLength(200)
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("options")
        .setDescription("2–10 options separated by |")
        .setMaxLength(800)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("embed")
    .setDescription("Publish a custom public embed")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addChannelOption(o =>
      o.setName("channel")
        .setDescription("Channel to publish in")
        .addChannelTypes(
          ChannelType.GuildText,
          ChannelType.GuildAnnouncement
        )
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("title")
        .setDescription("Embed title")
        .setMaxLength(256)
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("description")
        .setDescription("Embed description")
        .setMaxLength(4000)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("notificationroles")
    .setDescription("Create a reaction-role panel (staff only)")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageRoles
    )
    .addChannelOption(o =>
      o.setName("channel")
        .setDescription("Channel for the public role panel")
        .addChannelTypes(
          ChannelType.GuildText,
          ChannelType.GuildAnnouncement
        )
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("health")
    .setDescription("Check bot health and storage status"),

  new SlashCommandBuilder()
    .setName("maintenance")
    .setDescription("Enable or disable maintenance mode")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator
    )
    .addBooleanOption(o =>
      o.setName("enabled")
        .setDescription("Enable maintenance mode?")
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason")
        .setDescription("Optional maintenance reason")
        .setMaxLength(500)
        .setRequired(false)
    ),
].map(command => command.toJSON());

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);

  const route = GUILD_ID
    ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
    : Routes.applicationCommands(CLIENT_ID);

  await rest.put(route, { body: commands });

  console.log("Slash commands registered.");
}

client.once("ready", () => {
  console.log(`${client.user.tag} is online.`);
  client.user.setActivity("Garden Adventures");
});

// ---------------- Security protections ----------------

const messageTimes = new Map();
const recentMessages = new Map();
const recentJoins = new Map();
const raidModeUntil = new Map();

function isStaffMember(member) {
  return Boolean(
    member?.permissions?.has(PermissionFlagsBits.ManageGuild) ||
    member?.permissions?.has(PermissionFlagsBits.ManageMessages) ||
    member?.permissions?.has(PermissionFlagsBits.Administrator) ||
    member?.permissions?.has(PermissionFlagsBits.ModerateMembers)
  );
}

async function sendSecurityAlert(guild, title, description) {
  const channel = guild.systemChannel;

  if (!channel?.isTextBased()) {
    console.warn(`[${guild.name}] ${title}: ${description}`);
    return;
  }

  if (!channel.permissionsFor(guild.members.me)
    ?.has(PermissionFlagsBits.SendMessages)) return;

  await channel.send({
    embeds: [makeEmbed(title, description)],
  }).catch(() => null);
}

client.on("guildMemberAdd", async member => {
  const now = Date.now();
  const times = (recentJoins.get(member.guild.id) || [])
    .filter(time => now - time < 10000);

  times.push(now);
  recentJoins.set(member.guild.id, times);

  if (times.length >= 6 &&
      now > (raidModeUntil.get(member.guild.id) || 0)) {
    raidModeUntil.set(member.guild.id, now + 60000);

    await sendSecurityAlert(
      member.guild,
      "Possible Join Raid Detected",
      `${times.length} members joined within 10 seconds. ` +
      "Raid monitoring is active for 60 seconds. No automatic bans are applied."
    );
  }
});

client.on("messageCreate", async message => {
  try {
    if (!message.guild || message.author.bot || !message.member) return;

    const staff = isStaffMember(message.member);
    const content = message.content || "";

    const invitePattern =
      /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg\/|discord(?:app)?\.com\/invite\/)[\w-]+/i;

    if (!staff && invitePattern.test(content)) {
      await message.delete().catch(() => null);

      const warning = await message.channel.send({
        content: `${message.author}, Discord invite links are not allowed here.`,
      }).catch(() => null);

      if (warning) {
        setTimeout(() => warning.delete().catch(() => null), 5000);
      }
      return;
    }

    if (staff) return;

    const now = Date.now();
    const key = `${message.guild.id}:${message.author.id}`;

    const times = (messageTimes.get(key) || [])
      .filter(time => now - time < 7000);

    times.push(now);
    messageTimes.set(key, times);

    const recent = (recentMessages.get(key) || [])
      .filter(item => now - item.time < 15000);

    const normalized = content.trim().toLowerCase();

    const duplicates = normalized
      ? recent.filter(item => item.content === normalized).length
      : 0;

    recent.push({ time: now, content: normalized });
    recentMessages.set(key, recent);

    const raidActive = now < (raidModeUntil.get(message.guild.id) || 0);
    const threshold = raidActive ? 4 : 6;

    if (times.length >= threshold ||
        (normalized.length >= 5 && duplicates >= 3)) {
      await message.delete().catch(() => null);

      const member = await message.guild.members
        .fetch(message.author.id).catch(() => null);

      if (member?.moderatable) {
        await member.timeout(
          60000,
          "Automatic anti-spam protection"
        ).catch(() => null);
      }

      await sendSecurityAlert(
        message.guild,
        "Anti-Spam Action",
        `Anti-spam protection triggered for <@${message.author.id}> ` +
        `in <#${message.channel.id}>.`
      );

      messageTimes.delete(key);
      recentMessages.delete(key);
    }
  } catch (error) {
    console.error("Message protection error:", error);
  }
});

// ---------------- Reaction notification roles ----------------

const ROLE_CHOICES = [
  { emoji: "🎮", name: "Game Updates" },
  { emoji: "📅", name: "Events" },
  { emoji: "🎁", name: "Giveaways" },
  { emoji: "📢", name: "Announcements" },
  { emoji: "✨", name: "New Content" },
  { emoji: "👀", name: "Sneak Peeks" },
  { emoji: "🌿", name: "Community News" },
];

client.on("messageReactionAdd", async (reaction, user) => {
  await handleRoleReaction(reaction, user, true);
});

client.on("messageReactionRemove", async (reaction, user) => {
  await handleRoleReaction(reaction, user, false);
});

async function handleRoleReaction(reaction, user, adding) {
  try {
    if (user.bot) return;

    if (reaction.partial) await reaction.fetch();

    const message = reaction.message;
    if (message.partial) await message.fetch();
    if (!message.guild) return;

    const panel = db.notificationPanels[message.id];
    if (!panel || panel.guildId !== message.guild.id) return;

    const choice = panel.roles.find(
      role => role.emoji === reaction.emoji.name
    );

    if (!choice) return;

    const guild = message.guild;
    const member = await guild.members.fetch(user.id).catch(() => null);
    const role = await guild.roles.fetch(choice.roleId).catch(() => null);
    const botMember = guild.members.me;

    if (!member || !role || !botMember) return;
    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) return;
    if (role.position >= botMember.roles.highest.position) return;

    if (adding) {
      await member.roles.add(role, "Reaction notification role").catch(() => null);
    } else {
      await member.roles.remove(role, "Reaction removed from notification panel").catch(() => null);
    }
  } catch (error) {
    console.error("Reaction-role error:", error);
  }
}

// ---------------- Slash command handling ----------------

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = interaction.commandName;

  try {
    const maintenance = db.maintenance[interaction.guildId];

    if (
      maintenance?.enabled &&
      !["health", "maintenance", "help"].includes(command) &&
      !isAdmin(interaction)
    ) {
      return deny(
        interaction,
        `The bot is in maintenance mode. ${maintenance.reason || ""}`
      );
    }

    if (command === "help") {
      return privateReply(interaction, {
        embeds: [
          makeEmbed(
            "Garden Adventures Bot",
            "**Community**\n" +
            "/help, /serverinfo, /membercount, /memberinfo, /profile\n\n" +
            "**Moderation**\n" +
            "/warn, /warnings, /timeout, /kick, /ban, /purge, " +
            "/slowmode, /lock, /unlock, /purgeuser, /case\n\n" +
            "**Publishing**\n" +
            "/announce, /poll, /embed, /notificationroles\n\n" +
            "**System**\n/health, /maintenance"
          ),
        ],
      });
    }

    if (command === "serverinfo") {
      const guild = interaction.guild;

      const embed = makeEmbed(
        guild.name,
        `**Members:** ${guild.memberCount}\n` +
        `**Created:** <t:${Math.floor(guild.createdTimestamp / 1000)}:D>\n` +
        `**Server ID:** \`${guild.id}\``
      );

      if (guild.iconURL()) embed.setThumbnail(guild.iconURL());

      return privateReply(interaction, { embeds: [embed] });
    }

    if (command === "membercount") {
      return privateReply(
        interaction,
        `This server currently has **${interaction.guild.memberCount.toLocaleString()}** members.`
      );
    }

    if (command === "memberinfo" || command === "profile") {
      const user =
        interaction.options.getUser("member") || interaction.user;

      const member = await interaction.guild.members
        .fetch(user.id).catch(() => null);

      const roles = member
        ? member.roles.cache
            .filter(role => role.id !== interaction.guild.id)
            .map(role => role.toString())
            .slice(0, 15)
            .join(", ") || "No roles"
        : "Not currently in this server";

      const embed = makeEmbed(
        command === "profile"
          ? `${user.username}'s Profile`
          : "Member Information",
        `**Username:** ${user.tag}\n` +
        `**User ID:** \`${user.id}\`\n` +
        `**Account created:** <t:${Math.floor(user.createdTimestamp / 1000)}:F>\n` +
        `**Joined server:** ${member?.joinedTimestamp
          ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`
          : "Not available"}\n` +
        `**Roles:** ${roles}`
      );

      embed.setThumbnail(user.displayAvatarURL());

      return privateReply(interaction, { embeds: [embed] });
    }

    if (command === "warn") {
      if (!hasPermission(interaction, PermissionFlagsBits.ModerateMembers)) {
        return deny(interaction, "You need the Moderate Members permission.");
      }

      const user = interaction.options.getUser("member");
      const reason = interaction.options.getString("reason");

      if (user.bot || user.id === interaction.user.id) {
        return deny(interaction, "You cannot warn yourself or a bot.");
      }

      const key = `${interaction.guildId}:${user.id}`;
      const list = db.warnings[key] ||= [];

      list.push({
        reason,
        moderator: interaction.user.id,
        date: Date.now(),
      });

      const entry = recordCase(
        interaction.guildId,
        user.id,
        interaction.user.id,
        "Warning",
        reason
      );

      saveData();

      await user.send({
        embeds: [
          makeEmbed(
            "Community Warning",
            `You received a warning in **${interaction.guild.name}**.\n` +
            `**Reason:** ${reason}`
          ),
        ],
      }).catch(() => null);

      await logModeration(interaction.guild, entry);

      return privateReply(interaction, {
        embeds: [
          makeEmbed(
            "Warning Recorded",
            `${user} has been warned.\n**Case:** #${entry.id}\n` +
            `**Reason:** ${reason}`
          ),
        ],
      });
    }

    if (command === "warnings") {
      if (!hasPermission(interaction, PermissionFlagsBits.ModerateMembers)) {
        return deny(interaction, "You need the Moderate Members permission.");
      }

      const user = interaction.options.getUser("member");
      const warnings = db.warnings[`${interaction.guildId}:${user.id}`] || [];

      const description = warnings.length
        ? warnings.map((warning, index) =>
            `**${index + 1}.** ${warning.reason}\n` +
            `Moderator: <@${warning.moderator}> · ` +
            `<t:${Math.floor(warning.date / 1000)}:R>`
          ).join("\n\n")
        : "No warnings recorded for this member.";

      return privateReply(interaction, {
        embeds: [makeEmbed(`Warnings: ${user.tag}`, description)],
      });
    }

    if (command === "timeout") {
      if (!hasPermission(interaction, PermissionFlagsBits.ModerateMembers)) {
        return deny(interaction, "You need the Moderate Members permission.");
      }

      const user = interaction.options.getUser("member");
      const minutes = interaction.options.getInteger("minutes");
      const reason = interaction.options.getString("reason");

      if (user.id === interaction.user.id || user.id === client.user.id) {
        return deny(interaction, "You cannot timeout yourself or the bot.");
      }

      const member = await interaction.guild.members
        .fetch(user.id).catch(() => null);

      if (!member?.moderatable) {
        return deny(interaction, "I cannot timeout that member. Check permissions and role positions.");
      }

      await member.timeout(minutes * 60000, reason);

      const entry = recordCase(
        interaction.guildId,
        user.id,
        interaction.user.id,
        "Timeout",
        reason,
        { durationMinutes: minutes }
      );

      await logModeration(interaction.guild, entry);

      return privateReply(interaction, {
        embeds: [
          makeEmbed(
            "Member Timed Out",
            `**Member:** ${user.tag}\n` +
            `**Duration:** ${minutes} minutes\n` +
            `**Case:** #${entry.id}\n**Reason:** ${reason}`
          ),
        ],
      });
    }

    if (command === "kick" || command === "ban") {
      const permission = command === "kick"
        ? PermissionFlagsBits.KickMembers
        : PermissionFlagsBits.BanMembers;

      if (!hasPermission(interaction, permission)) {
        return deny(interaction, `You need the ${command === "kick" ? "Kick Members" : "Ban Members"} permission.`);
      }

      const user = interaction.options.getUser("member");
      const reason = interaction.options.getString("reason");

      if (user.id === interaction.user.id || user.id === client.user.id) {
        return deny(interaction, `You cannot ${command} yourself or the bot.`);
      }

      const member = await interaction.guild.members
        .fetch(user.id).catch(() => null);

      if (command === "kick") {
        if (!member?.kickable) {
          return deny(interaction, "I cannot kick that member. Check role positions and permissions.");
        }

        await member.kick(reason);
      } else {
        if (member && !member.bannable) {
          return deny(interaction, "I cannot ban that member. Check role positions and permissions.");
        }

        await interaction.guild.members.ban(user.id, { reason });
      }

      const entry = recordCase(
        interaction.guildId,
        user.id,
        interaction.user.id,
        command === "kick" ? "Kick" : "Ban",
        reason
      );

      await logModeration(interaction.guild, entry);

      return privateReply(interaction, {
        embeds: [
          makeEmbed(
            command === "kick" ? "Member Kicked" : "Member Banned",
            `**Member:** ${user.tag}\n**Case:** #${entry.id}\n` +
            `**Reason:** ${reason}`
          ),
        ],
      });
    }

    if (command === "purge") {
      if (!hasPermission(interaction, PermissionFlagsBits.ManageMessages)) {
        return deny(interaction, "You need Manage Messages permission.");
      }

      const channel = interaction.channel;
      if (!channel?.messages || !channel.bulkDelete) {
        return deny(interaction, "This command cannot be used in this channel.");
      }

      const amount = interaction.options.getInteger("amount");
      const deleted = await channel.bulkDelete(amount, true);

      return privateReply(
        interaction,
        `Deleted ${deleted.size} recent messages. Messages older than 14 days cannot be bulk-deleted.`
      );
    }

    if (command === "slowmode") {
      if (!hasPermission(interaction, PermissionFlagsBits.ManageChannels)) {
        return deny(interaction, "You need Manage Channels permission.");
      }

      const channel =
        interaction.options.getChannel("channel") || interaction.channel;

      if (!channel?.setRateLimitPerUser) {
        return deny(interaction, "Choose a text channel that supports slowmode.");
      }

      const seconds = interaction.options.getInteger("seconds");

      await channel.setRateLimitPerUser(
        seconds,
        `Changed by ${interaction.user.tag}`
      );

      return privateReply(
        interaction,
        `Slowmode for ${channel} set to **${seconds} seconds**.`
      );
    }

    if (command === "lock" || command === "unlock") {
      if (!hasPermission(interaction, PermissionFlagsBits.ManageChannels)) {
        return deny(interaction, "You need Manage Channels permission.");
      }

      const channel =
        interaction.options.getChannel("channel") || interaction.channel;

      if (!channel?.permissionOverwrites) {
        return deny(interaction, "Choose a text channel.");
      }

      const reason =
        interaction.options.getString("reason") ||
        `Changed by ${interaction.user.tag}`;

      await channel.permissionOverwrites.edit(
        interaction.guild.roles.everyone,
        {
          SendMessages: command === "lock" ? false : null,
          AddReactions: command === "lock" ? false : null,
          SendMessagesInThreads: command === "lock" ? false : null,
        },
        { reason }
      );

      return privateReply(
        interaction,
        `${channel} has been ${command === "lock" ? "locked" : "unlocked"}.`
      );
    }

    if (command === "purgeuser") {
      if (!hasPermission(interaction, PermissionFlagsBits.ManageMessages)) {
        return deny(interaction, "You need Manage Messages permission.");
      }

      const channel = interaction.channel;
      if (!channel?.messages || !channel.bulkDelete) {
        return deny(interaction, "Use this command in a text channel.");
      }

      const user = interaction.options.getUser("member");
      const amount = interaction.options.getInteger("amount");
      const fetched = await channel.messages.fetch({ limit: amount });

      const matching = fetched.filter(message =>
        message.author.id === user.id &&
        Date.now() - message.createdTimestamp < 14 * 24 * 60 * 60 * 1000
      );

      const deleted = matching.size
        ? await channel.bulkDelete(matching, true)
        : { size: 0 };

      return privateReply(
        interaction,
        `Deleted **${deleted.size}** recent messages from ${user} in ${channel}.`
      );
    }

    if (command === "case") {
      if (!isStaff(interaction)) {
        return deny(interaction, "You need moderation staff permissions.");
      }

      const id = String(interaction.options.getInteger("id"));
      const entry = db.cases[id];

      if (!entry || entry.guildId !== interaction.guildId) {
        return deny(interaction, "That case was not found in this server.");
      }

      return privateReply(interaction, {
        embeds: [
          makeEmbed(
            `Moderation Case #${entry.id}`,
            `**Action:** ${entry.action}\n` +
            `**Member:** <@${entry.targetId}>\n` +
            `**Moderator:** <@${entry.moderatorId}>\n` +
            `**Reason:** ${entry.reason}\n` +
            `**Date:** <t:${Math.floor(entry.timestamp / 1000)}:F>` +
            (entry.durationMinutes
              ? `\n**Duration:** ${entry.durationMinutes} minutes`
              : "")
          ),
        ],
      });
    }

    if (command === "announce") {
      if (!hasPermission(interaction, PermissionFlagsBits.ManageGuild)) {
        return deny(interaction, "You need Manage Server permission.");
      }

      const channel = interaction.options.getChannel("channel");
      const title = interaction.options.getString("title");
      const message = interaction.options.getString("message");

      if (
        !channel.isTextBased() ||
        !channel.permissionsFor(interaction.guild.members.me)
          ?.has(PermissionFlagsBits.SendMessages)
      ) {
        return deny(interaction, "I cannot send messages in that channel.");
      }

      await channel.send({
        embeds: [
          makeEmbed(title, message).setFooter({
            text: `Published by ${interaction.user.tag}`,
          }),
        ],
      });

      return privateReply(interaction, `Announcement published in ${channel}.`);
    }

    if (command === "poll") {
      if (!hasPermission(interaction, PermissionFlagsBits.ManageGuild)) {
        return deny(interaction, "You need Manage Server permission.");
      }

      const channel = interaction.options.getChannel("channel");
      const question = interaction.options.getString("question");
      const options = interaction.options.getString("options")
        .split("|")
        .map(option => option.trim())
        .filter(Boolean);

      if (options.length < 2 || options.length > 10) {
        return deny(interaction, "Provide 2–10 options separated by the | character.");
      }

      const botPermissions = channel.permissionsFor(interaction.guild.members.me);

      if (
        !channel.isTextBased() ||
        !botPermissions?.has([
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.AddReactions,
          PermissionFlagsBits.EmbedLinks,
        ])
      ) {
        return deny(interaction, "I need Send Messages, Add Reactions and Embed Links permissions in that channel.");
      }

      const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];

      const description = options
        .map((option, index) => `${emojis[index]} ${option}`)
        .join("\n");

      const pollMessage = await channel.send({
        embeds: [
          makeEmbed(`📊 ${question}`, description).setFooter({
            text: `Poll created by ${interaction.user.tag}`,
          }),
        ],
      });

      for (let index = 0; index < options.length; index++) {
        await pollMessage.react(emojis[index]);
      }

      return privateReply(interaction, `Poll published in ${channel}.`);
    }

    if (command === "embed") {
      if (!hasPermission(interaction, PermissionFlagsBits.ManageGuild)) {
        return deny(interaction, "You need Manage Server permission.");
      }

      const channel = interaction.options.getChannel("channel");
      const title = interaction.options.getString("title");
      const description = interaction.options.getString("description");

      const botPermissions = channel.permissionsFor(interaction.guild.members.me);

      if (
        !channel.isTextBased() ||
        !botPermissions?.has([
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
        ])
      ) {
        return deny(interaction, "I need Send Messages and Embed Links permissions in that channel.");
      }

      await channel.send({
        embeds: [
          makeEmbed(title, description).setFooter({
            text: `Published by ${interaction.user.tag}`,
          }),
        ],
      });

      return privateReply(interaction, `Embed published in ${channel}.`);
    }

    if (command === "notificationroles") {
      if (!canManageRoles(interaction.member)) {
        return deny(interaction, "You need Manage Roles or Manage Server permission.");
      }

      const channel = interaction.options.getChannel("channel");
      const botPermissions = channel.permissionsFor(interaction.guild.members.me);

      if (
        !channel.isTextBased() ||
        !botPermissions?.has([
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.AddReactions,
        ]) ||
        !interaction.guild.members.me.permissions.has(
          PermissionFlagsBits.ManageRoles
        )
      ) {
        return deny(interaction, "I need Send Messages, Embed Links, Add Reactions and Manage Roles permissions.");
      }

      const roleEntries = [];

      for (const choice of ROLE_CHOICES) {
        let role = interaction.guild.roles.cache.find(
          existing => existing.name === choice.name
        );

        if (!role) {
          role = await interaction.guild.roles.create({
            name: choice.name,
            color: GREEN,
            mentionable: false,
            reason: "Garden Adventures notification role setup",
          });
        }

        if (
          role.position >=
          interaction.guild.members.me.roles.highest.position
        ) {
          return deny(
            interaction,
            `Move my bot role above **${role.name}** in Server Settings → Roles, then run this command again.`
          );
        }

        roleEntries.push({
          emoji: choice.emoji,
          roleId: role.id,
          name: choice.name,
        });
      }

      const description = roleEntries
        .map(role => `${role.emoji} — **${role.name}**`)
        .join("\n");

      const panelMessage = await channel.send({
        embeds: [
          makeEmbed(
            "Garden Adventures Notification Roles",
            "React below to get or remove notification roles.\n\n" +
            `${description}\n\nYou can select as many as you like.`
          ),
        ],
      });

      for (const role of roleEntries) {
        await panelMessage.react(role.emoji);
      }

      db.notificationPanels[panelMessage.id] = {
        guildId: interaction.guildId,
        channelId: channel.id,
        roles: roleEntries,
      };

      saveData();

      return privateReply(
        interaction,
        `Notification-role panel published in ${channel}.`
      );
    }

    if (command === "health") {
      let storage = "OK";

      try {
        fs.accessSync(DATA_FILE, fs.constants.R_OK | fs.constants.W_OK);
        JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      } catch {
        storage = "Error";
      }

      return privateReply(interaction, {
        embeds: [
          makeEmbed(
            "Bot Health",
            `**Status:** Online\n` +
            `**WebSocket latency:** ${Math.round(client.ws.ping)} ms\n` +
            `**Storage:** ${storage}\n` +
            `**Uptime:** ${Math.floor(process.uptime() / 60)} minutes`
          ),
        ],
      });
    }

    if (command === "maintenance") {
      if (!isAdmin(interaction)) {
        return deny(interaction, "Only server administrators can change maintenance mode.");
      }

      const enabled = interaction.options.getBoolean("enabled");
      const reason =
        interaction.options.getString("reason") || "No reason provided";

      db.maintenance[interaction.guildId] = {
        enabled,
        reason,
        changedBy: interaction.user.id,
        changedAt: Date.now(),
      };

      saveData();

      return privateReply(
        interaction,
        enabled
          ? `Maintenance mode enabled. Reason: ${reason}`
          : "Maintenance mode disabled. Normal command access has resumed."
      );
    }

    return deny(interaction, "That command is not implemented.");
  } catch (error) {
    console.error(`Error in /${command}:`, error);

    await privateReply(
      interaction,
      "Something went wrong while running this command. Check the bot console or contact an administrator."
    ).catch(() => null);
  }
});

client.on("error", error => {
  console.error("Discord client error:", error);
});

process.on("unhandledRejection", error => {
  console.error("Unhandled rejection:", error);
});

async function startBot() {
  try {
    await registerCommands();
    await client.login(TOKEN);
  } catch (error) {
    console.error("Bot startup failed:", error);
    process.exit(1);
  }
}

startBot();
