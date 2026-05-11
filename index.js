require('dotenv').config();
const { Client, GatewayIntentBits, PermissionFlagsBits } = require('discord.js');
const mongoose = require('mongoose');

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
        .catch(err => console.error('MongoDB Bağlantı Hatası ❌:', err));
}

const SettingsSchema = new mongoose.Schema({
    guildId: String,
    autoRole: String,
    bannedWords: [String],
    spamThreshold: { type: Number, default: 5 },
    spamInterval: { type: Number, default: 5000 }
});

const Settings = mongoose.model('Settings', SettingsSchema);

async function getSettings(guildId) {
    let settings = await Settings.findOne({ guildId });
    if (!settings) {
        settings = await Settings.create({ guildId, bannedWords: [] });
    }
    return settings;
}

client.on('ready', () => {
    console.log(`${client.user.tag} olarak giriş yapıldı!`);
    
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
        }
    ];

    client.application.commands.set(commands);
});

// Otorol Sistemi
client.on('guildMemberAdd', async member => {
    const settings = await getSettings(member.guild.id);
    if (settings.autoRole) {
        const role = member.guild.roles.cache.get(settings.autoRole);
        if (role) {
            try {
                await member.roles.add(role);
            } catch (err) {
                console.error('Otorol hatası:', err);
            }
        }
    }
});

// Spam ve Küfür Engelleyici
const userMessages = new Map();

client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    const settings = await getSettings(message.guild.id);

    // Küfür Engelleyici
    const content = message.content.toLowerCase();
    const hasBannedWord = settings.bannedWords.some(word => content.includes(word.toLowerCase()));
    
    if (hasBannedWord) {
        try {
            await message.delete();
            const warning = await message.channel.send(`${message.author}, bu kelimeyi kullanmak yasaktır!`);
            setTimeout(() => warning.delete().catch(() => {}), 3000);
            return;
        } catch (err) { }
    }

    // Spam Engelleyici
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
            return;
        } catch (err) { }
    }
});

// Komut İşlemleri
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, guildId } = interaction;
    const settings = await getSettings(guildId);

    if (commandName === 'otorol-ayarla') {
        const role = options.getRole('rol');
        settings.autoRole = role.id;
        await settings.save();
        await interaction.reply({ content: `Otorol başarıyla ${role} olarak ayarlandı.`, ephemeral: true });
    }

    if (commandName === 'kufur-ekle') {
        const word = options.getString('kelime');
        if (!settings.bannedWords.includes(word)) {
            settings.bannedWords.push(word);
            await settings.save();
            await interaction.reply({ content: `"${word}" yasaklı listeye eklendi.`, ephemeral: true });
        } else {
            await interaction.reply({ content: `"${word}" zaten listede var.`, ephemeral: true });
        }
    }

    if (commandName === 'kufur-sil') {
        const word = options.getString('kelime');
        const index = settings.bannedWords.indexOf(word);
        if (index > -1) {
            settings.bannedWords.splice(index, 1);
            await settings.save();
            await interaction.reply({ content: `"${word}" listeden silindi.`, ephemeral: true });
        } else {
            await interaction.reply({ content: `"${word}" bulunamadı.`, ephemeral: true });
        }
    }

    if (commandName === 'kufur-liste') {
        if (settings.bannedWords.length === 0) {
            return interaction.reply({ content: 'Yasaklı kelime yok.', ephemeral: true });
        }
        await interaction.reply({ content: `**Yasaklı Kelimeler:**\n${settings.bannedWords.join(', ')}`, ephemeral: true });
    }
});

client.login(process.env.TOKEN);
