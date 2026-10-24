
require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  AttachmentBuilder,
} = require("discord.js");

// ======================================================
// GARDEN ADVENTURES BOT
// Standalone Discord bot
// ======================================================

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID || "";

const GREEN = 0x2E8B57;
const GOLD = 0xF1C40F;

if (!TOKEN || !CLIENT_ID) {
  console.error("Missing DISCORD_TOKEN or CLIENT_ID in .env");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

const DATA_FOLDER = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_FOLDER, "garden-data.json");

if (!fs.existsSync(DATA_FOLDER)) {
  fs.mkdirSync(DATA_FOLDER, { recursive: true });
}

const DEFAULT_DATA = {
  users: {},
  warnings: {},
  tickets: {},
  events: {},
  config: {},
};

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(
        DATA_FILE,
        JSON.stringify(DEFAULT_DATA, null, 2)
      );
    }

    return {
      ...structuredClone(DEFAULT_DATA),
      ...JSON.parse(fs.readFileSync(DATA_FILE, "utf8")),
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

function embed(title, description) {
  return new EmbedBuilder()
    .setColor(GREEN)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

function getProfile(userId) {
  if (!db.users[userId]) {
    db.users[userId] = {
      coins: 100,
      seeds: {
        carrot: 2,
      },
      garden: [],
      pets: [],
      daily: 0,
    };
  }

  const profile = db.users[userId];

  profile.coins ??= 100;
  profile.seeds ??= { carrot: 2 };
  profile.garden ??= [];
  profile.pets ??= [];
  profile.daily ??= 0;

  return profile;
}

function isStaff(interaction) {
  return interaction.memberPermissions?.has(
    PermissionFlagsBits.ModerateMembers
  ) || interaction.memberPermissions?.has(
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

function isTicketStaff(interaction) {
  const configuredRole =
    db.config[interaction.guildId]?.staffRoleId;

  if (isStaff(interaction)) return true;

  return Boolean(
    configuredRole &&
    interaction.member?.roles?.cache?.has(configuredRole)
  );
}

async function replyError(interaction, message) {
  const payload = {
    content: message,
    ephemeral: true,
  };

  if (interaction.deferred) {
    return interaction.editReply(payload);
  }

  if (interaction.replied) {
    return interaction.followUp(payload);
  }

  return interaction.reply(payload);
}

async function sendConfigured(guild, key, messageEmbed) {
  const channelId = db.config[guild.id]?.[key];

  if (!channelId) return false;

  const channel = await guild.channels.fetch(channelId)
    .catch(() => null);

  if (!channel?.isTextBased()) return false;

  await channel.send({ embeds: [messageEmbed] });
  return true;
}

const SEEDS = {
  carrot: {
    price: 10,
    reward: 20,
    growSeconds: 60,
  },
  strawberry: {
    price: 25,
    reward: 50,
    growSeconds: 120,
  },
  sunflower: {
    price: 50,
    reward: 100,
    growSeconds: 180,
  },
  pumpkin: {
    price: 100,
    reward: 220,
    growSeconds: 300,
  },
};

const PETS = [
  { name: "Bunny", rarity: "Common", chance: 50 },
  { name: "Cat", rarity: "Common", chance: 30 },
  { name: "Fox", rarity: "Rare", chance: 15 },
  { name: "Golden Bee", rarity: "Legendary", chance: 5 },
];

function choosePet() {
  const roll = Math.random() * 100;
  let total = 0;

  for (const pet of PETS) {
    total += pet.chance;

    if (roll < total) {
      return pet;
    }
  }

  return PETS[0];
}

// ======================================================
// SLASH COMMANDS
// ======================================================

const commands = [
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("View Garden Adventures commands"),

  new SlashCommandBuilder()
    .setName("rules")
    .setDescription("View the community rules"),

  new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("View server information"),

  new SlashCommandBuilder()
    .setName("memberinfo")
    .setDescription("View member information")
    .addUserOption(o =>
      o.setName("member")
        .setDescription("Member to inspect")
        .setRequired(true)
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
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("View member warnings")
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
        .setDescription("Timeout duration in minutes")
        .setMinValue(1)
        .setMaxValue(40320)
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason")
        .setDescription("Reason")
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
    .setName("gameupdate")
    .setDescription("Publish a game update")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addStringOption(o =>
      o.setName("title")
        .setDescription("Update title")
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("details")
        .setDescription("Update details")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Publish an announcement")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addStringOption(o =>
      o.setName("title")
        .setDescription("Announcement title")
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("message")
        .setDescription("Announcement text")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("bugreport")
    .setDescription("Report a game bug")
    .addStringOption(o =>
      o.setName("details")
        .setDescription("Describe the bug")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("suggest")
    .setDescription("Suggest a game feature")
    .addStringOption(o =>
      o.setName("idea")
        .setDescription("Describe your idea")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("support")
    .setDescription("Create a private support ticket"),

  new SlashCommandBuilder()
    .setName("ticketclaim")
    .setDescription("Claim the current support ticket"),

  new SlashCommandBuilder()
    .setName("ticketclose")
    .setDescription("Close the current support ticket"),

  new SlashCommandBuilder()
    .setName("event")
    .setDescription("Manage community events")
    .addSubcommand(s =>
      s.setName("create")
        .setDescription("Create an event")
        .addStringOption(o =>
          o.setName("name")
            .setDescription("Event name")
            .setRequired(true)
        )
        .addStringOption(o =>
          o.setName("time")
            .setDescription("Event date and time")
            .setRequired(true)
        )
        .addStringOption(o =>
          o.setName("details")
            .setDescription("Event details")
            .setRequired(true)
        )
    )
    .addSubcommand(s =>
      s.setName("list")
        .setDescription("List community events")
    )
    .addSubcommand(s =>
      s.setName("join")
        .setDescription("Join an event")
        .addStringOption(o =>
          o.setName("id")
            .setDescription("Event ID")
            .setRequired(true)
        )
    )
    .addSubcommand(s =>
      s.setName("cancel")
        .setDescription("Cancel an event")
        .addStringOption(o =>
          o.setName("id")
            .setDescription("Event ID")
            .setRequired(true)
        )
    ),

  new SlashCommandBuilder()
    .setName("config")
    .setDescription("Configure bot channels and staff role")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator
    )
    .addSubcommand(s =>
      s.setName("channel")
        .setDescription("Set a bot channel")
        .addStringOption(o =>
          o.setName("type")
            .setDescription("Channel purpose")
            .setRequired(true)
            .addChoices(
              { name: "Game updates", value: "updatesChannelId" },
              { name: "Bug reports", value: "reportsChannelId" },
              { name: "Suggestions", value: "suggestionsChannelId" },
              { name: "Welcome messages", value: "welcomeChannelId" },
              { name: "Moderation logs", value: "logsChannelId" }
            )
        )
        .addChannelOption(o =>
          o.setName("channel")
            .setDescription("Channel to use")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand(s =>
      s.setName("staffrole")
        .setDescription("Set the support staff role")
        .addRoleOption(o =>
          o.setName("role")
            .setDescription("Staff role")
            .setRequired(true)
        )
    ),

  new SlashCommandBuilder()
    .setName("balance")
    .setDescription("View your garden coins"),

  new SlashCommandBuilder()
    .setName("daily")
    .setDescription("Claim your daily coins"),

  new SlashCommandBuilder()
    .setName("shop")
    .setDescription("View seeds and prices"),

  new SlashCommandBuilder()
    .setName("buy")
    .setDescription("Buy seeds")
    .addStringOption(o =>
      o.setName("seed")
        .setDescription("Seed to purchase")
        .setRequired(true)
        .addChoices(
          { name: "Carrot", value: "carrot" },
          { name: "Strawberry", value: "strawberry" },
          { name: "Sunflower", value: "sunflower" },
          { name: "Pumpkin", value: "pumpkin" }
        )
    )
    .addIntegerOption(o =>
      o.setName("amount")
        .setDescription("Number of seed packets")
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("garden")
    .setDescription("Manage your garden")
    .addSubcommand(s =>
      s.setName("view")
        .setDescription("View your garden")
    )
    .addSubcommand(s =>
      s.setName("plant")
        .setDescription("Plant a seed")
        .addStringOption(o =>
          o.setName("seed")
            .setDescription("Seed to plant")
            .setRequired(true)
            .addChoices(
              { name: "Carrot", value: "carrot" },
              { name: "Strawberry", value: "strawberry" },
              { name: "Sunflower", value: "sunflower" },
              { name: "Pumpkin", value: "pumpkin" }
            )
        )
    )
    .addSubcommand(s =>
      s.setName("harvest")
        .setDescription("Harvest a ready crop")
        .addIntegerOption(o =>
          o.setName("plot")
            .setDescription("Plot number")
            .setMinValue(1)
            .setRequired(true)
        )
    ),

  new SlashCommandBuilder()
    .setName("sell")
    .setDescription("Sell harvested crops")
    .addStringOption(o =>
      o.setName("crop")
        .setDescription("Crop to sell")
        .setRequired(true)
        .addChoices(
          { name: "Carrot", value: "carrot" },
          { name: "Strawberry", value: "strawberry" },
          { name: "Sunflower", value: "sunflower" },
          { name: "Pumpkin", value: "pumpkin" }
        )
    )
    .addIntegerOption(o =>
      o.setName("amount")
        .setDescription("Number of crops")
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("pets")
    .setDescription("View your pets"),

  new SlashCommandBuilder()
    .setName("egg")
    .setDescription("Buy and hatch a pet egg")
    .addSubcommand(s =>
      s.setName("buy")
        .setDescription("Buy a pet egg for 100 coins")
        .addIntegerOption(o =>
          o.setName("amount")
            .setDescription("Number of eggs")
            .setMinValue(1)
            .setMaxValue(10)
            .setRequired(true)
        )
    )
    .addSubcommand(s =>
      s.setName("hatch")
        .setDescription("Hatch one of your eggs")
    ),

  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("View the richest gardeners"),

].map(command => command.toJSON());

// ======================================================
// REGISTER COMMANDS
// ======================================================

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);

  const route = GUILD_ID
    ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
    : Routes.applicationCommands(CLIENT_ID);

  await rest.put(route, { body: commands });

  console.log(
    GUILD_ID
      ? "Garden Adventures commands registered in the server."
      : "Global commands registered; they may take time to appear."
  );
}

// ======================================================
// BOT READY
// ======================================================

client.once("ready", () => {
  console.log(`${client.user.tag} is online.`);
  client.user.setActivity("Garden Adventures");
});

// ======================================================
// WELCOME MESSAGES
// ======================================================

client.on("guildMemberAdd", async member => {
  try {
    await sendConfigured(
      member.guild,
      "welcomeChannelId",
      embed(
        "Welcome to Garden Adventures",
        `Welcome, ${member}!\n\nExplore the community, share your ideas and get ready for your gardening adventures.`
      )
    );
  } catch (error) {
    console.error("Welcome message error:", error);
  }
});

// ======================================================
// INTERACTION HANDLER
// ======================================================

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = interaction.commandName;

  try {
    // HELP
    if (command === "help") {
      return interaction.reply({
        embeds: [embed(
          "Garden Adventures Bot",
          "**Community**\n/help, /rules, /serverinfo, /memberinfo\n\n" +
          "**Moderation**\n/warn, /warnings, /timeout, /kick, /ban, /purge\n\n" +
          "**Support**\n/support, /ticketclaim, /ticketclose\n\n" +
          "**Updates**\n/gameupdate, /announce, /bugreport, /suggest\n\n" +
          "**Events**\n/event create, /event list, /event join, /event cancel\n\n" +
          "**Gardening**\n/balance, /daily, /shop, /buy, /garden, /sell\n\n" +
          "**Pets**\n/pets, /egg buy, /egg hatch\n\n" +
          "**Administration**\n/config channel, /config staffrole"
        )],
        ephemeral: true,
      });
    }

    // RULES
    if (command === "rules") {
      return interaction.reply({
        embeds: [embed(
          "Community Rules",
          "1. Respect everyone.\n" +
          "2. No harassment, threats or hate.\n" +
          "3. No spam or disruptive behaviour.\n" +
          "4. Do not advertise without permission.\n" +
          "5. Never share private information.\n" +
          "6. Report bugs honestly.\n" +
          "7. Follow Discord's Terms of Service.\n" +
          "8. Follow staff instructions."
        )],
      });
    }

    // SERVER INFO
    if (command === "serverinfo") {
      const guild = interaction.guild;

      return interaction.reply({
        embeds: [embed(
          guild.name,
          `**Members:** ${guild.memberCount}\n` +
          `**Created:** <t:${Math.floor(guild.createdTimestamp / 1000)}:D>\n` +
          `**Server ID:** ${guild.id}`
        ).setThumbnail(guild.iconURL())],
      });
    }

    // MEMBER INFO
    if (command === "memberinfo") {
      const user = interaction.options.getUser("member");
      const member = await interaction.guild.members.fetch(user.id)
        .catch(() => null);

      return interaction.reply({
        embeds: [embed(
          "Member Information",
          `**Username:** ${user.tag}\n` +
          `**ID:** ${user.id}\n` +
          `**Account created:** <t:${Math.floor(user.createdTimestamp / 1000)}:D>\n` +
          `**Joined server:** ${member?.joinedTimestamp
            ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:D>`
            : "Unknown"}`
        )],
        ephemeral: true,
      });
    }

    // WARN
    if (command === "warn") {
      if (!isStaff(interaction)) {
        return replyError(interaction, "You do not have permission.");
      }

      const user = interaction.options.getUser("member");
      const reason = interaction.options.getString("reason");

      if (user.id === interaction.user.id || user.bot) {
        return replyError(interaction, "You cannot warn yourself or a bot.");
      }

      if (!db.warnings[user.id]) db.warnings[user.id] = [];

      db.warnings[user.id].push({
        reason,
        moderator: interaction.user.id,
        date: Date.now(),
        guildId: interaction.guildId,
      });

      saveData();

      await user.send({
        embeds: [embed(
          "Community Warning",
          `You received a warning in **${interaction.guild.name}**.\n**Reason:** ${reason}`
        )],
      }).catch(() => null);

      await sendConfigured(
        interaction.guild,
        "logsChannelId",
        embed(
          "Member Warned",
          `**Member:** ${user.tag}\n**Moderator:** ${interaction.user.tag}\n**Reason:** ${reason}`
        )
      ).catch(() => null);

      return interaction.reply({
        embeds: [embed("Warning Recorded", `${user} has been warned.\n**Reason:** ${reason}`)],
        ephemeral: true,
      });
    }

    // WARNINGS
    if (command === "warnings") {
      if (!isStaff(interaction)) {
        return replyError(interaction, "You do not have permission.");
      }

      const user = interaction.options.getUser("member");
      const warnings = (db.warnings[user.id] || [])
        .filter(w => w.guildId === interaction.guildId);

      const description = warnings.length
        ? warnings.map((w, i) =>
          `**${i + 1}.** ${w.reason}\nModerator: <@${w.moderator}> | <t:${Math.floor(w.date / 1000)}:d>`
        ).join("\n\n")
        : "No warnings recorded for this member in this server.";

      return interaction.reply({
        embeds: [embed(`Warnings: ${user.tag}`, description)],
        ephemeral: true,
      });
    }

    // TIMEOUT
    if (command === "timeout") {
      if (!interaction.memberPermissions.has(
        PermissionFlagsBits.ModerateMembers
      )) {
        return replyError(interaction, "You need the Moderate Members permission.");
      }

      const user = interaction.options.getUser("member");
      const minutes = interaction.options.getInteger("minutes");
      const reason = interaction.options.getString("reason");

      if (user.id === interaction.user.id) {
        return replyError(interaction, "You cannot timeout yourself.");
      }

      const member = await interaction.guild.members.fetch(user.id)
        .catch(() => null);

      if (!member?.moderatable) {
        return replyError(interaction, "I cannot timeout that member. Check my permissions and role position.");
      }

      await member.timeout(minutes * 60000, reason);

      return interaction.reply({
        embeds: [embed(
          "Member Timed Out",
          `**Member:** ${user.tag}\n**Duration:** ${minutes} minutes\n**Reason:** ${reason}`
        )],
        ephemeral: true,
      });
    }

    // KICK
    if (command === "kick") {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.KickMembers)) {
        return replyError(interaction, "You need the Kick Members permission.");
      }

      const user = interaction.options.getUser("member");
      const reason = interaction.options.getString("reason");

      const member = await interaction.guild.members.fetch(user.id)
        .catch(() => null);

      if (user.id === interaction.user.id || user.id === client.user.id) {
        return replyError(interaction, "You cannot kick yourself or the bot.");
      }

      if (!member?.kickable) {
        return replyError(interaction, "I cannot kick that member.");
      }

      await member.kick(reason);

      return interaction.reply({
        embeds: [embed("Member Kicked", `**Member:** ${user.tag}\n**Reason:** ${reason}`)],
        ephemeral: true,
      });
    }

    // BAN
    if (command === "ban") {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.BanMembers)) {
        return replyError(interaction, "You need the Ban Members permission.");
      }

      const user = interaction.options.getUser("member");
      const reason = interaction.options.getString("reason");

      if (user.id === interaction.user.id || user.id === client.user.id) {
        return replyError(interaction, "You cannot ban yourself or the bot.");
      }

      const member = await interaction.guild.members.fetch(user.id)
        .catch(() => null);

      if (member && !member.bannable) {
        return replyError(interaction, "I cannot ban that member.");
      }

      await interaction.guild.members.ban(user.id, { reason });

      return interaction.reply({
        embeds: [embed("Member Banned", `**Member:** ${user.tag}\n**Reason:** ${reason}`)],
        ephemeral: true,
      });
    }

    // PURGE
    if (command === "purge") {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageMessages)) {
        return replyError(interaction, "You need the Manage Messages permission.");
      }

      const amount = interaction.options.getInteger("amount");

      if (!interaction.channel?.isTextBased() ||
          !("bulkDelete" in interaction.channel)) {
        return replyError(interaction, "This command cannot be used here.");
      }

      const deleted = await interaction.channel.bulkDelete(amount, true);

      return interaction.reply({
        content: `Deleted ${deleted.size} recent messages. Messages older than 14 days cannot be bulk-deleted.`,
        ephemeral: true,
      });
    }

    // GAME UPDATE AND ANNOUNCEMENT
    if (command === "gameupdate" || command === "announce") {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
        return replyError(interaction, "You need the Manage Server permission.");
      }

      const title = interaction.options.getString("title");
      const message = interaction.options.getString(
        command === "gameupdate" ? "details" : "message"
      );

      const key = command === "gameupdate"
        ? "updatesChannelId"
        : "updatesChannelId";

      const sent = await sendConfigured(
        interaction.guild,
        key,
        embed(title, message).setFooter({
          text: `Published by ${interaction.user.tag}`,
        })
      );

      if (!sent) {
        return replyError(interaction, "Configure the updates channel using /config channel first.");
      }

      return interaction.reply({
        content: "Your post has been published.",
        ephemeral: true,
      });
    }

    // BUG REPORT
    if (command === "bugreport") {
      const details = interaction.options.getString("details");

      const sent = await sendConfigured(
        interaction.guild,
        "reportsChannelId",
        embed("New Bug Report", details).addFields(
          { name: "Reported by", value: `${interaction.user.tag} (${interaction.user.id})` },
          { name: "Status", value: "Awaiting review" }
        )
      );

      return interaction.reply({
        content: sent
          ? "Your bug report has been sent to the team."
          : "The report channel has not been configured yet.",
        ephemeral: true,
      });
    }

    // SUGGESTION
    if (command === "suggest") {
      const idea = interaction.options.getString("idea");

      const sent = await sendConfigured(
        interaction.guild,
        "suggestionsChannelId",
        embed("Community Suggestion", idea).addFields(
          { name: "Suggested by", value: `${interaction.user.tag} (${interaction.user.id})` }
        )
      );

      return interaction.reply({
        content: sent
          ? "Your suggestion has been submitted."
          : "The suggestions channel has not been configured yet.",
        ephemeral: true,
      });
    }

    // CONFIGURATION
    if (command === "config") {
      if (!isAdmin(interaction)) {
        return replyError(interaction, "Only administrators can configure the bot.");
      }

      db.config[interaction.guildId] ??= {};

      const subcommand = interaction.options.getSubcommand();

      if (subcommand === "channel") {
        const key = interaction.options.getString("type");
        const channel = interaction.options.getChannel("channel");

        db.config[interaction.guildId][key] = channel.id;
        saveData();

        return interaction.reply({
          content: `Configured ${key} as ${channel}.`,
          ephemeral: true,
        });
      }

      if (subcommand === "staffrole") {
        const role = interaction.options.getRole("role");

        db.config[interaction.guildId].staffRoleId = role.id;
        saveData();

        return interaction.reply({
          content: `Support staff role set to ${role}.`,
          ephemeral: true,
        });
      }
    }

    // SUPPORT TICKET CREATE
    if (command === "support") {
      const guild = interaction.guild;

      const previousId = db.tickets[interaction.user.id];
      if (previousId) {
        const previous = await guild.channels.fetch(previousId)
          .catch(() => null);

        if (previous) {
          return replyError(interaction, `You already have a ticket: ${previous}`);
        }

        delete db.tickets[interaction.user.id];
      }

      const staffRoleId = db.config[guild.id]?.staffRoleId;

      const overwrites = [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
          ],
        },
        {
          id: client.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.AttachFiles,
          ],
        },
      ];

      if (staffRoleId) {
        overwrites.push({
          id: staffRoleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        });
      }

      const channel = await guild.channels.create({
        name: `ticket-${interaction.user.id}`,
        type: ChannelType.GuildText,
        permissionOverwrites: overwrites,
        topic: `Garden Adventures support ticket | Owner ID: ${interaction.user.id}`,
      });

      db.tickets[interaction.user.id] = channel.id;
      saveData();

      await channel.send({
        embeds: [embed(
          "Garden Adventures Support",
          `Welcome ${interaction.user}.\n\nDescribe your issue and the support team will assist you.\n\nStaff can use \`/ticketclaim\` to claim this ticket. Use \`/ticketclose\` when the issue is resolved.`
        )],
      });

      return interaction.reply({
        content: `Your private support ticket is ready: ${channel}`,
        ephemeral: true,
      });
    }

    // CLAIM TICKET
    if (command === "ticketclaim") {
      if (!interaction.channel?.name.startsWith("ticket-")) {
        return replyError(interaction, "Use this command inside a support ticket.");
      }

      if (!isTicketStaff(interaction)) {
        return replyError(interaction, "Only support staff can claim tickets.");
      }

      const ownerId = interaction.channel.topic?.match(/Owner ID: (\d+)/)?.[1];

      if (!ownerId) {
        return replyError(interaction, "The ticket owner could not be identified.");
      }

      const ticket = db.tickets[ownerId];

      if (ticket !== interaction.channel.id) {
        return replyError(interaction, "This ticket is not registered in the bot's saved data.");
      }

      const existingClaim = interaction.channel.topic?.match(/Claimed by: (\d+)/)?.[1];

      if (existingClaim) {
        return replyError(interaction, `This ticket is already claimed by <@${existingClaim}>.`);
      }

      await interaction.channel.setTopic(
        `Garden Adventures support ticket | Owner ID: ${ownerId} | Claimed by: ${interaction.user.id}`
      );

      return interaction.reply({
        embeds: [embed("Ticket Claimed", `${interaction.user} is now handling this ticket.`)],
      });
    }

    // CLOSE TICKET AND SAVE TRANSCRIPT
    if (command === "ticketclose") {
      if (!interaction.channel?.name.startsWith("ticket-")) {
        return replyError(interaction, "Use this command inside a support ticket.");
      }

      const ownerId = interaction.channel.topic?.match(/Owner ID: (\d+)/)?.[1];

      if (!ownerId) {
        return replyError(interaction, "Could not identify the ticket owner.");
      }

      if (interaction.user.id !== ownerId && !isTicketStaff(interaction)) {
        return replyError(interaction, "Only the ticket owner or support staff can close this ticket.");
      }

      await interaction.deferReply({ ephemeral: true });

      const messages = [];
      let lastId;

      for (let page = 0; page < 10; page++) {
        const batch = await interaction.channel.messages.fetch({
          limit: 100,
          ...(lastId ? { before: lastId } : {}),
        });

        if (!batch.size) break;

        messages.push(...batch.values());
        lastId = batch.last().id;

        if (batch.size < 100) break;
      }

      messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

      const transcript = messages.map(message => {
        const time = new Date(message.createdTimestamp).toISOString();
        const content = message.content || "[No text content]";
        const attachments = [...message.attachments.values()]
          .map(a => a.url)
          .join(" ");

        return `[${time}] ${message.author.tag}: ${content} ${attachments}`.trim();
      }).join("\n");

      const file = new AttachmentBuilder(
        Buffer.from(transcript || "No messages recorded.", "utf8"),
        { name: `transcript-${interaction.channel.id}.txt` }
      );

      await sendConfigured(
        interaction.guild,
        "logsChannelId",
        embed(
          "Support Ticket Closed",
          `**Channel:** ${interaction.channel.name}\n**Closed by:** ${interaction.user.tag}\n**Owner ID:** ${ownerId}`
        )
      ).catch(() => null);

      const logChannelId = db.config[interaction.guildId]?.logsChannelId;

      if (logChannelId) {
        const logChannel = await interaction.guild.channels.fetch(logChannelId)
          .catch(() => null);

        if (logChannel?.isTextBased()) {
          await logChannel.send({
            embeds: [embed("Ticket Transcript", `Transcript for ${interaction.channel.name}`)],
            files: [file],
          }).catch(console.error);
        }
      }

      delete db.tickets[ownerId];
      saveData();

      await interaction.editReply("Ticket closed. Transcript saved where a log channel is configured.");

      setTimeout(() => {
        interaction.channel.delete("Garden Adventures ticket closed")
          .catch(console.error);
      }, 3000);
    }

    // EVENTS
    if (command === "event") {
      const action = interaction.options.getSubcommand();

      if (action === "create") {
        if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageEvents) &&
            !interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
          return replyError(interaction, "You need Manage Events or Manage Server permission.");
        }

        const id = Date.now().toString(36);
        const name = interaction.options.getString("name");
        const time = interaction.options.getString("time");
        const details = interaction.options.getString("details");

        db.events[id] = {
          name,
          time,
          details,
          creator: interaction.user.id,
          guildId: interaction.guildId,
          attendees: [],
        };

        saveData();

        return interaction.reply({
          embeds: [embed(
            `Event Created: ${name}`,
            `**ID:** \`${id}\`\n**When:** ${time}\n**Details:** ${details}\n\nUse \`/event join id:${id}\` to join.`
          )],
        });
      }

      if (action === "list") {
        const events = Object.entries(db.events)
          .filter(([, event]) => event.guildId === interaction.guildId);

        const description = events.length
          ? events.map(([id, event]) =>
            `**${event.name}**\nID: \`${id}\`\nWhen: ${event.time}\n${event.details}\nParticipants: ${event.attendees.length}`
          ).join("\n\n")
          : "No events have been created yet.";

        return interaction.reply({
          embeds: [embed("Garden Adventures Events", description)],
          ephemeral: true,
        });
      }

      if (action === "join") {
        const id = interaction.options.getString("id");
        const event = db.events[id];

        if (!event || event.guildId !== interaction.guildId) {
          return replyError(interaction, "That event was not found.");
        }

        if (!event.attendees.includes(interaction.user.id)) {
          event.attendees.push(interaction.user.id);
          saveData();
        }

        return interaction.reply({
          content: `You have registered for **${event.name}**.`,
          ephemeral: true,
        });
      }

      if (action === "cancel") {
        if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageEvents) &&
            !interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
          return replyError(interaction, "You need permission to cancel events.");
        }

        const id = interaction.options.getString("id");
        const event = db.events[id];

        if (!event || event.guildId !== interaction.guildId) {
          return replyError(interaction, "That event was not found.");
        }

        delete db.events[id];
        saveData();

        return interaction.reply({
          content: `Event **${event.name}** has been cancelled.`,
        });
      }
    }

    // BALANCE
    if (command === "balance") {
      const user = getProfile(interaction.user.id);
      saveData();

      return interaction.reply({
        embeds: [embed("Garden Wallet", `**Coins:** ${user.coins.toLocaleString()}`)],
        ephemeral: true,
      });
    }

    // DAILY REWARD
    if (command === "daily") {
      const user = getProfile(interaction.user.id);
      const now = Date.now();
      const cooldown = 24 * 60 * 60 * 1000;
      const remaining = cooldown - (now - user.daily);

      if (remaining > 0) {
        const hours = Math.floor(remaining / 3600000);
        const minutes = Math.floor((remaining % 3600000) / 60000);

        return replyError(interaction, `You can claim again in ${hours}h ${minutes}m.`);
      }

      user.coins += 100;
      user.daily = now;
      saveData();

      return interaction.reply({
        embeds: [embed("Daily Garden Reward", `You received **100 coins**.\nNew balance: **${user.coins} coins**.`)],
        ephemeral: true,
      });
    }

    // SHOP
    if (command === "shop") {
      const description = Object.entries(SEEDS).map(([name, crop]) =>
        `**${name.charAt(0).toUpperCase() + name.slice(1)}**\nPrice: ${crop.price} coins | Sale value: ${crop.reward} coins | Grow time: ${crop.growSeconds} seconds`
      ).join("\n\n");

      return interaction.reply({
        embeds: [embed("Garden Seed Shop", description)],
        ephemeral: true,
      });
    }

    // BUY SEEDS
    if (command === "buy") {
      const user = getProfile(interaction.user.id);
      const seed = interaction.options.getString("seed");
      const amount = interaction.options.getInteger("amount");
      const cost = SEEDS[seed].price * amount;

      if (user.coins < cost) {
        return replyError(interaction, `You need ${cost} coins but only have ${user.coins}.`);
      }

      user.coins -= cost;
      user.seeds[seed] = (user.seeds[seed] || 0) + amount;
      saveData();

      return interaction.reply({
        embeds: [embed("Seeds Purchased", `You bought **${amount} ${seed} seed(s)** for ${cost} coins.\nRemaining balance: ${user.coins} coins.`)],
        ephemeral: true,
      });
    }

    // GARDEN
    if (command === "garden") {
      const user = getProfile(interaction.user.id);
      const action = interaction.options.getSubcommand();

      if (action === "view") {
        const plots = user.garden.length
          ? user.garden.map((crop, i) => {
            const ready = Date.now() >= crop.readyAt;
            return `**Plot ${i + 1}: ${crop.seed}** — ${ready ? "Ready to harvest" : `Ready <t:${Math.floor(crop.readyAt / 1000)}:R>`}`;
          }).join("\n")
          : "Your garden is empty. Buy seeds and plant your first crop.";

        const seeds = Object.entries(user.seeds)
          .filter(([, amount]) => amount > 0)
          .map(([name, amount]) => `${name}: ${amount}`)
          .join("\n") || "No seeds";

        return interaction.reply({
          embeds: [embed(
            "Your Garden",
            `${plots}\n\n**Seed Inventory**\n${seeds}\n\n**Coins:** ${user.coins}`
          )],
          ephemeral: true,
        });
      }

      if (action === "plant") {
        const seed = interaction.options.getString("seed");

        if (!user.seeds[seed] || user.seeds[seed] < 1) {
          return replyError(interaction, `You do not have any ${seed} seeds. Use /buy first.`);
        }

        if (user.garden.length >= 10) {
          return replyError(interaction, "Your garden is full. Harvest a crop first.");
        }

        user.seeds[seed]--;
        user.garden.push({
          seed,
          readyAt: Date.now() + SEEDS[seed].growSeconds * 1000,
        });

        saveData();

        return interaction.reply({
          embeds: [embed(
            "Seed Planted",
            `You planted a **${seed}** seed.\nIt will be ready <t:${Math.floor((Date.now() + SEEDS[seed].growSeconds * 1000) / 1000)}:R>.`
          )],
          ephemeral: true,
        });
      }

      if (action === "harvest") {
        const plot = interaction.options.getInteger("plot") - 1;
        const crop = user.garden[plot];

        if (!crop) {
          return replyError(interaction, "That plot is empty.");
        }

        if (Date.now() < crop.readyAt) {
          return replyError(interaction, `Your crop will be ready <t:${Math.floor(crop.readyAt / 1000)}:R>.`);
        }

        user.garden.splice(plot, 1);
        user.inventory ??= {};
        user.inventory[crop.seed] = (user.inventory[crop.seed] || 0) + 1;

        saveData();

        return interaction.reply({
          embeds: [embed(
            "Crop Harvested",
            `You harvested **1 ${crop.seed}**.\nUse \`/sell crop:${crop.seed} amount:1\` to sell it.`
          )],
          ephemeral: true,
        });
      }
    }

    // SELL HARVESTED CROPS
    if (command === "sell") {
      const user = getProfile(interaction.user.id);
      const crop = interaction.options.getString("crop");
      const amount = interaction.options.getInteger("amount");

      user.inventory ??= {};

      if ((user.inventory[crop] || 0) < amount) {
        return replyError(interaction, `You do not have ${amount} harvested ${crop}(s).`);
      }

      const earnings = SEEDS[crop].reward * amount;

      user.inventory[crop] -= amount;
      user.coins += earnings;

      saveData();

      return interaction.reply({
        embeds: [embed(
          "Crops Sold",
          `You sold **${amount} ${crop}(s)** for **${earnings} coins**.\nNew balance: **${user.coins} coins**.`
        )],
        ephemeral: true,
      });
    }

    // PET COLLECTION
    if (command === "pets") {
      const user = getProfile(interaction.user.id);

      const description = user.pets.length
        ? user.pets.map((pet, i) =>
          `**${i + 1}. ${pet.name}** — ${pet.rarity}`
        ).join("\n")
        : "You have no pets yet. Use `/egg buy` to buy an egg.";

      return interaction.reply({
        embeds: [embed("Your Pet Collection", description)],
        ephemeral: true,
      });
    }

    // EGGS
    if (command === "egg") {
      const user = getProfile(interaction.user.id);
      const action = interaction.options.getSubcommand();

      if (action === "buy") {
        const amount = interaction.options.getInteger("amount");
        const cost = amount * 100;

        if (user.coins < cost) {
          return replyError(interaction, `You need ${cost} coins to buy ${amount} egg(s).`);
        }

        user.coins -= cost;
        user.eggs = (user.eggs || 0) + amount;

        saveData();

        return interaction.reply({
          embeds: [embed(
            "Pet Eggs Purchased",
            `You bought **${amount} egg(s)** for ${cost} coins.\nUse \`/egg hatch\` to hatch one.`
          )],
          ephemeral: true,
        });
      }

      if (action === "hatch") {
        if (!user.eggs || user.eggs < 1) {
          return replyError(interaction, "You have no eggs. Use /egg buy first.");
        }

        user.eggs--;
        const pet = choosePet();

        user.pets.push({
          name: pet.name,
          rarity: pet.rarity,
          obtainedAt: Date.now(),
        });

        saveData();

        return interaction.reply({
          embeds: [embed(
            "Egg Hatched",
            `Your egg hatched into a **${pet.name}**!\n**Rarity:** ${pet.rarity}\n**Eggs remaining:** ${user.eggs}`
          ).setColor(pet.rarity === "Legendary" ? GOLD : GREEN)],
        });
      }
    }

    // LEADERBOARD
    if (command === "leaderboard") {
      const entries = Object.entries(db.users)
        .sort((a, b) => b[1].coins - a[1].coins)
        .slice(0, 10);

      if (!entries.length) {
        return interaction.reply({
          embeds: [embed("Garden Leaderboard", "No gardeners have earned coins yet.")],
        });
      }

      const lines = await Promise.all(entries.map(async ([id, data], index) => {
        const user = await client.users.fetch(id).catch(() => null);
        return `**${index + 1}.** ${user?.username || "Unknown gardener"} — ${data.coins.toLocaleString()} coins`;
      }));

      return interaction.reply({
        embeds: [embed("Richest Gardeners", lines.join("\n"))],
      });
    }

  } catch (error) {
    console.error(`Error in /${command}:`, error);
    await replyError(
      interaction,
      "Something went wrong. Check the bot console or contact an administrator."
    ).catch(() => null);
  }
});

// ======================================================
// ERROR HANDLING AND STARTUP
// ======================================================

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
