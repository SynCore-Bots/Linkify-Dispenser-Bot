const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

const PREFIX = '&';
const SET_PREFIX = '$';
const DATA_FILE = path.join(__dirname, 'data.json');
const WEEKLY_LIMIT = 3;
const BOT_PASSWORD = 'LinkifyOnT0P';

function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      if (!parsed.authorizedUsers) parsed.authorizedUsers = [];
      return parsed;
    } catch {
      return { links: [], userUsage: {}, authorizedUsers: [] };
    }
  }
  return { links: [], userUsage: {}, authorizedUsers: [] };
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function getWeekKey() {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const week = Math.ceil((((now - startOfYear) / 86400000) + startOfYear.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${week}`;
}

function getUserWeekUsage(data, userId) {
  const weekKey = getWeekKey();
  if (!data.userUsage[userId]) data.userUsage[userId] = {};
  if (!data.userUsage[userId][weekKey]) data.userUsage[userId][weekKey] = 0;
  return data.userUsage[userId][weekKey];
}

function incrementUserUsage(data, userId, amount) {
  const weekKey = getWeekKey();
  if (!data.userUsage[userId]) data.userUsage[userId] = {};
  if (!data.userUsage[userId][weekKey]) data.userUsage[userId][weekKey] = 0;
  data.userUsage[userId][weekKey] += amount;
}

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.content.startsWith(SET_PREFIX)) {
    const args = message.content.slice(SET_PREFIX.length).trim().split(/\s+/);
    const command = args.shift().toLowerCase();

    if (command === 'set') {
      const password = args[0];
      if (!password) {
        return message.reply('❌ Please provide the password.\nUsage: `$set PASSWORD`');
      }
      if (password !== BOT_PASSWORD) {
        return message.reply('❌ Incorrect password.');
      }

      const data = loadData();
      if (data.authorizedUsers.includes(message.author.id)) {
        return message.reply('✅ You are already authorized to use the link dispenser!');
      }

      data.authorizedUsers.push(message.author.id);
      saveData(data);
      return message.reply('✅ Password accepted! You can now use the link dispenser.');
    }
    return;
  }

  if (!message.content.startsWith(PREFIX)) return;

  const data = loadData();
  if (!data.authorizedUsers.includes(message.author.id)) {
    return message.reply('🔒 You need to enter the password first! Type `$set PASSWORD` to unlock.');
  }

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift().toLowerCase();

  const isAdmin = message.member?.permissions.has(PermissionFlagsBits.ManageGuild);

  if (command === 'insert') {
    if (!isAdmin) {
      return message.reply('❌ You do not have permission to use this command.');
    }

    const links = args.filter((a) => a.startsWith('http'));
    if (links.length === 0) {
      return message.reply('❌ Please provide at least one valid link starting with `http`.\nUsage: `&insert https://link1.com https://link2.com`');
    }

    const data = loadData();
    data.links.push(...links);
    saveData(data);

    return message.reply(`✅ Added **${links.length}** link(s). Total links in pool: **${data.links.length}**`);
  }

  if (command === 'setup') {
    if (!isAdmin) {
      return message.reply('❌ You do not have permission to use this command.');
    }

    const channelMention = args[0];
    if (!channelMention) {
      return message.reply('❌ Please mention a channel.\nUsage: `&setup #channel`');
    }

    const channelId = channelMention.replace(/[<#>]/g, '');
    const channel = message.guild?.channels.cache.get(channelId);

    if (!channel || !channel.isTextBased()) {
      return message.reply('❌ Could not find that channel. Make sure you mention a valid text channel.');
    }

    const embed = new EmbedBuilder()
      .setTitle('🔗 Link Dispenser')
      .setDescription(
        'Dispense a Link! **Limit: 3 a week!**\n\n═════════════════════════'
      )
      .setColor(0x5865f2)
      .setFooter({ text: 'Links are sent via DM — make sure your DMs are open.' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('dispense_1')
        .setLabel('Dispense 1x')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('dispense_3')
        .setLabel('Dispense 3x')
        .setStyle(ButtonStyle.Secondary)
    );

    await channel.send({ embeds: [embed], components: [row] });
    return message.reply(`✅ Link dispenser set up in ${channel}!`);
  }

  if (command === 'deleteall') {
    if (!isAdmin) {
      return message.reply('❌ You do not have permission to use this command.');
    }

    const data = loadData();
    const count = data.links.length;
    data.links = [];
    saveData(data);

    return message.reply(`✅ Deleted **${count}** link(s) from the pool. The pool is now empty.`);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  if (!['dispense_1', 'dispense_3'].includes(interaction.customId)) return;

  await interaction.deferReply({ ephemeral: true });

  const userId = interaction.user.id;
  const data = loadData();

  if (!data.authorizedUsers.includes(userId)) {
    return interaction.editReply({
      content: '🔒 You need to enter the password first!\nType `$set PASSWORD` in this server to unlock the dispenser.',
    });
  }

  const currentUsage = getUserWeekUsage(data, userId);
  const remaining = WEEKLY_LIMIT - currentUsage;

  if (remaining <= 0) {
    return interaction.editReply({
      content: '❌ You have reached your weekly limit of **3 links**. Come back next week!',
    });
  }

  if (data.links.length === 0) {
    return interaction.editReply({
      content: '❌ No links are available right now. Check back later!',
    });
  }

  if (interaction.customId === 'dispense_1') {
    const link = data.links.shift();
    incrementUserUsage(data, userId, 1);
    saveData(data);

    try {
      await interaction.user.send(
        `🔗 **Here is your link:**\n${link}\n\nYou have **${remaining - 1}** link(s) remaining this week.`
      );
      return interaction.editReply({ content: '✅ Link sent to your DMs!' });
    } catch {
      data.links.unshift(link);
      incrementUserUsage(data, userId, -1);
      saveData(data);
      return interaction.editReply({
        content: '❌ Could not send you a DM. Please enable DMs from server members and try again.',
      });
    }
  }

  if (interaction.customId === 'dispense_3') {
    const amount = Math.min(3, remaining, data.links.length);
    const links = data.links.splice(0, amount);
    incrementUserUsage(data, userId, amount);
    saveData(data);

    try {
      const linkList = links.map((l, i) => `**${i + 1}.** ${l}`).join('\n');
      await interaction.user.send(
        `🔗 **Here are your ${amount} link(s):**\n\n${linkList}\n\nYou have **${remaining - amount}** link(s) remaining this week.`
      );
      return interaction.editReply({ content: `✅ **${amount}** link(s) sent to your DMs!` });
    } catch {
      data.links.unshift(...links);
      incrementUserUsage(data, userId, -amount);
      saveData(data);
      return interaction.editReply({
        content: '❌ Could not send you a DM. Please enable DMs from server members and try again.',
      });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
