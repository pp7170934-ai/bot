import {
  Client,
  GatewayIntentBits,
  Events,
  ActivityType,
  REST,
  Routes,
  SlashCommandBuilder,
  type Interaction,
  type ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
  ApplicationIntegrationType,
  InteractionContextType,
} from "discord.js";
import { logger } from "./lib/logger";

const token = process.env["DISCORD_BOT_TOKEN"];
const clientId = process.env["DISCORD_CLIENT_ID"] ?? "1500879202646360124";
const mapleApiKey = process.env["MAPLE_API_KEY"];
const ALLOWED_USER_ID = "1397488831514808341";
const BASE_URL = "https://maple-api.marizma.games/v1/server";

if (!token) {
  logger.warn("DISCORD_BOT_TOKEN not set — bot will not start");
}

const ALL_CONTEXTS = [
  InteractionContextType.Guild,
  InteractionContextType.BotDM,
  InteractionContextType.PrivateChannel,
];
const ALL_INTEGRATIONS = [
  ApplicationIntegrationType.GuildInstall,
  ApplicationIntegrationType.UserInstall,
];

const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check if the bot is alive")
    .setIntegrationTypes(ALL_INTEGRATIONS)
    .setContexts(ALL_CONTEXTS),

  new SlashCommandBuilder()
    .setName("info")
    .setDescription("Get info about this bot")
    .setIntegrationTypes(ALL_INTEGRATIONS)
    .setContexts(ALL_CONTEXTS),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a Roblox player from the game server")
    .addIntegerOption((o) =>
      o.setName("robloxuserid").setDescription("The Roblox user ID to ban").setRequired(true).setMinValue(1),
    )
    .setIntegrationTypes(ALL_INTEGRATIONS)
    .setContexts(ALL_CONTEXTS),

  new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Unban a Roblox player from the game server")
    .addIntegerOption((o) =>
      o.setName("robloxuserid").setDescription("The Roblox user ID to unban").setRequired(true).setMinValue(1),
    )
    .setIntegrationTypes(ALL_INTEGRATIONS)
    .setContexts(ALL_CONTEXTS),

  new SlashCommandBuilder()
    .setName("banlist")
    .setDescription("Show all banned Roblox player IDs")
    .setIntegrationTypes(ALL_INTEGRATIONS)
    .setContexts(ALL_CONTEXTS),

  new SlashCommandBuilder()
    .setName("players")
    .setDescription("Show all players currently online in the game server")
    .setIntegrationTypes(ALL_INTEGRATIONS)
    .setContexts(ALL_CONTEXTS),

  new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Send an announcement to all players in the game server")
    .addStringOption((o) =>
      o.setName("message").setDescription("The message to announce").setRequired(true).setMaxLength(200),
    )
    .setIntegrationTypes(ALL_INTEGRATIONS)
    .setContexts(ALL_CONTEXTS),
];

async function registerCommands(): Promise<void> {
  if (!token) return;
  try {
    const rest = new REST({ version: "10" }).setToken(token);
    logger.info("Registering slash commands...");
    await rest.put(Routes.applicationCommands(clientId), {
      body: commands.map((c) => c.toJSON()),
    });
    logger.info("Slash commands registered successfully");
  } catch (err) {
    logger.error({ err }, "Failed to register slash commands");
  }
}

function mapleHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Api-Key": mapleApiKey ?? "",
  };
}

function noKeyEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle("Configuration Error")
    .setDescription("MAPLE_API_KEY is not configured.");
}

async function handleBanCommand(
  interaction: ChatInputCommandInteraction,
  banned: boolean,
): Promise<void> {
  const userId = interaction.options.getInteger("robloxuserid", true);
  const action = banned ? "Ban" : "Unban";
  await interaction.deferReply();

  if (!mapleApiKey) {
    await interaction.editReply({ embeds: [noKeyEmbed()] });
    return;
  }

  try {
    const res = await fetch(`${BASE_URL}/banplayer`, {
      method: "POST",
      headers: mapleHeaders(),
      body: JSON.stringify({ Banned: banned, UserId: userId }),
    });
    const json = (await res.json()) as { success?: boolean; data?: { message?: string } };
    const embed = new EmbedBuilder()
      .setTimestamp()
      .setFooter({ text: `Requested by ${interaction.user.username}` });

    if (json.success) {
      embed
        .setColor(banned ? 0xe74c3c : 0x2ecc71)
        .setTitle(banned ? "Player Banned" : "Player Unbanned")
        .setDescription(
          banned
            ? `Roblox user \`${userId}\` has been **banned** from the game server.`
            : `Roblox user \`${userId}\` has been **unbanned** from the game server.`,
        );
    } else {
      embed
        .setColor(0xe67e22)
        .setTitle(`Failed to ${action}`)
        .setDescription(json.data?.message ?? "The API returned an unexpected response.");
    }
    await interaction.editReply({ embeds: [embed] });
    logger.info({ userId, banned, success: json.success }, "Ban command executed");
  } catch (err) {
    logger.error({ err }, "Ban command failed");
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle("Error").setDescription("Failed to reach the game server API.")] });
  }
}

async function handleBanlist(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  if (!mapleApiKey) {
    await interaction.editReply({ embeds: [noKeyEmbed()] });
    return;
  }

  try {
    const res = await fetch(`${BASE_URL}/bans`, { headers: mapleHeaders() });
    const json = (await res.json()) as { success?: boolean; data?: { Bans?: number[] } };
    const bans: number[] = json.data?.Bans ?? [];

    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle("Banned Players")
      .setTimestamp()
      .setFooter({ text: `${bans.length} banned player${bans.length !== 1 ? "s" : ""}` });

    if (bans.length === 0) {
      embed.setDescription("No players are currently banned.");
    } else {
      const chunks: string[] = [];
      for (let i = 0; i < bans.length; i += 20) {
        chunks.push(bans.slice(i, i + 20).map((id) => `\`${id}\``).join(", "));
      }
      embed.setDescription(chunks.join("\n"));
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error({ err }, "Banlist command failed");
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle("Error").setDescription("Failed to fetch ban list.")] });
  }
}

async function handlePlayers(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  if (!mapleApiKey) {
    await interaction.editReply({ embeds: [noKeyEmbed()] });
    return;
  }

  try {
    const res = await fetch(`${BASE_URL}/players`, { headers: mapleHeaders() });
    const json = (await res.json()) as { success?: boolean; data?: { Players?: number[] } };
    const players: number[] = json.data?.Players ?? [];

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle("Online Players")
      .setTimestamp()
      .setFooter({ text: `${players.length} player${players.length !== 1 ? "s" : ""} online` });

    if (players.length === 0) {
      embed.setDescription("No players are currently online.");
    } else {
      embed.setDescription(players.map((id) => `\`${id}\``).join(", "));
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error({ err }, "Players command failed");
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle("Error").setDescription("Failed to fetch player list.")] });
  }
}

async function handleAnnounce(interaction: ChatInputCommandInteraction): Promise<void> {
  const message = interaction.options.getString("message", true);
  await interaction.deferReply();

  if (!mapleApiKey) {
    await interaction.editReply({ embeds: [noKeyEmbed()] });
    return;
  }

  try {
    const res = await fetch(`${BASE_URL}/announce`, {
      method: "POST",
      headers: mapleHeaders(),
      body: JSON.stringify({ Message: message }),
    });
    const json = (await res.json()) as { success?: boolean; data?: { message?: string } };

    const embed = new EmbedBuilder().setTimestamp().setFooter({ text: `Sent by ${interaction.user.username}` });

    if (json.success) {
      embed
        .setColor(0x9b59b6)
        .setTitle("Announcement Sent")
        .setDescription(`> ${message}`);
    } else {
      embed
        .setColor(0xe67e22)
        .setTitle("Failed to Send")
        .setDescription(json.data?.message ?? "The API returned an unexpected response.");
    }

    await interaction.editReply({ embeds: [embed] });
    logger.info({ message, success: json.success }, "Announce command executed");
  } catch (err) {
    logger.error({ err }, "Announce command failed");
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle("Error").setDescription("Failed to send announcement.")] });
  }
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
  ],
});

function handleSlashCommand(interaction: ChatInputCommandInteraction): void {
  const { commandName } = interaction;

  if (interaction.user.id !== ALLOWED_USER_ID) {
    void interaction.reply({ content: "You don't have permission to use this bot.", ephemeral: true });
    return;
  }

  if (commandName === "ping") {
    const latency = Date.now() - interaction.createdTimestamp;
    void interaction.reply(`Pong! Latency: **${latency}ms** | API Latency: **${Math.round(client.ws.ping)}ms**`);
  } else if (commandName === "info") {
    void interaction.reply([
      "**Bot Info**",
      `• Username: ${client.user?.tag ?? "unknown"}`,
      `• ID: ${clientId}`,
      `• Servers: ${client.guilds.cache.size}`,
      `• Uptime: ${formatUptime(client.uptime ?? 0)}`,
      "",
      "**Commands**",
      "• `/ban` — ban a player",
      "• `/unban` — unban a player",
      "• `/banlist` — view all banned players",
      "• `/players` — view online players",
      "• `/announce` — send server announcement",
    ].join("\n"));
  } else if (commandName === "ban") {
    void handleBanCommand(interaction, true);
  } else if (commandName === "unban") {
    void handleBanCommand(interaction, false);
  } else if (commandName === "banlist") {
    void handleBanlist(interaction);
  } else if (commandName === "players") {
    void handlePlayers(interaction);
  } else if (commandName === "announce") {
    void handleAnnounce(interaction);
  }
}

client.once(Events.ClientReady, (readyClient) => {
  logger.info({ tag: readyClient.user.tag }, "Discord bot logged in");
  readyClient.user.setPresence({
    activities: [{ name: "your commands", type: ActivityType.Listening }],
    status: "online",
  });
  void registerCommands();
});

client.on(Events.InteractionCreate, (interaction: Interaction) => {
  if (!interaction.isChatInputCommand()) return;
  handleSlashCommand(interaction);
});

client.on(Events.Error, (err) => {
  logger.error({ err }, "Discord client error");
});

export function startBot(): void {
  if (!token) {
    logger.warn("Skipping Discord bot — DISCORD_BOT_TOKEN not configured");
    return;
  }
  if (process.env["BOT_ENABLED"] !== "true") {
    logger.info("Skipping Discord bot — BOT_ENABLED is not set to true (set it on your host to enable)");
    return;
  }
  void client.login(token);
}
