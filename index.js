require('dotenv').config();
const { Client, GatewayIntentBits, Collection, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ]
});

// Ayarlar dosyasını yükle veya oluştur
const settingsPath = path.join(__dirname, 'settings.json');
let settings = {
    autoRole: null,
    bannedWords: [],
    spamThreshold: 5, // 5 mesaj
    spamInterval: 5000, // 5 saniye
    spamCooldown: {}
};

function saveSettings() {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 4));
}

if (fs.existsSync(settingsPath)) {
    settings = JSON.parse(fs.readFileSync(settingsPath));
} else {
    saveSettings();
}

client.on('ready', () => {
    console.log(`${client.user.tag} olarak giriş yapıldı!`);
    
    // Slash komutlarını tanımla
    const commands = [
        {
            name: 'otorol-ayarla',
            description: 'Otomatik verilecek rolü ayarlar',
            options: [
                {
                    name: 'rol',
                    type: 8, // ROLE
                    description: 'Verilecek rol',
                    required: true
                }
            ],
            default_member_permissions: PermissionFlagsBits.Administrator.toString()
        },
        {
            name: 'kufur-ekle',
            description: 'Yasaklı kelime ekler',
            options: [
                {
                    name: 'kelime',
                    type: 3, // STRING
                    description: 'Eklenecek kelime',
                    required: true
                }
            ],
            default_member_permissions: PermissionFlagsBits.Administrator.toString()
        },
        {
            name: 'kufur-sil',
            description: 'Yasaklı kelime siler',
            options: [
                {
                    name: 'kelime',
                    type: 3, // STRING
                    description: 'Silinecek kelime',
                    required: true
                }
            ],
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
    if (settings.autoRole) {
        const role = member.guild.roles.cache.get(settings.autoRole);
        if (role) {
            try {
                await member.roles.add(role);
            } catch (err) {
                console.error('Otorol verilirken hata oluştu:', err);
            }
        }
    }
});

// Spam ve Küfür Engelleyici
const userMessages = new Map();

client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    // Küfür Engelleyici
    const content = message.content.toLowerCase();
    const hasBannedWord = settings.bannedWords.some(word => content.includes(word.toLowerCase()));
    
    if (hasBannedWord) {
        try {
            await message.delete();
            const warning = await message.channel.send(`${message.author}, bu kelimeyi kullanmak yasaktır!`);
            setTimeout(() => warning.delete().catch(() => {}), 3000);
            return;
        } catch (err) {
            console.error('Mesaj silinirken hata oluştu (Küfür):', err);
        }
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
            const warning = await message.channel.send(`${message.author}, çok hızlı mesaj gönderiyorsun! Lütfen biraz bekle.`);
            setTimeout(() => warning.delete().catch(() => {}), 3000);
            return;
        } catch (err) {
            console.error('Mesaj silinirken hata oluştu (Spam):', err);
        }
    }
});

// Komut İşlemleri
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options } = interaction;

    if (commandName === 'otorol-ayarla') {
        const role = options.getRole('rol');
        settings.autoRole = role.id;
        saveSettings();
        await interaction.reply({ content: `Otorol başarıyla ${role} olarak ayarlandı.`, ephemeral: true });
    }

    if (commandName === 'kufur-ekle') {
        const word = options.getString('kelime');
        if (!settings.bannedWords.includes(word)) {
            settings.bannedWords.push(word);
            saveSettings();
            await interaction.reply({ content: `"${word}" yasaklı kelimeler listesine eklendi.`, ephemeral: true });
        } else {
            await interaction.reply({ content: `"${word}" zaten listede var.`, ephemeral: true });
        }
    }

    if (commandName === 'kufur-sil') {
        const word = options.getString('kelime');
        const index = settings.bannedWords.indexOf(word);
        if (index > -1) {
            settings.bannedWords.splice(index, 1);
            saveSettings();
            await interaction.reply({ content: `"${word}" yasaklı kelimeler listesinden silindi.`, ephemeral: true });
        } else {
            await interaction.reply({ content: `"${word}" listede bulunamadı.`, ephemeral: true });
        }
    }

    if (commandName === 'kufur-liste') {
        if (settings.bannedWords.length === 0) {
            return interaction.reply({ content: 'Henüz yasaklı kelime eklenmemiş.', ephemeral: true });
        }
        const list = settings.bannedWords.join(', ');
        await interaction.reply({ content: `**Yasaklı Kelimeler:**\n${list}`, ephemeral: true });
    }
});

client.login(process.env.TOKEN);
