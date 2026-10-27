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
// Discord.js v14.19+
// Components V2 | Costa burgundy #650014
// ============================================================

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID;

const BURGUNDY = 0x650014;
const SUCCESS_REACTION = "✅";
const ADMIN = PermissionFlagsBits.Administrator;

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
      const saved = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

      return {
        config: {
          supportRoleId: null,
          supportCategoryId: null,
          ...(saved.config || {}),
        },
        tickets: saved.tickets || {},
        infractions: saved.infractions || {},
        staffNotes: saved.staffNotes || {},
        promotions: saved.promotions || [],
        polls: saved.polls || {},
      };
    }
  } catch (error) {
    console.error("Could not load saved data:", error);
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
const pendingRoleActions = new Map();
const userMessageLocks = new Set();

function saveData() {
  const temporaryFile = `${DATA_FILE}.tmp`;
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
  partials: [Partials.Channel, Partials.Message],
});

const EPHEMERAL_V2 =
  MessageFlags.Ephemeral | MessageFlags.IsComponentsV2;

const PUBLIC_V2 = MessageFlags.IsComponentsV2;

// ============================================================
// GENERAL HELPERS
// ============================================================

function makeId() {
  return crypto.randomBytes(5).toString("hex");
}

function formatTimestamp(date = new Date()) {
  const unix = Math.floor(date.getTime() / 1000);
  return `<t:${unix}:F> (<t:${unix}:R>)`;
}

function safeText(value, max = 1800) {
  return String(value ?? "")
    .replace(/@everyone/g, "@\u200beveryone")
    .replace(/@here/g, "@\u200bhere")
    .slice(0, max);
}

function makeContainer(title, description, details = []) {
  const container = new ContainerBuilder()
    .setAccentColor(BURGUNDY)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# ${safeText(title, 200)}\n${safeText(description, 3000)}`
      )
    );

  for (const detail of details) {
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(String(detail).slice(0, 4000))
    );
  }

  return container;
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
    ...extra,
    components: [
      makeContainer(title, description, details),
    ],
    flags: PUBLIC_V2,
    allowedMentions: {
      parse: [],
      ...(extra.allowedMentions || {}),
    },
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

function getActiveTicket(userId) {
  return Object.values(data.tickets).find(
    ticket =>
      ticket.userId === userId &&
      ticket.status === "open"
  );
}

function getTicketByChannel(channelId) {
  return Object.values(data.tickets).find(
    ticket =>
      ticket.channelId === channelId &&
      ticket.status === "open"
  );
}

async function fetchUser(userId) {
  try {
    return await client.users.fetch(userId);
  } catch {
    return null;
  }
}

async function reactSuccess(message) {
  try {
    await message.react(SUCCESS_REACTION);
  } catch (error) {
    console.error("Could not add ModMail success reaction:", error);
  }
}

async function sendUserDM(user, title, description, details = []) {
  return user.send({
    components: [
      makeContainer(title, description, details),
    ],
    flags: PUBLIC_V2,
    allowedMentions: { parse: [] },
  });
}

function getMessageDetails(message) {
  const details = [
    `**Username:** ${safeText(message.author.username, 100)}`,
    `**Display name:** ${safeText(
      message.author.globalName || message.author.username,
      100
    )}`,
    `**User mention:** <@${message.author.id}>`,
    `**User ID:** \`${message.author.id}\``,
    `**Account created:** ${formatTimestamp(message.author.createdAt)}`,
    `**Message received:** ${formatTimestamp(message.createdAt)}`,
    "**Original message:**",
    safeText(message.content || "(No text message provided.)", 3000),
  ];

  if (message.attachments.size) {
    details.push(
      "**Attachments:**",
      ...[...message.attachments.values()]
        .slice(0, 5)
        .map(attachment => safeText(attachment.url, 500))
    );
  }

  return details;
}

// ============================================================
// MODMAIL CONFIGURATION
// ============================================================

function buildModmailConfigPanel() {
  const roleMenu = new RoleSelectMenuBuilder()
    .setCustomId("modmail_config_role")
    .setPlaceholder("Select the support role")
    .setMinValues(1)
    .setMaxValues(1);

  const categoryMenu = new ChannelSelectMenuBuilder()
    .setCustomId("modmail_config_category")
    .setPlaceholder("Select the ticket category")
    .setChannelTypes(ChannelType.GuildCategory)
    .setMinValues(1)
    .setMaxValues(1);

  const container = makeContainer(
    "ModMail Configuration",
    "Configure the Costa Coffee support inbox.",
    [
      `**Support role:** ${
        data.config.supportRoleId
          ? `<@&${data.config.supportRoleId}>`
          : "Not configured"
      }`,
      `**Ticket category:** ${
        data.config.supportCategoryId
          ? `<#${data.config.supportCategoryId}>`
          : "Not configured"
      }`,
      "**How it works:** Members DM the bot. The bot creates a private ticket, forwards messages to staff, and lets authorised staff close the conversation.",
    ]
  );

  container.addSeparatorComponents(new SeparatorBuilder());
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(roleMenu)
  );
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(categoryMenu)
  );

  return container;
}

async function showModmailConfig(interaction) {
  return interaction.reply({
    components: [buildModmailConfigPanel()],
    flags: EPHEMERAL_V2,
    allowedMentions: { parse: [] },
  });
}

async function handleModmailConfigSelection(interaction, type) {
  if (!interaction.inGuild() || !isAdministrator(interaction.member)) {
    return privateError(
      interaction,
      "You need Administrator permission to configure ModMail."
    );
  }

  if (type === "role") {
    const roleId = interaction.values[0];
    const role = await interaction.guild.roles.fetch(roleId).catch(() => null);

    if (
      !role ||
      role.id === interaction.guild.id ||
      role.managed
    ) {
      return privateError(interaction, "Choose a valid support role.");
    }

    data.config.supportRoleId = roleId;
  } else if (type === "category") {
    const categoryId = interaction.values[0];
    const category = await interaction.guild.channels
      .fetch(categoryId)
      .catch(() => null);

    if (
      !category ||
      category.type !== ChannelType.GuildCategory
    ) {
      return privateError(interaction, "Choose a valid ticket category.");
    }

    data.config.supportCategoryId = categoryId;
  }

  try {
    saveData();
  } catch (error) {
    console.error("Could not save ModMail configuration:", error);
    return privateError(
      interaction,
      "The configuration could not be saved. Check the bot's file permissions."
    );
  }

  // Update the original configuration panel so the saved settings are visible.
  return interaction.update({
    components: [buildModmailConfigPanel()],
    allowedMentions: { parse: [] },
  });
}

// ============================================================
// MODMAIL TICKET CREATION
// ============================================================

async function createTicket(user, firstMessage) {
  const { supportRoleId, supportCategoryId } = data.config;

  if (!supportRoleId || !supportCategoryId) {
    await sendUserDM(
      user,
      "Costa Coffee Support",
      "Our support inbox is not configured yet. Please try again later."
    ).catch(() => {});

    console.error("Cannot open ModMail ticket: configuration is incomplete.");
    return null;
  }

  const guild = await client.guilds.fetch(GUILD_ID);
  const category = await guild.channels
    .fetch(supportCategoryId)
    .catch(() => null);
  const supportRole = await guild.roles
    .fetch(supportRoleId)
    .catch(() => null);
  const botMember = await guild.members.fetchMe().catch(() => null);

  if (
    !category ||
    category.type !== ChannelType.GuildCategory ||
    !supportRole ||
    !botMember
  ) {
    console.error("ModMail role, category or bot member is invalid.");
    await sendUserDM(
      user,
      "Costa Coffee Support",
      "We could not open your support ticket. Please try again later."
    ).catch(() => {});
    return null;
  }

  const botPermissions = category.permissionsFor(botMember);

  if (
    !botPermissions?.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.ManageChannels,
    ])
  ) {
    console.error("Bot needs View Channel and Manage Channels permissions.");
    await sendUserDM(
      user,
      "Costa Coffee Support",
      "The support inbox is temporarily unavailable. Please try again later."
    ).catch(() => {});
    return null;
  }

  const ticketId = makeId();
  const safeUsername = user.username
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .slice(0, 35) || "member";

  let channel;

  try {
    channel = await guild.channels.create({
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
            PermissionFlagsBits.AddReactions,
          ],
        },
        {
          id: supportRole.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AddReactions,
          ],
        },
      ],
      reason: `New ModMail ticket ${ticketId}`,
    });

    data.tickets[ticketId] = {
      id: ticketId,
      userId: user.id,
      channelId: channel.id,
      status: "open",
      createdAt: new Date().toISOString(),
      closedAt: null,
      closedBy: null,
    };

    saveData();

    const member = await guild.members.fetch(user.id).catch(() => null);
    const details = getMessageDetails(firstMessage);

    details.splice(
      4,
      0,
      `**Server joined:** ${
        member
          ? formatTimestamp(member.joinedAt || new Date())
          : "Not available"
      }`,
      `**Ticket ID:** \`${ticketId}\``
    );

    const closeButton = new ButtonBuilder()
      .setCustomId(`modmail_close_${ticketId}`)
      .setLabel("Close ModMail")
      .setStyle(ButtonStyle.Danger);

    const container = makeContainer(
      "New Support Enquiry",
      "A member has contacted Costa Coffee Support.",
      [
        `**Support team:** <@&${supportRole.id}>`,
        ...details,
      ]
    );

    container.addSeparatorComponents(new SeparatorBuilder());
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(closeButton)
    );

    // Components V2 cannot be sent with ordinary message content.
    // Put the role mention inside the V2 container instead.
    await channel.send({
      components: [container],
      flags: PUBLIC_V2,
      allowedMentions: {
        parse: [],
        roles: [supportRole.id],
      },
    });

    // The ticket is now created and the original message is in the staff channel.
    await reactSuccess(firstMessage);

    // A failed confirmation DM must not delete a valid ticket.
    await sendUserDM(
      user,
      "Costa Coffee Support",
      "Staff will get back to you shortly.",
      [
        "Thank you for contacting Costa Coffee Support. Your message has been received and will be reviewed by our support team shortly.",
        `**Ticket reference:** \`${ticketId}\``,
      ]
    ).catch(error => {
      console.error("Could not send ModMail confirmation DM:", error);
    });

    return channel;
  } catch (error) {
    console.error("Could not create ModMail ticket:", error);

    if (data.tickets[ticketId]) {
      delete data.tickets[ticketId];
      saveData();
    }

    if (channel) {
      await channel.delete("ModMail ticket setup failed").catch(() => {});
    }

    await sendUserDM(
      user,
      "Costa Coffee Support",
      "We could not open your support ticket just now. Please try again later."
    ).catch(() => {});

    return null;
  }
}

// ============================================================
// FORWARD MEMBER FOLLOW-UP MESSAGES
// ============================================================

async function forwardMemberMessage(message, ticket) {
  const channel = await client.channels
    .fetch(ticket.channelId)
    .catch(() => null);

  if (!channel || !channel.isTextBased()) {
    ticket.status = "closed";
    ticket.closedAt = new Date().toISOString();
    ticket.closedBy = "system";
    saveData();

    await sendUserDM(
      message.author,
      "Costa Coffee Support",
      "Your previous support conversation is no longer available. Please send your message again to open a new ticket."
    ).catch(() => {});

    return false;
  }

  const details = [
    `**Username:** ${safeText(message.author.username, 100)}`,
    `**User ID:** \`${message.author.id}\``,
    `**Received:** ${formatTimestamp(message.createdAt)}`,
    "**Message:**",
    safeText(message.content || "(No text message provided.)", 3000),
  ];

  if (message.attachments.size) {
    details.push(
      "**Attachments:**",
      ...[...message.attachments.values()]
        .slice(0, 5)
        .map(attachment => safeText(attachment.url, 500))
    );
  }

  try {
    await publicV2(
      channel,
      "Member Message",
      "A member sent a message to the support team.",
      details
    );

    await reactSuccess(message);
    return true;
  } catch (error) {
    console.error("Could not forward member ModMail message:", error);
    await sendUserDM(
      message.author,
      "Costa Coffee Support",
      "Your latest message could not be forwarded. Please try again shortly."
    ).catch(() => {});
    return false;
  }
}

// ============================================================
// MEMBER DMS AND STAFF REPLIES
// ============================================================

client.on("messageCreate", async originalMessage => {
  let message = originalMessage;

  try {
    if (message.partial) {
      message = await message.fetch();
    }

    if (message.author.bot || message.webhookId) return;

    // --------------------------------------------------------
    // MEMBER DIRECT MESSAGES
    // --------------------------------------------------------
    if (!message.guild) {
      const userId = message.author.id;

      // Prevent two rapid DMs from creating two tickets.
      if (userMessageLocks.has(userId)) return;
      userMessageLocks.add(userId);

      try {
        let ticket = getActiveTicket(userId);

        if (!ticket) {
          await createTicket(message.author, message);
          return;
        }

        await forwardMemberMessage(message, ticket);
      } finally {
        userMessageLocks.delete(userId);
      }

      return;
    }

    // --------------------------------------------------------
    // STAFF MESSAGES IN THE CONFIGURED SERVER
    // --------------------------------------------------------
    if (message.guild.id !== GUILD_ID) return;

    const ticket = getTicketByChannel(message.channel.id);
    if (!ticket) return;

    if (!isSupportStaff(message.member)) return;

    const user = await fetchUser(ticket.userId);

    if (!user) {
      await publicV2(
        message.channel,
        "Delivery Failed",
        "The member account could not be reached. The message was not delivered."
      );
      return;
    }

    const details = [
      `**Sent by:** ${safeText(message.author.username, 100)}`,
      `**Staff user ID:** \`${message.author.id}\``,
      "**Message:**",
      safeText(message.content || "(No text message provided.)", 3000),
      `**Time:** ${formatTimestamp(message.createdAt)}`,
    ];

    if (message.attachments.size) {
      details.push(
        "**Attachments:**",
        ...[...message.attachments.values()]
          .slice(0, 5)
          .map(attachment => safeText(attachment.url, 500))
      );
    }

    try {
      await sendUserDM(
        user,
        "Costa Coffee Support",
        "A member of our support team has replied to your enquiry.",
        details
      );

      await reactSuccess(message);
    } catch (error) {
      console.error("Could not deliver staff reply:", error);

      await publicV2(
        message.channel,
        "Delivery Failed",
        "The reply could not be delivered to the member. They may have disabled direct messages."
      );
    }
  } catch (error) {
    console.error("ModMail message handler failed:", error);
  }
});

// ============================================================
// STAFF ROLE SELECTOR
// ============================================================

async function showRoleAction(interaction, action) {
  const user = interaction.options.getUser("member", true);
  const reason = interaction.options.getString("reason", true);

  if (user.id === interaction.user.id || user.bot) {
    return privateError(interaction, "Choose a different, non-bot member.");
  }

  const target = await interaction.guild.members
    .fetch(user.id)
    .catch(() => null);

  if (!target) {
    return privateError(
      interaction,
      "That user is not a member of this server."
    );
  }

  const actionId = makeId();

  pendingRoleActions.set(actionId, {
    action,
    targetId: user.id,
    actorId: interaction.user.id,
    reason,
    guildId: interaction.guildId,
    createdAt: Date.now(),
  });

  const menu = new RoleSelectMenuBuilder()
    .setCustomId(`staff_role_${actionId}`)
    .setPlaceholder(
      action === "promote"
        ? "Select the role to assign"
        : "Select the role to remove"
    )
    .setMinValues(1)
    .setMaxValues(1);

  const container = makeContainer(
    action === "promote" ? "Promote Staff Member" : "Demote Staff Member",
    action === "promote"
      ? "Select the Discord role to assign to this member."
      : "Select the Discord role to remove from this member.",
    [
      `**Member:** <@${user.id}>`,
      `**Reason:** ${safeText(reason, 500)}`,
    ]
  );

  container.addSeparatorComponents(new SeparatorBuilder());
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(menu)
  );

  return interaction.reply({
    components: [container],
    flags: EPHEMERAL_V2,
    allowedMentions: { parse: [] },
  });
}

async function handleStaffRoleSelect(interaction) {
  const actionId = interaction.customId.replace("staff_role_", "");
  const pending = pendingRoleActions.get(actionId);

  if (!pending) {
    return privateError(
      interaction,
      "This role selection has expired. Run the command again."
    );
  }

  if (
    pending.actorId !== interaction.user.id ||
    pending.guildId !== interaction.guildId
  ) {
    return privateError(
      interaction,
      "This role selector belongs to another administrator."
    );
  }

  if (Date.now() - pending.createdAt > 15 * 60 * 1000) {
    pendingRoleActions.delete(actionId);
    return privateError(interaction, "This role selection has expired.");
  }

  if (!isAdministrator(interaction.member)) {
    return privateError(interaction, "Administrator permission is required.");
  }

  const guild = interaction.guild;
  const role = await guild.roles.fetch(interaction.values[0]).catch(() => null);
  const target = await guild.members.fetch(pending.targetId).catch(() => null);
  const actor = await guild.members.fetch(interaction.user.id).catch(() => null);
  const botMember = await guild.members.fetchMe().catch(() => null);

  if (!role || !target || !actor || !botMember) {
    pendingRoleActions.delete(actionId);
    return privateError(interaction, "The role or member could not be found.");
  }

  if (role.id === guild.id || role.managed) {
    return privateError(
      interaction,
      "That role cannot be assigned or removed through this command."
    );
  }

  if (
    guild.ownerId !== actor.id &&
    actor.roles.highest.comparePositionTo(role) <= 0
  ) {
    return privateError(
      interaction,
      "Your highest role must be above the selected role."
    );
  }

  if (botMember.roles.highest.comparePositionTo(role) <= 0) {
    return privateError(
      interaction,
      "Move the bot's highest role above the selected role."
    );
  }

  if (target.id === guild.ownerId) {
    return privateError(interaction, "The server owner cannot be targeted.");
  }

  if (
    guild.ownerId !== actor.id &&
    actor.roles.highest.comparePositionTo(target.roles.highest) <= 0
  ) {
    return privateError(
      interaction,
      "Your highest role must be above the target member's highest role."
    );
  }

  if (
    botMember.roles.highest.comparePositionTo(target.roles.highest) <= 0
  ) {
    return privateError(
      interaction,
      "The bot's highest role must be above the target member's highest role."
    );
  }

  try {
    if (pending.action === "promote") {
      if (target.roles.cache.has(role.id)) {
        return privateError(interaction, "That member already has this role.");
      }

      await target.roles.add(
        role,
        `Promotion by ${interaction.user.tag}: ${pending.reason}`
      );
    } else {
      if (!target.roles.cache.has(role.id)) {
        return privateError(interaction, "That member does not have this role.");
      }

      await target.roles.remove(
        role,
        `Demotion by ${interaction.user.tag}: ${pending.reason}`
      );
    }

    const record = {
      id: makeId(),
      type: pending.action,
      memberId: target.id,
      roleId: role.id,
      roleName: role.name,
      reason: pending.reason,
      issuedBy: interaction.user.id,
      createdAt: new Date().toISOString(),
    };

    data.promotions.push(record);
    saveData();
    pendingRoleActions.delete(actionId);

    return privateReply(
      interaction,
      pending.action === "promote" ? "Promotion Complete" : "Demotion Complete",
      pending.action === "promote"
        ? `Assigned <@&${role.id}> to <@${target.id}>.`
        : `Removed <@&${role.id}> from <@${target.id}>.`,
      [
        `**Role:** ${safeText(role.name, 100)}`,
        `**Reason:** ${safeText(pending.reason, 500)}`,
        `**Actioned by:** <@${interaction.user.id}>`,
        `**Record ID:** \`${record.id}\``,
      ]
    );
  } catch (error) {
    console.error("Staff role change failed:", error);
    return privateError(
      interaction,
      "The role change failed. Check Manage Roles permission and role hierarchy."
    );
  }
}

// ============================================================
// SLASH COMMAND DEFINITIONS
// ============================================================

const commands = [
  new SlashCommandBuilder()
    .setName("promote")
    .setDescription("Promote a staff member by assigning a role.")
    .addUserOption(o =>
      o.setName("member").setDescription("Staff member").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason").setDescription("Reason").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("demote")
    .setDescription("Demote a staff member by removing a role.")
    .addUserOption(o =>
      o.setName("member").setDescription("Staff member").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason").setDescription("Reason").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("staffnote")
    .setDescription("Manage private staff notes.")
    .addSubcommand(s =>
      s.setName("add").setDescription("Add a staff note.")
        .addUserOption(o =>
          o.setName("member").setDescription("Staff member").setRequired(true)
        )
        .addStringOption(o =>
          o.setName("note").setDescription("Private note").setRequired(true)
        )
    )
    .addSubcommand(s =>
      s.setName("view").setDescription("View staff notes.")
        .addUserOption(o =>
          o.setName("member").setDescription("Staff member").setRequired(true)
        )
    )
    .addSubcommand(s =>
      s.setName("remove").setDescription("Remove a staff note.")
        .addUserOption(o =>
          o.setName("member").setDescription("Staff member").setRequired(true)
        )
        .addStringOption(o =>
          o.setName("id").setDescription("Note ID").setRequired(true)
        )
    ),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Issue a moderation warning.")
    .addUserOption(o =>
      o.setName("member").setDescription("Member").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason").setDescription("Reason").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout a member.")
    .addUserOption(o =>
      o.setName("member").setDescription("Member").setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("minutes").setDescription("Duration in minutes")
        .setMinValue(1).setMaxValue(40320).setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason").setDescription("Reason").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("untimeout")
    .setDescription("Remove a member's timeout.")
    .addUserOption(o =>
      o.setName("member").setDescription("Member").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason").setDescription("Reason").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a member.")
    .addUserOption(o =>
      o.setName("member").setDescription("Member").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason").setDescription("Reason").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a member.")
    .addUserOption(o =>
      o.setName("member").setDescription("Member").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason").setDescription("Reason").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Unban a user by ID.")
    .addStringOption(o =>
      o.setName("user_id").setDescription("User ID").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason").setDescription("Reason").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Delete recent messages.")
    .addIntegerOption(o =>
      o.setName("amount").setDescription("Number of messages")
        .setMinValue(1).setMaxValue(100).setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Set channel slowmode.")
    .addIntegerOption(o =>
      o.setName("seconds").setDescription("Seconds")
        .setMinValue(0).setMaxValue(21600).setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Lock a text channel.")
    .addChannelOption(o =>
      o.setName("channel").setDescription("Channel to lock")
        .addChannelTypes(ChannelType.GuildText)
    ),

  new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Unlock a text channel.")
    .addChannelOption(o =>
      o.setName("channel").setDescription("Channel to unlock")
        .addChannelTypes(ChannelType.GuildText)
    ),

  new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Publish an announcement.")
    .addChannelOption(o =>
      o.setName("channel").setDescription("Target channel")
        .addChannelTypes(ChannelType.GuildText).setRequired(true)
    )
    .addStringOption(o =>
      o.setName("title").setDescription("Announcement title").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("message").setDescription("Announcement message").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("embed")
    .setDescription("Publish a formatted Components V2 message.")
    .addChannelOption(o =>
      o.setName("channel").setDescription("Target channel")
        .addChannelTypes(ChannelType.GuildText).setRequired(true)
    )
    .addStringOption(o =>
      o.setName("title").setDescription("Message title").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("message").setDescription("Message content").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Create a Discord poll.")
    .addChannelOption(o =>
      o.setName("channel").setDescription("Target channel")
        .addChannelTypes(ChannelType.GuildText).setRequired(true)
    )
    .addStringOption(o =>
      o.setName("question").setDescription("Poll question").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("option_one").setDescription("First answer").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("option_two").setDescription("Second answer").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("infractions")
    .setDescription("View a member's infraction records.")
    .addUserOption(o =>
      o.setName("member").setDescription("Member").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("infraction")
    .setDescription("Manage infraction records.")
    .addSubcommand(s =>
      s.setName("add").setDescription("Record an infraction.")
        .addUserOption(o =>
          o.setName("member").setDescription("Member").setRequired(true)
        )
        .addStringOption(o =>
          o.setName("reason").setDescription("Rule violation").setRequired(true)
        )
        .addStringOption(o =>
          o.setName("action").setDescription("Action taken").setRequired(true)
        )
    )
    .addSubcommand(s =>
      s.setName("remove").setDescription("Remove an infraction.")
        .addUserOption(o =>
          o.setName("member").setDescription("Member").setRequired(true)
        )
        .addStringOption(o =>
          o.setName("id").setDescription("Infraction ID").setRequired(true)
        )
        .addStringOption(o =>
          o.setName("reason").setDescription("Removal reason").setRequired(true)
        )
    ),

  new SlashCommandBuilder()
    .setName("modmail")
    .setDescription("Configure ModMail.")
    .addSubcommand(s =>
      s.setName("config").setDescription("Configure support role and ticket category.")
    ),
].map(command => command.setDefaultMemberPermissions(ADMIN).toJSON());

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
// INTERACTIONS
// ============================================================

client.on("interactionCreate", async interaction => {
  try {
    if (
      interaction.isRoleSelectMenu() &&
      interaction.customId.startsWith("staff_role_")
    ) {
      return await handleStaffRoleSelect(interaction);
    }

    if (
      interaction.isRoleSelectMenu() &&
      interaction.customId === "modmail_config_role"
    ) {
      return await handleModmailConfigSelection(interaction, "role");
    }

    if (
      interaction.isChannelSelectMenu() &&
      interaction.customId === "modmail_config_category"
    ) {
      return await handleModmailConfigSelection(interaction, "category");
    }

    // --------------------------------------------------------
    // CLOSE MODMAIL
    // --------------------------------------------------------
    if (
      interaction.isButton() &&
      interaction.customId.startsWith("modmail_close_")
    ) {
      const ticketId = interaction.customId.slice("modmail_close_".length);
      const ticket = data.tickets[ticketId];

      if (!ticket || ticket.status !== "open") {
        return privateReply(
          interaction,
          "ModMail Already Closed",
          "This conversation is no longer open."
        );
      }

      // A close button only applies to its own ticket channel.
      if (interaction.channelId !== ticket.channelId) {
        return privateError(
          interaction,
          "This close button does not belong to this ticket channel."
        );
      }

      if (!interaction.inGuild() || !isSupportStaff(interaction.member)) {
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
      let dmDelivered = false;

      if (user) {
        try {
          await sendUserDM(
            user,
            "Costa Coffee Support",
            "Your ModMail has been closed.",
            [
              "Thank you for contacting Costa Coffee Support. Your conversation has now been closed by our support team.",
              "If you need further assistance, send us another direct message to open a new support conversation.",
              `**Closed by:** ${safeText(interaction.user.username, 100)}`,
              `**Closed at:** ${formatTimestamp(new Date(ticket.closedAt))}`,
              `**Ticket reference:** \`${ticketId}\``,
            ]
          );

          dmDelivered = true;
        } catch (error) {
          console.error("Could not send ticket closure DM:", error);
        }
      }

      await interaction.update({
        components: [
          makeContainer(
            "ModMail Closed",
            "This support conversation has been closed.",
            [
              `**Closed by:** ${safeText(interaction.user.username, 100)}`,
              `**Closed at:** ${formatTimestamp(new Date(ticket.closedAt))}`,
              `**Ticket reference:** \`${ticketId}\``,
              `**Member notification:** ${dmDelivered ? "Delivered" : "Could not be delivered"}`,
            ]
          ),
        ],
        allowedMentions: { parse: [] },
      });

      return;
    }

    if (!interaction.isChatInputCommand()) return;

    if (!interaction.inGuild() || !isAdministrator(interaction.member)) {
      return privateError(
        interaction,
        "You need the Discord Administrator permission to use this command."
      );
    }

    const commandName = interaction.commandName;
    const guild = interaction.guild;

    // --------------------------------------------------------
    // MODMAIL CONFIG
    // --------------------------------------------------------
    if (commandName === "modmail") {
      return showModmailConfig(interaction);
    }

    // --------------------------------------------------------
    // PROMOTE / DEMOTE
    // --------------------------------------------------------
    if (commandName === "promote" || commandName === "demote") {
      return showRoleAction(interaction, commandName);
    }

    // --------------------------------------------------------
    // STAFF NOTES
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
          return privateReply(
            interaction,
            "Staff Notes",
            "No notes recorded for this member."
          );
        }

        return privateReply(
          interaction,
          "Staff Notes",
          notes.slice(-10).map(note =>
            `**ID:** \`${note.id}\`\n**Note:** ${safeText(note.note, 500)}\n**Author:** <@${note.authorId}>\n**Date:** ${formatTimestamp(new Date(note.createdAt))}`
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

        return privateReply(
          interaction,
          "Staff Note Removed",
          `Removed note \`${id}\` from <@${member.id}>.`
        );
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
          return privateError(
            interaction,
            "No infraction found with that ID for this member."
          );
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
    // MODERATION COMMANDS
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
        guild.ownerId !== interaction.user.id &&
        interaction.member.roles.highest.comparePositionTo(member.roles.highest) <= 0
      ) {
        return privateError(
          interaction,
          "Your highest role must be above the target member's highest role."
        );
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

        return privateReply(
          interaction,
          "Timeout Removed",
          `Removed timeout for <@${user.id}>.`
        );
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

        return privateReply(
          interaction,
          "Member Kicked",
          `Kicked <@${user.id}>.\n**Reason:** ${safeText(reason)}`
        );
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

        return privateReply(
          interaction,
          "Member Banned",
          `Banned <@${user.id}>.\n**Reason:** ${safeText(reason)}`
        );
      }
    }

    if (commandName === "unban") {
      const userId = interaction.options.getString("user_id", true);
      const reason = interaction.options.getString("reason", true);

      if (!/^\d{17,20}$/.test(userId)) {
        return privateError(interaction, "Enter a valid Discord user ID.");
      }

      await guild.members.unban(userId, reason);

      return privateReply(
        interaction,
        "User Unbanned",
        `Unbanned user \`${userId}\`.\n**Reason:** ${safeText(reason)}`
      );
    }

    // --------------------------------------------------------
    // PURGE
    // --------------------------------------------------------
    if (commandName === "purge") {
      const amount = interaction.options.getInteger("amount", true);

      if (
        !interaction.channel?.isTextBased() ||
        !interaction.channel.bulkDelete
      ) {
        return privateError(
          interaction,
          "This command cannot be used in this channel."
        );
      }

      const deleted = await interaction.channel.bulkDelete(amount, true);

      return privateReply(
        interaction,
        "Messages Deleted",
        `Deleted **${deleted.size}** messages. Messages older than 14 days cannot be bulk-deleted.`
      );
    }

    // --------------------------------------------------------
    // SLOWMODE
    // --------------------------------------------------------
    if (commandName === "slowmode") {
      const seconds = interaction.options.getInteger("seconds", true);

      if (!interaction.channel?.setRateLimitPerUser) {
        return privateError(
          interaction,
          "This channel does not support slowmode."
        );
      }

      await interaction.channel.setRateLimitPerUser(seconds);

      return privateReply(
        interaction,
        "Slowmode Updated",
        `Slowmode is now **${seconds} seconds**.`
      );
    }

    // --------------------------------------------------------
    // LOCK / UNLOCK
    // --------------------------------------------------------
    if (commandName === "lock" || commandName === "unlock") {
      const channel =
        interaction.options.getChannel("channel") || interaction.channel;

      if (!channel?.permissionOverwrites) {
        return privateError(
          interaction,
          "Choose a channel that supports permission overwrites."
        );
      }

      await channel.permissionOverwrites.edit(guild.roles.everyone, {
        SendMessages: commandName === "unlock" ? null : false,
      });

      return privateReply(
        interaction,
        commandName === "lock" ? "Channel Locked" : "Channel Unlocked",
        `${channel} has been ${commandName === "lock" ? "locked" : "unlocked"}.`
      );
    }

    // --------------------------------------------------------
    // ANNOUNCE / EMBED
    // --------------------------------------------------------
    if (commandName === "announce" || commandName === "embed") {
      const channel = interaction.options.getChannel("channel", true);
      const title = interaction.options.getString("title", true);
      const message = interaction.options.getString("message", true);

      await publicV2(
        channel,
        safeText(title, 200),
        safeText(message, 3500),
        [
          `Published by ${safeText(interaction.user.username, 100)} · ${formatTimestamp()}`,
        ]
      );

      return privateReply(
        interaction,
        "Message Published",
        `Your ${commandName === "announce" ? "announcement" : "formatted message"} was published in ${channel}.`
      );
    }

    // --------------------------------------------------------
    // POLL
    // --------------------------------------------------------
    if (commandName === "poll") {
      const channel = interaction.options.getChannel("channel", true);
      const question = interaction.options.getString("question", true);
      const optionOne = interaction.options.getString("option_one", true);
      const optionTwo = interaction.options.getString("option_two", true);

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
      const message =
        error.code === 50013
          ? "The bot is missing a required Discord permission."
          : "The operation failed. Check the bot logs and its Discord permissions.";

      await privateError(interaction, message).catch(() => {});
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

client.on("error", error => {
  console.error("Discord client error:", error);
});

process.on("unhandledRejection", error => {
  console.error("Unhandled promise rejection:", error);
});

client.login(TOKEN);
