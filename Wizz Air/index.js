
require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

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
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  PollLayoutType,
} = require("discord.js");

// ============================================================
// COSTA AUTOMATIONS
// Discord.js v14.19+ recommended
// Components V2 | Costa burgundy #650014
// ============================================================

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID;

const BURGUNDY = 0x650014;
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "costa-data.json");

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  throw new Error(
    "Set DISCORD_TOKEN, DISCORD_CLIENT_ID and DISCORD_GUILD_ID."
  );
}

fs.mkdirSync(DATA_DIR, { recursive: true });

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    }
  } catch (error) {
    console.error("Could not read saved data:", error);
  }

  return {
    config: {
      supportRoleId: null,
      supportCategoryId: null,
    },
    tickets: {},
    infractions: {},
    staffNotes: {},
    promotions: [],
    polls: {},
  };
}

const data = loadData();

function saveData() {
  const temporaryFile = DATA_FILE + ".tmp";
  fs.writeFileSync(temporaryFile, JSON.stringify(data, null, 2));
  fs.renameSync(temporaryFile, DATA_FILE);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
  ],
});

const EPHEMERAL_V2 =
  MessageFlags.Ephemeral | MessageFlags.IsComponentsV2;

const PUBLIC_V2 = MessageFlags.IsComponentsV2;

// ============================================================
// COMPONENTS V2 HELPERS
// ============================================================

function makeContainer(title, description, details = []) {
  const container = new ContainerBuilder()
    .setAccentColor(BURGUNDY)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# ☕ ${title}\n${description}`
      )
    );

  for (const detail of details) {
    container.addSeparatorComponents(
      new SeparatorBuilder()
    );

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(detail)
    );
  }

  return container;
}

function safeText(value, max = 1800) {
  return String(value ?? "")
    .replace(/@everyone/g, "@\u200beveryone")
    .replace(/@here/g, "@\u200bhere")
    .slice(0, max);
}

async function privateReply(interaction, title, description, details = []) {
  const payload = {
    components: [makeContainer(title, description, details)],
    flags: EPHEMERAL_V2,
    allowedMentions: { parse: [] },
  };

  if (interaction.deferred || interaction.replied) {
    return interaction.followUp(payload);
  }

  return interaction.reply(payload);
}

async function privateError(interaction, message) {
  return privateReply(interaction, "Costa Automations", message);
}

async function publicV2(channel, title, description, details = [], extra = {}) {
  return channel.send({
    components: [makeContainer(title, description, details)],
    flags: PUBLIC_V2,
    allowedMentions: { parse: [], ...(extra.allowedMentions || {}) },
    ...extra,
  });
}

function isAdministrator(member) {
  return Boolean(
    member?.permissions?.has(PermissionFlagsBits.Administrator)
  );
}

function isSupportStaff(member) {
  if (!member) return false;

  if (isAdministrator(member)) return true;

  const roleId = data.config.supportRoleId;
  return Boolean(roleId && member.roles?.cache?.has(roleId));
}

function makeId() {
  return crypto.randomBytes(5).toString("hex");
}

function formatTimestamp(date = new Date()) {
  const unix = Math.floor(date.getTime() / 1000);
  return `<t:${unix}:F> · <t:${unix}:R>`;
}

function getTicketByChannel(channelId) {
  return Object.values(data.tickets).find(
    ticket => ticket.channelId === channelId && ticket.status === "open"
  );
}

function getActiveTicket(userId) {
  return Object.values(data.tickets).find(
    ticket => ticket.userId === userId && ticket.status === "open"
  );
}

async function fetchUser(userId) {
  try {
    return await client.users.fetch(userId);
  } catch {
    return null;
  }
}

// ============================================================
// SLASH COMMAND DEFINITIONS
// Every slash command requires Administrator permission.
// Replies are ephemeral. Public actions still publish to
// their intended channels.
// ============================================================

const admin = PermissionFlagsBits.Administrator;

const commands = [
  new SlashCommandBuilder()
    .setName("stafflist")
    .setDescription("View the staff team."),

  new SlashCommandBuilder()
    .setName("promote")
    .setDescription("Record a staff promotion.")
    .addUserOption(o => o.setName("member").setDescription("Staff member").setRequired(true))
    .addStringOption(o => o.setName("rank").setDescription("New rank").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(true)),

  new SlashCommandBuilder()
    .setName("demote")
    .setDescription("Record a staff demotion.")
    .addUserOption(o => o.setName("member").setDescription("Staff member").setRequired(true))
    .addStringOption(o => o.setName("rank").setDescription("New rank").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(true)),

  new SlashCommandBuilder()
    .setName("staffnote")
    .setDescription("Manage private staff notes.")
    .addSubcommand(s => s.setName("add").setDescription("Add a staff note.")
      .addUserOption(o => o.setName("member").setDescription("Staff member").setRequired(true))
      .addStringOption(o => o.setName("note").setDescription("Private note").setRequired(true)))
    .addSubcommand(s => s.setName("view").setDescription("View staff notes.")
      .addUserOption(o => o.setName("member").setDescription("Staff member").setRequired(true)))
    .addSubcommand(s => s.setName("remove").setDescription("Remove a staff note.")
      .addUserOption(o => o.setName("member").setDescription("Staff member").setRequired(true))
      .addStringOption(o => o.setName("id").setDescription("Note ID").setRequired(true))),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Issue a moderation warning.")
    .addUserOption(o => o.setName("member").setDescription("Member").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(true)),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout a member.")
    .addUserOption(o => o.setName("member").setDescription("Member").setRequired(true))
    .addIntegerOption(o => o.setName("minutes").setDescription("Duration in minutes (1–40320)").setMinValue(1).setMaxValue(40320).setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(true)),

  new SlashCommandBuilder()
    .setName("untimeout")
    .setDescription("Remove a member's timeout.")
    .addUserOption(o => o.setName("member").setDescription("Member").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(true)),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a member.")
    .addUserOption(o => o.setName("member").setDescription("Member").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(true)),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a member.")
    .addUserOption(o => o.setName("member").setDescription("Member").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(true)),

  new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Unban a user by ID.")
    .addStringOption(o => o.setName("user_id").setDescription("Discord user ID").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(true)),

  new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Delete recent messages.")
    .addIntegerOption(o => o.setName("amount").setDescription("Number of messages (1–100)").setMinValue(1).setMaxValue(100).setRequired(true)),

  new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Set channel slowmode.")
    .addIntegerOption(o => o.setName("seconds").setDescription("Seconds (0–21600)").setMinValue(0).setMaxValue(21600).setRequired(true)),

  new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Lock a text channel.")
    .addChannelOption(o => o.setName("channel").setDescription("Channel to lock").addChannelTypes(ChannelType.GuildText)),

  new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Unlock a text channel.")
    .addChannelOption(o => o.setName("channel").setDescription("Channel to unlock").addChannelTypes(ChannelType.GuildText)),

  new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Publish an announcement.")
    .addChannelOption(o => o.setName("channel").setDescription("Target channel").addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addStringOption(o => o.setName("title").setDescription("Announcement title").setRequired(true))
    .addStringOption(o => o.setName("message").setDescription("Announcement message").setRequired(true)),

  new SlashCommandBuilder()
    .setName("embed")
    .setDescription("Publish a formatted Components V2 message.")
    .addChannelOption(o => o.setName("channel").setDescription("Target channel").addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addStringOption(o => o.setName("title").setDescription("Message title").setRequired(true))
    .addStringOption(o => o.setName("message").setDescription("Message content").setRequired(true)),

  new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Create a Discord poll.")
    .addChannelOption(o => o.setName("channel").setDescription("Target channel").addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addStringOption(o => o.setName("question").setDescription("Poll question").setRequired(true))
    .addStringOption(o => o.setName("option_one").setDescription("First answer").setRequired(true))
    .addStringOption(o => o.setName("option_two").setDescription("Second answer").setRequired(true)),

  new SlashCommandBuilder()
    .setName("infractions")
    .setDescription("View a member's infraction records.")
    .addUserOption(o => o.setName("member").setDescription("Member").setRequired(true)),

  new SlashCommandBuilder()
    .setName("infraction")
    .setDescription("Manage infraction records.")
    .addSubcommand(s => s.setName("add").setDescription("Record an infraction.")
      .addUserOption(o => o.setName("member").setDescription("Member").setRequired(true))
      .addStringOption(o => o.setName("reason").setDescription("Rule violation").setRequired(true))
      .addStringOption(o => o.setName("action").setDescription("Action taken").setRequired(true)))
    .addSubcommand(s => s.setName("remove").setDescription("Remove an infraction.")
      .addUserOption(o => o.setName("member").setDescription("Member").setRequired(true))
      .addStringOption(o => o.setName("id").setDescription("Infraction ID").setRequired(true))
      .addStringOption(o => o.setName("reason").setDescription("Removal reason").setRequired(true))),

  new SlashCommandBuilder()
    .setName("modmail")
    .setDescription("Configure ModMail.")
    .addSubcommand(s => s.setName("config").setDescription("Configure the support role and ticket category.")),
].map(command => command.setDefaultMemberPermissions(admin).toJSON());

// ============================================================
// REGISTER COMMANDS
// ============================================================

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );

  console.log(`Registered ${commands.length} slash commands.`);
}

// ============================================================
// MODMAIL CONFIG PANEL
// ============================================================

async function showModmailConfig(interaction) {
  const roleMenu = new RoleSelectMenuBuilder()
    .setCustomId("modmail_config_role")
    .setPlaceholder("Select the support role")
    .setMinValues(1)
    .setMaxValues(1);

  const categoryMenu = new ChannelSelectMenuBuilder()
    .setCustomId("modmail_config_category")
    .setPlaceholder("Select the ticket channel category")
    .setChannelTypes(ChannelType.GuildCategory)
    .setMinValues(1)
    .setMaxValues(1);

  const container = makeContainer(
    "ModMail Configuration",
    "Configure the automatic Costa Coffee support inbox.",
    [
      `**Support role:** ${data.config.supportRoleId ? `<@&${data.config.supportRoleId}>` : "Not configured"}`,
      `**Ticket category:** ${data.config.supportCategoryId ? `<#${data.config.supportCategoryId}>` : "Not configured"}`,
      "Members can DM this bot to open a support conversation. Support staff can reply in the created channel and close it using the button.",
    ]
  );

  container.addSeparatorComponents(new SeparatorBuilder());
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(roleMenu)
  );
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(categoryMenu)
  );

  return interaction.reply({
    components: [container],
    flags: EPHEMERAL_V2,
    allowedMentions: { parse: [] },
  });
}

// ============================================================
// MODMAIL CHANNEL CREATION
// ============================================================

async function createTicket(user, firstMessage) {
  const { supportRoleId, supportCategoryId } = data.config;

  if (!supportRoleId || !supportCategoryId) {
    await user.send({
      components: [
        makeContainer(
          "Costa Coffee Support",
          "Our support inbox is not configured yet. Please try again later."
        ),
      ],
      flags: PUBLIC_V2,
      allowedMentions: { parse: [] },
    }).catch(() => {});
    return null;
  }

  const guild = await client.guilds.fetch(GUILD_ID);
  const category = await guild.channels.fetch(supportCategoryId).catch(() => null);
  const supportRole = await guild.roles.fetch(supportRoleId).catch(() => null);

  if (!category || category.type !== ChannelType.GuildCategory || !supportRole) {
    console.error("ModMail configuration points to a missing role or category.");
    return null;
  }

  const ticketId = makeId();
  const safeUsername = user.username
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .slice(0, 35) || "member";

  const channel = await guild.channels.create({
    name: `modmail-${safeUsername}`,
    type: ChannelType.GuildText,
    parent: category.id,
    topic: `Costa ModMail | User ID: ${user.id} | Ticket: ${ticketId}`,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageChannels,
        ],
      },
      {
        id: supportRole.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
    ],
  });

  data.tickets[ticketId] = {
    id: ticketId,
    userId: user.id,
    channelId: channel.id,
    status: "open",
    createdAt: new Date().toISOString(),
    closedAt: null,
    closedBy: null,
    claimedBy: null,
  };

  saveData();

  const closeButton = new ButtonBuilder()
    .setCustomId(`modmail_close_${ticketId}`)
    .setLabel("Close ModMail")
    .setStyle(ButtonStyle.Danger);

  const details = [
    `**Member:** ${safeText(user.username, 100)} (<@${user.id}>)`,
    `**User ID:** \`${user.id}\``,
    `**Received:** ${formatTimestamp()}`,
    `**Ticket ID:** \`${ticketId}\``,
    "**Initial message:**",
    safeText(firstMessage.content || "(No text message provided.)"),
  ];

  const container = makeContainer(
    "New Support Enquiry",
    "A member has contacted Costa Coffee Support.",
    details
  );

  container.addSeparatorComponents(new SeparatorBuilder());
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(closeButton)
  );

  await channel.send({
    content: `<@&${supportRole.id}>`,
    components: [container],
    flags: PUBLIC_V2,
    allowedMentions: { roles: [supportRole.id] },
  });

  await user.send({
    components: [
      makeContainer(
        "Costa Coffee Support",
        "Thank you for contacting Costa Coffee Support! Your message has been received and will be reviewed by our support team shortly."
      ),
    ],
    flags: PUBLIC_V2,
    allowedMentions: { parse: [] },
  }).catch(() => {});

  return channel;
}

// ============================================================
// MEMBER DM -> MODMAIL CHANNEL
// ============================================================

client.on("messageCreate", async message => {
  try {
    if (message.author.bot) return;

    // Direct messages sent by members open or update ModMail.
    if (!message.guild) {
      let ticket = getActiveTicket(message.author.id);

      if (!ticket) {
        await createTicket(message.author, message);
        return;
      }

      const channel = await client.channels.fetch(ticket.channelId).catch(() => null);
      if (!channel) return;

      const details = [
        `**From:** ${safeText(message.author.username, 100)}`,
        `**Received:** ${formatTimestamp(message.createdAt)}`,
        safeText(message.content || "(No text message provided.)"),
      ];

      if (message.attachments.size) {
        details.push(
          "**Attachments:**",
          ...[...message.attachments.values()].map(a => a.url).slice(0, 5)
        );
      }

      await publicV2(channel, "Member Message", "A member sent a new message.", details);

      // Forward supported attachments as links; avoid reposting files automatically.
      if (message.attachments.size) {
        await channel.send({
          content: [...message.attachments.values()]
            .slice(0, 5)
            .map(a => a.url)
            .join("\n"),
          allowedMentions: { parse: [] },
        });
      }

      return;
    }

    // Ignore messages outside the configured guild.
    if (message.guild.id !== GUILD_ID) return;

    // A staff message in an open ModMail channel is forwarded to the member.
    const ticket = getTicketByChannel(message.channel.id);
    if (!ticket) return;

    if (!isSupportStaff(message.member)) return;

    const user = await fetchUser(ticket.userId);
    if (!user) {
      await publicV2(
        message.channel,
        "Delivery Failed",
        "The member account could not be reached."
      );
      return;
    }

    const body = safeText(message.content || "(No text message provided.)");

    const details = [
      `**Sent by:** ${safeText(message.author.username, 100)}`,
      `**Staff user ID:** \`${message.author.id}\``,
      `**Message:**`,
      body,
      `**Time:** ${formatTimestamp(message.createdAt)}`,
    ];

    if (message.attachments.size) {
      details.push(
        "**Attachments:**",
        ...[...message.attachments.values()].map(a => a.url).slice(0, 5)
      );
    }

    await user.send({
      components: [
        makeContainer(
          "Costa Coffee Support",
          "A member of our support team has replied to your enquiry.",
          details
        ),
      ],
      flags: PUBLIC_V2,
      allowedMentions: { parse: [] },
    });

    await message.react("☕").catch(() => {});
  } catch (error) {
    console.error("ModMail message handling failed:", error);
  }
});

// ============================================================
// INTERACTIONS
// ============================================================

client.on("interactionCreate", async interaction => {
  try {
    // --------------------------------------------------------
    // Select menus: ModMail configuration
    // --------------------------------------------------------
    if (interaction.isRoleSelectMenu() &&
        interaction.customId === "modmail_config_role") {
      if (!isAdministrator(interaction.member)) {
        return privateError(interaction, "Administrator permission is required.");
      }

      data.config.supportRoleId = interaction.values[0];
      saveData();

      return privateReply(
        interaction,
        "Support Role Saved",
        `The ModMail support role is now <@&${interaction.values[0]}>.`
      );
    }

    if (interaction.isChannelSelectMenu() &&
        interaction.customId === "modmail_config_category") {
      if (!isAdministrator(interaction.member)) {
        return privateError(interaction, "Administrator permission is required.");
      }

      const categoryId = interaction.values[0];
      const category = await interaction.guild.channels.fetch(categoryId).catch(() => null);

      if (!category || category.type !== ChannelType.GuildCategory) {
        return privateError(interaction, "Please select a valid category.");
      }

      data.config.supportCategoryId = categoryId;
      saveData();

      return privateReply(
        interaction,
        "Ticket Category Saved",
        `New ModMail channels will be created in <#${categoryId}>.`
      );
    }

    // --------------------------------------------------------
    // Close button: only support staff / administrators
    // --------------------------------------------------------
    if (interaction.isButton() &&
        interaction.customId.startsWith("modmail_close_")) {
      const ticketId = interaction.customId.replace("modmail_close_", "");
      const ticket = data.tickets[ticketId];

      if (!ticket || ticket.status !== "open") {
        return privateReply(
          interaction,
          "ModMail Already Closed",
          "This conversation is no longer open."
        );
      }

      if (!isSupportStaff(interaction.member)) {
        return privateError(
          interaction,
          "Only authorised support staff can close this conversation."
        );
      }

      ticket.status = "closed";
      ticket.closedAt = new Date().toISOString();
      ticket.closedBy = interaction.user.id;
      saveData();

      const user = await fetchUser(ticket.userId);

      if (user) {
        await user.send({
          components: [
            makeContainer(
              "Costa Coffee Support",
              "Your ModMail has been closed.",
              [
                "Thank you for contacting Costa Coffee Support. Your conversation has now been closed by our support team.",
                "If you need further assistance, you can send us another direct message to open a new support conversation.",
                `**Closed by:** ${safeText(interaction.user.username, 100)}`,
                `**Closed at:** ${formatTimestamp()}`,
              ]
            ),
          ],
          flags: PUBLIC_V2,
          allowedMentions: { parse: [] },
        }).catch(() => {});
      }

      await interaction.update({
        components: [
          makeContainer(
            "ModMail Closed",
            "This support conversation has been closed.",
            [
              `**Closed by:** ${safeText(interaction.user.username, 100)}`,
              `**Closed at:** ${formatTimestamp()}`,
              `**Ticket ID:** \`${ticketId}\``,
            ]
          ),
        ],
        flags: PUBLIC_V2,
        allowedMentions: { parse: [] },
      });

      return;
    }

    // --------------------------------------------------------
    // Slash commands
    // --------------------------------------------------------
    if (!interaction.isChatInputCommand()) return;

    // All slash commands require Administrator permissions.
    if (!isAdministrator(interaction.member)) {
      return privateError(
        interaction,
        "You need the Discord Administrator permission to use this command."
      );
    }

    const { commandName } = interaction;
    const guild = interaction.guild;

    if (!guild) {
      return privateError(interaction, "This command can only be used in the server.");
    }

    // --------------------------------------------------------
    // /modmail config
    // --------------------------------------------------------
    if (commandName === "modmail") {
      if (interaction.options.getSubcommand() === "config") {
        return showModmailConfig(interaction);
      }
    }

    // --------------------------------------------------------
    // /stafflist
    // --------------------------------------------------------
    if (commandName === "stafflist") {
      const members = await guild.members.fetch();

      const staff = members
        .filter(member =>
          !member.user.bot &&
          member.roles.cache.size > 1
        )
        .map(member => ({
          name: member.displayName,
          roles: member.roles.cache
            .filter(role => role.id !== guild.id)
            .map(role => role.name),
        }))
        .slice(0, 50);

      const lines = staff.map(member =>
        `**${safeText(member.name, 80)}** — ${safeText(member.roles.join(", ") || "No roles", 200)}`
      );

      return privateReply(
        interaction,
        "Staff List",
        lines.length ? lines.join("\n") : "No staff members found."
      );
    }

    // --------------------------------------------------------
    // /promote and /demote
    // --------------------------------------------------------
    if (commandName === "promote" || commandName === "demote") {
      const member = interaction.options.getUser("member", true);
      const rank = interaction.options.getString("rank", true);
      const reason = interaction.options.getString("reason", true);

      data.promotions.push({
        id: makeId(),
        type: commandName,
        memberId: member.id,
        rank,
        reason,
        issuedBy: interaction.user.id,
        createdAt: new Date().toISOString(),
      });

      saveData();

      return privateReply(
        interaction,
        commandName === "promote" ? "Promotion Recorded" : "Demotion Recorded",
        `**Member:** <@${member.id}>\n**Rank:** ${safeText(rank)}\n**Reason:** ${safeText(reason)}\n**Recorded by:** <@${interaction.user.id}>`
      );
    }

    // --------------------------------------------------------
    // /staffnote add|view|remove
    // --------------------------------------------------------
    if (commandName === "staffnote") {
      const subcommand = interaction.options.getSubcommand();
      const member = interaction.options.getUser("member", true);

      if (!data.staffNotes[member.id]) {
        data.staffNotes[member.id] = [];
      }

      if (subcommand === "add") {
        const note = interaction.options.getString("note", true);
        const record = {
          id: makeId(),
          note,
          authorId: interaction.user.id,
          createdAt: new Date().toISOString(),
        };

        data.staffNotes[member.id].push(record);
        saveData();

        return privateReply(
          interaction,
          "Staff Note Added",
          `**Member:** <@${member.id}>\n**Note ID:** \`${record.id}\`\n**Note:** ${safeText(note)}`
        );
      }

      if (subcommand === "view") {
        const notes = data.staffNotes[member.id];

        if (!notes.length) {
          return privateReply(interaction, "Staff Notes", "No notes recorded for this member.");
        }

        return privateReply(
          interaction,
          "Staff Notes",
          notes.slice(-10).map(n =>
            `**ID:** \`${n.id}\`\n**Note:** ${safeText(n.note, 500)}\n**Author:** <@${n.authorId}>\n**Date:** ${formatTimestamp(new Date(n.createdAt))}`
          ).join("\n\n")
        );
      }

      if (subcommand === "remove") {
        const id = interaction.options.getString("id", true);
        const before = data.staffNotes[member.id].length;

        data.staffNotes[member.id] =
          data.staffNotes[member.id].filter(note => note.id !== id);

        if (before === data.staffNotes[member.id].length) {
          return privateError(interaction, "No staff note found with that ID.");
        }

        saveData();
        return privateReply(interaction, "Staff Note Removed", `Removed note \`${id}\` from <@${member.id}>.`);
      }
    }

    // --------------------------------------------------------
    // INFRACTIONS
    // --------------------------------------------------------
    if (commandName === "infractions") {
      const member = interaction.options.getUser("member", true);
      const records = data.infractions[member.id] || [];

      if (!records.length) {
        return privateReply(
          interaction,
          "Infractions",
          `No infractions are recorded for <@${member.id}>.`
        );
      }

      return privateReply(
        interaction,
        "Infraction Records",
        `**Member:** <@${member.id}>\n\n` +
          records.slice(-15).map(record =>
            `**ID:** \`${record.id}\`\n**Reason:** ${safeText(record.reason, 500)}\n**Action:** ${safeText(record.action, 200)}\n**Issued by:** <@${record.issuedBy}>\n**Date:** ${formatTimestamp(new Date(record.createdAt))}`
          ).join("\n\n")
      );
    }

    if (commandName === "infraction") {
      const subcommand = interaction.options.getSubcommand();
      const member = interaction.options.getUser("member", true);

      if (!data.infractions[member.id]) {
        data.infractions[member.id] = [];
      }

      if (subcommand === "add") {
        const reason = interaction.options.getString("reason", true);
        const action = interaction.options.getString("action", true);

        const record = {
          id: makeId(),
          reason,
          action,
          issuedBy: interaction.user.id,
          createdAt: new Date().toISOString(),
        };

        data.infractions[member.id].push(record);
        saveData();

        return privateReply(
          interaction,
          "Infraction Recorded",
          `**Member:** <@${member.id}>\n**Infraction ID:** \`${record.id}\`\n**Reason:** ${safeText(reason)}\n**Action:** ${safeText(action)}`
        );
      }

      if (subcommand === "remove") {
        const id = interaction.options.getString("id", true);
        const reason = interaction.options.getString("reason", true);
        const records = data.infractions[member.id];
        const existing = records.find(record => record.id === id);

        if (!existing) {
          return privateError(interaction, "No infraction found with that ID for this member.");
        }

        data.infractions[member.id] = records.filter(record => record.id !== id);
        saveData();

        return privateReply(
          interaction,
          "Infraction Removed",
          `**Member:** <@${member.id}>\n**Removed ID:** \`${id}\`\n**Removal reason:** ${safeText(reason)}\n**Removed by:** <@${interaction.user.id}>`
        );
      }
    }

    // --------------------------------------------------------
    // Moderation commands
    // --------------------------------------------------------
    if (["warn", "timeout", "untimeout", "kick", "ban"].includes(commandName)) {
      const user = interaction.options.getUser("member", true);
      const member = await guild.members.fetch(user.id).catch(() => null);
      const reason = interaction.options.getString("reason", true);

      if (!member) {
        return privateError(interaction, "That member is not in this server.");
      }

      if (member.id === interaction.user.id || member.id === client.user.id) {
        return privateError(interaction, "You cannot target yourself or the bot.");
      }

      if (
        interaction.member.roles.highest.comparePositionTo(member.roles.highest) <= 0 &&
        interaction.guild.ownerId !== interaction.user.id
      ) {
        return privateError(interaction, "Your highest role must be above the target member's highest role.");
      }

      if (commandName === "warn") {
        const record = {
          id: makeId(),
          reason,
          action: "Warning",
          issuedBy: interaction.user.id,
          createdAt: new Date().toISOString(),
        };

        if (!data.infractions[user.id]) data.infractions[user.id] = [];
        data.infractions[user.id].push(record);
        saveData();

        return privateReply(
          interaction,
          "Warning Issued",
          `**Member:** <@${user.id}>\n**Reason:** ${safeText(reason)}\n**Infraction ID:** \`${record.id}\``
        );
      }

      if (commandName === "timeout") {
        const minutes = interaction.options.getInteger("minutes", true);
        await member.timeout(minutes * 60 * 1000, reason);

        if (!data.infractions[user.id]) data.infractions[user.id] = [];
        data.infractions[user.id].push({
          id: makeId(),
          reason,
          action: `Timeout (${minutes} minutes)`,
          issuedBy: interaction.user.id,
          createdAt: new Date().toISOString(),
        });
        saveData();

        return privateReply(
          interaction,
          "Member Timed Out",
          `**Member:** <@${user.id}>\n**Duration:** ${minutes} minutes\n**Reason:** ${safeText(reason)}`
        );
      }

      if (commandName === "untimeout") {
        await member.timeout(null, reason);
        return privateReply(interaction, "Timeout Removed", `Removed timeout for <@${user.id}>.`);
      }

      if (commandName === "kick") {
        await member.kick(reason);

        if (!data.infractions[user.id]) data.infractions[user.id] = [];
        data.infractions[user.id].push({
          id: makeId(),
          reason,
          action: "Kick",
          issuedBy: interaction.user.id,
          createdAt: new Date().toISOString(),
        });
        saveData();

        return privateReply(interaction, "Member Kicked", `Kicked <@${user.id}>.\n**Reason:** ${safeText(reason)}`);
      }

      if (commandName === "ban") {
        await member.ban({ reason });

        if (!data.infractions[user.id]) data.infractions[user.id] = [];
        data.infractions[user.id].push({
          id: makeId(),
          reason,
          action: "Ban",
          issuedBy: interaction.user.id,
          createdAt: new Date().toISOString(),
        });
        saveData();

        return privateReply(interaction, "Member Banned", `Banned <@${user.id}>.\n**Reason:** ${safeText(reason)}`);
      }
    }

    if (commandName === "unban") {
      const userId = interaction.options.getString("user_id", true);
      const reason = interaction.options.getString("reason", true);

      if (!/^\d{17,20}$/.test(userId)) {
        return privateError(interaction, "Enter a valid Discord user ID.");
      }

      await guild.members.unban(userId, reason);
      return privateReply(interaction, "User Unbanned", `Unbanned user \`${userId}\`.\n**Reason:** ${safeText(reason)}`);
    }

    if (commandName === "purge") {
      const amount = interaction.options.getInteger("amount", true);

      if (!interaction.channel?.isTextBased() || !interaction.channel.bulkDelete) {
        return privateError(interaction, "This command cannot be used in this channel.");
      }

      const deleted = await interaction.channel.bulkDelete(amount, true);

      return privateReply(
        interaction,
        "Messages Deleted",
        `Deleted **${deleted.size}** messages. Messages older than 14 days cannot be bulk-deleted.`
      );
    }

    if (commandName === "slowmode") {
      const seconds = interaction.options.getInteger("seconds", true);

      if (!interaction.channel?.setRateLimitPerUser) {
        return privateError(interaction, "This channel does not support slowmode.");
      }

      await interaction.channel.setRateLimitPerUser(seconds);
      return privateReply(interaction, "Slowmode Updated", `Slowmode is now **${seconds} seconds**.`);
    }

    if (commandName === "lock" || commandName === "unlock") {
      const channel =
        interaction.options.getChannel("channel") || interaction.channel;

      if (!channel?.permissionOverwrites) {
        return privateError(interaction, "Choose a channel that supports permission overwrites.");
      }

      await channel.permissionOverwrites.edit(
        guild.roles.everyone,
        {
          SendMessages: commandName === "unlock" ? null : false,
        }
      );

      return privateReply(
        interaction,
        commandName === "lock" ? "Channel Locked" : "Channel Unlocked",
        `${channel} has been ${commandName === "lock" ? "locked" : "unlocked"}.`
      );
    }

    // --------------------------------------------------------
    // Announcements and formatted messages
    // --------------------------------------------------------
    if (commandName === "announce" || commandName === "embed") {
      const channel = interaction.options.getChannel("channel", true);
      const title = interaction.options.getString("title", true);
      const message = interaction.options.getString("message", true);

      await publicV2(
        channel,
        safeText(title, 200),
        safeText(message, 3500),
        [`Published by ${safeText(interaction.user.username, 100)} · ${formatTimestamp()}`]
      );

      return privateReply(
        interaction,
        "Message Published",
        `Your ${commandName === "announce" ? "announcement" : "formatted message"} was published in ${channel}.`
      );
    }

    if (commandName === "poll") {
      const channel = interaction.options.getChannel("channel", true);
      const question = interaction.options.getString("question", true);
      const optionOne = interaction.options.getString("option_one", true);
      const optionTwo = interaction.options.getString("option_two", true);

      // Native Discord poll; voters remain anonymous unless Discord poll settings change.
      await channel.send({
        poll: {
          question: { text: safeText(question, 300) },
          answers: [
            { text: safeText(optionOne, 55) },
            { text: safeText(optionTwo, 55) },
          ],
          duration: 24,
          allowMultiselect: false,
          layoutType: PollLayoutType.Default,
        },
        allowedMentions: { parse: [] },
      });

      return privateReply(
        interaction,
        "Poll Published",
        `Your poll was published in ${channel}.`
      );
    }
  } catch (error) {
    console.error("Interaction error:", error);

    if (interaction.isRepliable()) {
      const message = error.code === 50013
        ? "The bot is missing a required Discord permission."
        : "The operation failed. Check the bot logs and its Discord permissions.";

      if (interaction.deferred || interaction.replied) {
        await privateError(interaction, message).catch(() => {});
      } else {
        await privateError(interaction, message).catch(() => {});
      }
    }
  }
});

// ============================================================
// READY
// ============================================================

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  try {
    await registerCommands();
  } catch (error) {
    console.error("Slash command registration failed:", error);
  }
});

client.login(TOKEN);
