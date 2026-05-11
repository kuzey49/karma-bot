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

// MongoDB Bağlantısı ve Şeması
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
    spamThreshold: { type: Number, default: 5 },
    spamInterval: { type: Number, default: 5000 }
});

const Settings = mongoose.model('Settings', SettingsSchema);

async function getSettings(guildId) {
    let settings = await Settings.findOne({ guildId });
    if (!settings) settings = await Settings.create({ guildId, bannedWords: [] });
    return settings;
}

// Üye Sayısı Güncelleme Fonksiyonu
async function updateMemberCount(guild) {
    const settings = await getSettings(guild.id);
    if (settings.memberCountChannelId) {
        const channel = guild.channels.cache.get(settings.memberCountChannelId);
        if (channel) {
            try {
                await channel.setName(`Üye Sayısı • ${guild.memberCount}`);
            } catch (err) { }
        }
    }
}

client.on('ready', () => {
    console.log(`${client.user.tag} hazır!`);
    
    const commands = [
        {
            name: 'otorol-ayarla',
            description: 'Otomatik verilecek rolü ayarlar',
            options: [{ name: 'rol', type: 8, description: 'Verilecek rol', required: true }],
            default_member_permissions: PermissionFlagsBits.Administrator.toString()
        },
        {
            name: 'kufur-ekle',
            description: 'Yasaklı kelime ekler',
            options: [{ name: 'kelime', type: 3, description: 'Eklenecek kelime', required: true }],
            default_member_permissions: PermissionFlagsBits.Administrator.toString()
        },
        {
            name: 'kufur-sil',
            description: 'Yasaklı kelime siler',
            options: [{ name: 'kelime', type: 3, description: 'Silinecek kelime', required: true }],
            default_member_permissions: PermissionFlagsBits.Administrator.toString()
        },
        {
            name: 'kufur-liste',
            description: 'Yasaklı kelimeleri listeler',
            default_member_permissions: PermissionFlagsBits.Administrator.toString()
        },
        {
            name: 'panel-ayarla',
            description: 'Üye sayısı kanalını ayarlar',
            options: [{ name: 'kanal', type: 7, description: 'Ses kanalı seçin', required: true }],
            default_member_permissions: PermissionFlagsBits.Administrator.toString()
        },
        {
            name: 'ban',
            description: 'Üyeyi yasaklar',
            options: [
                { name: 'kisi', type: 6, description: 'Yasaklanacak kişi', required: true },
                { name: 'sebep', type: 3, description: 'Yasaklama sebebi', required: false }
            ],
            default_member_permissions: PermissionFlagsBits.BanMembers.toString()
        }
    ];

    client.application.commands.set(commands);
});

// Üye Giriş/Çıkış Olayları
client.on('guildMemberAdd', async member => {
    const settings = await getSettings(member.guild.id);
    if (settings.autoRole) {
        const role = member.guild.roles.cache.get(settings.autoRole);
        if (role) await member.roles.add(role).catch(() => {});
    }
    await updateMemberCount(member.guild);
});

client.on('guildMemberRemove', async member => {
    await updateMemberCount(member.guild);
});

// Spam ve Küfür Engelleyici
const userMessages = new Map();

client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;
    const settings = await getSettings(message.guild.id);

    const content = message.content.toLowerCase();
    if (settings.bannedWords.some(word => content.includes(word.toLowerCase()))) {
        try {
            await message.delete();
            const warning = await message.channel.send(`${message.author}, bu kelimeyi kullanmak yasaktır!`);
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
            const warning = await message.channel.send(`${message.author}, çok hızlı mesaj gönderiyorsun!`);
            setTimeout(() => warning.delete().catch(() => {}), 3000);
        } catch (err) { }
    }
});

// Komut İşlemleri
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, guild, guildId } = interaction;
    const settings = await getSettings(guildId);

    if (commandName === 'otorol-ayarla') {
        const role = options.getRole('rol');
        settings.autoRole = role.id;
        await settings.save();
        await interaction.reply({ content: `Otorol ${role} olarak ayarlandı.`, ephemeral: true });
    }

    if (commandName === 'panel-ayarla') {
        const channel = options.getChannel('kanal');
        settings.memberCountChannelId = channel.id;
        await settings.save();
        await updateMemberCount(guild);
        await interaction.reply({ content: `Üye panel kanalı ${channel} olarak ayarlandı.`, ephemeral: true });
    }

    if (commandName === 'ban') {
        const user = options.getUser('kisi');
        const reason = options.getString('sebep') || 'Sebep belirtilmedi.';
        try {
            await guild.members.ban(user, { reason });
            await interaction.reply({ content: `${user.tag} başarıyla yasaklandı. Sebep: ${reason}` });
        } catch (err) {
            await interaction.reply({ content: `Yasaklama sırasında hata oluştu: Yetkim yetmiyor olabilir.`, ephemeral: true });
        }
    }

    if (commandName === 'kufur-ekle') {
        const word = options.getString('kelime');
        if (!settings.bannedWords.includes(word)) {
            settings.bannedWords.push(word);
            await settings.save();
            await interaction.reply({ content: `"${word}" eklendi.`, ephemeral: true });
        } else await interaction.reply({ content: `"${word}" zaten var.`, ephemeral: true });
    }

    if (commandName === 'kufur-sil') {
        const word = options.getString('kelime');
        const index = settings.bannedWords.indexOf(word);
        if (index > -1) {
            settings.bannedWords.splice(index, 1);
            await settings.save();
            await interaction.reply({ content: `"${word}" silindi.`, ephemeral: true });
        } else await interaction.reply({ content: `"${word}" bulunamadı.`, ephemeral: true });
    }

    if (commandName === 'kufur-liste') {
        if (settings.bannedWords.length === 0) return interaction.reply({ content: 'Liste boş.', ephemeral: true });
        await interaction.reply({ content: `**Yasaklı Kelimeler:**\n${settings.bannedWords.join(', ')}`, ephemeral: true });
    }
});

client.login(process.env.TOKEN);
