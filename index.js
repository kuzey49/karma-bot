require('dotenv').config();
const { Client, GatewayIntentBits, PermissionFlagsBits } = require('discord.js');
const mongoose = require('mongoose');
const express = require('express');

const app = express();
const port = process.env.PORT || 3000;
app.get('/', (req, res) => { res.send('Bot aktif! 🚀'); });
app.listen(port, () => { console.log(`Sunucu ${port} portunda.`); });

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ]
});

// MongoDB ve Şema
if (process.env.MONGO_URI) {
    mongoose.connect(process.env.MONGO_URI)
        .then(() => console.log('MongoDB Bağlantısı Başarılı ✅'))
        .catch(err => console.error('MongoDB Hatası:', err));
}

const SettingsSchema = new mongoose.Schema({
    guildId: String,
    autoRole: String,
    bannedWords: [String],
    memberCountChannelId: String,
    welcomeChannelId: String,
    welcomeMessage: String,
    leaveChannelId: String,
    leaveMessage: String,
    spamThreshold: { type: Number, default: 5 },
    spamInterval: { type: Number, default: 5000 }
});

const Settings = mongoose.model('Settings', SettingsSchema);

async function getSettings(guildId) {
    let settings = await Settings.findOne({ guildId });
    if (!settings) settings = await Settings.create({ guildId, bannedWords: [] });
    return settings;
}

async function updateMemberCount(guild) {
    const settings = await getSettings(guild.id);
    if (settings.memberCountChannelId) {
        const channel = guild.channels.cache.get(settings.memberCountChannelId);
        if (channel) await channel.setName(`Üye Sayısı • ${guild.memberCount}`).catch(() => {});
    }
}

client.on('ready', () => {
    console.log(`${client.user.tag} hazır!`);
    const commands = [
        {
            name: 'otorol-ayarla',
            description: 'Otomatik rolü ayarlar',
            options: [{ name: 'rol', type: 8, description: 'Rol', required: true }],
            default_member_permissions: PermissionFlagsBits.Administrator.toString()
        },
        {
            name: 'panel-ayarla',
            description: 'Üye sayısı kanalını ayarlar',
            options: [{ name: 'kanal', type: 7, description: 'Ses kanalı', required: true }],
            default_member_permissions: PermissionFlagsBits.Administrator.toString()
        },
        {
            name: 'hosgeldin-ayarla',
            description: 'Hoş geldin mesajını ve kanalını ayarlar',
            options: [
                { name: 'kanal', type: 7, description: 'Kanal', required: true },
                { name: 'mesaj', type: 3, description: 'Mesaj (Etiket için {üye} kullanın)', required: true }
            ],
            default_member_permissions: PermissionFlagsBits.Administrator.toString()
        },
        {
            name: 'gorusuruz-ayarla',
            description: 'Görüşürüz mesajını ve kanalını ayarlar',
            options: [
                { name: 'kanal', type: 7, description: 'Kanal', required: true },
                { name: 'mesaj', type: 3, description: 'Mesaj (Etiket için {üye} kullanın)', required: true }
            ],
            default_member_permissions: PermissionFlagsBits.Administrator.toString()
        },
        {
            name: 'ban',
            description: 'Üyeyi yasaklar',
            options: [
                { name: 'kisi', type: 6, description: 'Kişi', required: true },
                { name: 'sebep', type: 3, description: 'Sebep', required: false }
            ],
            default_member_permissions: PermissionFlagsBits.BanMembers.toString()
        },
        {
            name: 'kufur-ekle',
            description: 'Yasaklı kelime ekler',
            options: [{ name: 'kelime', type: 3, description: 'Kelime', required: true }],
            default_member_permissions: PermissionFlagsBits.Administrator.toString()
        },
        {
            name: 'kufur-sil',
            description: 'Yasaklı kelime siler',
            options: [{ name: 'kelime', type: 3, description: 'Kelime', required: true }],
            default_member_permissions: PermissionFlagsBits.Administrator.toString()
        },
        {
            name: 'kufur-liste',
            description: 'Yasaklı kelimeler',
            default_member_permissions: PermissionFlagsBits.Administrator.toString()
        }
    ];
    client.application.commands.set(commands);
});

client.on('guildMemberAdd', async member => {
    const settings = await getSettings(member.guild.id);
    if (settings.autoRole) {
        const role = member.guild.roles.cache.get(settings.autoRole);
        if (role) await member.roles.add(role).catch(() => {});
    }
    if (settings.welcomeChannelId && settings.welcomeMessage) {
        const channel = member.guild.channels.cache.get(settings.welcomeChannelId);
        if (channel) {
            const msg = settings.welcomeMessage.replace('{üye}', `${member}`);
            channel.send(msg).catch(() => {});
        }
    }
    await updateMemberCount(member.guild);
});

client.on('guildMemberRemove', async member => {
    const settings = await getSettings(member.guild.id);
    if (settings.leaveChannelId && settings.leaveMessage) {
        const channel = member.guild.channels.cache.get(settings.leaveChannelId);
        if (channel) {
            const msg = settings.leaveMessage.replace('{üye}', `${member.user.tag}`);
            channel.send(msg).catch(() => {});
        }
    }
    await updateMemberCount(member.guild);
});

const userMessages = new Map();
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;
    const settings = await getSettings(message.guild.id);
    const content = message.content.toLowerCase();
    if (settings.bannedWords.some(word => content.includes(word.toLowerCase()))) {
        try {
            await message.delete();
            const warning = await message.channel.send(`${message.author}, yasaklı kelime!`);
            setTimeout(() => warning.delete().catch(() => {}), 3000);
            return;
        } catch (err) { }
    }
    const now = Date.now();
    const timestamps = userMessages.get(message.author.id) || [];
    timestamps.push(now);
    const recentMessages = timestamps.filter(time => now - time < settings.spamInterval);
    userMessages.set(message.author.id, recentMessages);
    if (recentMessages.length > settings.spamThreshold) {
        try {
            await message.delete();
            const warning = await message.channel.send(`${message.author}, çok hızlı mesaj!`);
            setTimeout(() => warning.delete().catch(() => {}), 3000);
        } catch (err) { }
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, guild, guildId } = interaction;
    const settings = await getSettings(guildId);

    if (commandName === 'otorol-ayarla') {
        settings.autoRole = options.getRole('rol').id;
        await settings.save();
        await interaction.reply({ content: `Otorol ayarlandı.`, ephemeral: true });
    }
    if (commandName === 'panel-ayarla') {
        settings.memberCountChannelId = options.getChannel('kanal').id;
        await settings.save(); await updateMemberCount(guild);
        await interaction.reply({ content: `Panel ayarlandı.`, ephemeral: true });
    }
    if (commandName === 'hosgeldin-ayarla') {
        settings.welcomeChannelId = options.getChannel('kanal').id;
        settings.welcomeMessage = options.getString('mesaj');
        await settings.save();
        await interaction.reply({ content: `Hoş geldin sistemi aktif! Kanal: ${options.getChannel('kanal')}`, ephemeral: true });
    }
    if (commandName === 'gorusuruz-ayarla') {
        settings.leaveChannelId = options.getChannel('kanal').id;
        settings.leaveMessage = options.getString('mesaj');
        await settings.save();
        await interaction.reply({ content: `Görüşürüz sistemi aktif! Kanal: ${options.getChannel('kanal')}`, ephemeral: true });
    }
    if (commandName === 'ban') {
        const user = options.getUser('kisi');
        const reason = options.getString('sebep') || 'Sebep yok.';
        try {
            await guild.members.ban(user, { reason });
            await interaction.reply({ content: `${user.tag} yasaklandı.` });
        } catch (err) { await interaction.reply({ content: `Hata! Rol sıralamasını kontrol edin.`, ephemeral: true }); }
    }
    if (commandName === 'kufur-ekle') {
        const word = options.getString('kelime');
        if (!settings.bannedWords.includes(word)) { settings.bannedWords.push(word); await settings.save(); await interaction.reply({ content: `Eklendi.`, ephemeral: true }); }
        else await interaction.reply({ content: `Zaten var.`, ephemeral: true });
    }
    if (commandName === 'kufur-sil') {
        const word = options.getString('kelime');
        const index = settings.bannedWords.indexOf(word);
        if (index > -1) { settings.bannedWords.splice(index, 1); await settings.save(); await interaction.reply({ content: `Silindi.`, ephemeral: true }); }
        else await interaction.reply({ content: `Bulunamadı.`, ephemeral: true });
    }
    if (commandName === 'kufur-liste') {
        if (settings.bannedWords.length === 0) return interaction.reply({ content: 'Boş.', ephemeral: true });
        await interaction.reply({ content: `**Yasaklı Kelimeler:**\n${settings.bannedWords.join(', ')}`, ephemeral: true });
    }
});

client.login(process.env.TOKEN);
