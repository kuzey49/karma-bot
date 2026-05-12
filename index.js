require('dotenv').config();
const { Client, GatewayIntentBits, PermissionFlagsBits, Routes, REST, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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
        GatewayIntentBits.GuildVoiceStates,
    ]
});

const { DisTube } = require('distube');
const { SpotifyPlugin } = require('@distube/spotify');
const { YtDlpPlugin } = require('@distube/yt-dlp');

const distube = new DisTube(client, {
    plugins: [
        new SpotifyPlugin({
            api: process.env.SPOTIFY_ID ? {
                clientId: process.env.SPOTIFY_ID,
                clientSecret: process.env.SPOTIFY_SECRET,
            } : null
        }),
        new YtDlpPlugin()
    ],
    ffmpeg: {
        path: require('ffmpeg-static')
    }
});

distube.on('playSong', (queue, song) => {
    queue.textChannel.send(`🎶 Şu an çalıyor: **${song.name}** - \`${song.formattedDuration}\`\nİsteyen: ${song.user}`);
});

distube.on('addSong', (queue, song) => {
    queue.textChannel.send(`✅ Sıraya eklendi: **${song.name}** - \`${song.formattedDuration}\``);
});

distube.on('error', (channel, e) => {
    if (channel && typeof channel.send === 'function') channel.send(`❌ Hata: ${e.message.slice(0, 2000)}`);
    else console.error('DisTube Hatası:', e);
});

// Çökmemesi ve hatayı loglaması için hata yakalayıcılar
process.on('unhandledRejection', error => {
    console.error('Yakalanmamış Söz Verme Hatası:', error);
});

process.on('uncaughtException', error => {
    console.error('Yakalanmamış İstisna Hatası:', error);
});

// MongoDB Bağlantısı
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
    welcomeImage: String,
    leaveChannelId: String,
    leaveMessage: String,
    leaveImage: String,
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
        const channel = await guild.channels.fetch(settings.memberCountChannelId).catch(() => null);
        if (channel) await channel.setName(`Üye Sayısı • ${guild.memberCount}`).catch(() => {});
    }
}

const commands = [
    {
        name: 'otorol-ayarla',
        description: 'Otomatik verilecek rolü ayarlar',
        options: [{ name: 'rol', type: 8, description: 'Verilecek rol', required: true }],
        default_member_permissions: PermissionFlagsBits.Administrator.toString()
    },
    {
        name: 'panel-ayarla',
        description: 'Üye sayısı kanalını ayarlar',
        options: [{ name: 'kanal', type: 7, description: 'Ses kanalı seçin', required: true }],
        default_member_permissions: PermissionFlagsBits.Administrator.toString()
    },
    {
        name: 'hosgeldin-ayarla',
        description: 'Hoş geldin mesajını ayarlar',
        options: [
            { name: 'kanal', type: 7, description: 'Kanal', required: true },
            { name: 'mesaj', type: 3, description: 'Mesaj ({üye}: etiket, {sayı}: sayı, {sunucu}: sunucu ismi)', required: true },
            { name: 'resim', type: 3, description: 'Resim URL (opsiyonel)', required: false }
        ],
        default_member_permissions: PermissionFlagsBits.Administrator.toString()
    },
    {
        name: 'gorusuruz-ayarla',
        description: 'Görüşürüz mesajını ayarlar',
        options: [
            { name: 'kanal', type: 7, description: 'Kanal', required: true },
            { name: 'mesaj', type: 3, description: 'Mesaj ({üye}: etiket, {sayı}: üye sayısı, {sunucu}: sunucu ismi)', required: true },
            { name: 'resim', type: 3, description: 'Resim URL (opsiyonel)', required: false }
        ],
        default_member_permissions: PermissionFlagsBits.Administrator.toString()
    },
    {
        name: 'ban',
        description: 'Üyeyi yasaklar',
        options: [
            { name: 'kisi', type: 6, description: 'Kanal', required: true },
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
    },
    {
        name: 'sil',
        description: 'Belirtilen miktarda mesajı siler',
        options: [{ name: 'miktar', type: 4, description: 'Silinecek mesaj sayısı (1-100)', required: true }],
        default_member_permissions: PermissionFlagsBits.ManageMessages.toString()
    },
    {
        name: 'sunucu-bilgi',
        description: 'Sunucu hakkında bilgi verir'
    },
    {
        name: 'cekilis-baslat',
        description: 'Çekiliş başlatır',
        options: [
            { name: 'sure', type: 3, description: 'Süre (örnek: 1m, 1h, 1d)', required: true },
            { name: 'kazanan', type: 4, description: 'Kazanan sayısı', required: true },
            { name: 'odul', type: 3, description: 'Ödül', required: true }
        ],
        default_member_permissions: PermissionFlagsBits.Administrator.toString()
    },
    {
        name: 'oynat',
        description: 'Şarkı çalar (YouTube veya Spotify)',
        options: [{ name: 'şarkı', type: 3, description: 'Şarkı adı veya link', required: true }]
    },
    {
        name: 'atla',
        description: 'Sıradaki şarkıya geçer'
    },
    {
        name: 'durdur',
        description: 'Müziği tamamen durdurur'
    }
];

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

client.on('ready', async () => {
    console.log(`${client.user.tag} hazır!`);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Komutlar yüklendi! ✅');
    } catch (error) { console.error(error); }
});

client.on('guildMemberAdd', async member => {
    const settings = await getSettings(member.guild.id);
    
    // Otorol
    if (settings.autoRole) {
        const role = member.guild.roles.cache.get(settings.autoRole);
        if (role) await member.roles.add(role).catch(() => {});
    }

    // Hoş geldin Mesajı
    if (settings.welcomeChannelId && settings.welcomeMessage) {
        const channel = await member.guild.channels.fetch(settings.welcomeChannelId).catch(() => null);
        if (channel) {
            let formattedMsg = settings.welcomeMessage
                .replace(/{üye}/g, `<@${member.id}>`)
                .replace(/{sayı}/g, member.guild.memberCount.toString())
                .replace(/{kişi}/g, member.guild.memberCount.toString())
                .replace(/{sunucu}/g, member.guild.name);

            // Eğer kullanıcı mesajda sayı kullanmadıysa otomatik sonuna ekle
            if (!formattedMsg.includes(member.guild.memberCount.toString())) {
                formattedMsg += ` (${member.guild.memberCount}. kişi)`;
            }

            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setDescription(formattedMsg)
                .setTimestamp();

            if (settings.welcomeImage) embed.setImage(settings.welcomeImage);

            channel.send({ content: `<@${member.id}>`, embeds: [embed] }).catch(() => {});
        }
    }
    await updateMemberCount(member.guild);
});

client.on('guildMemberRemove', async member => {
    const settings = await getSettings(member.guild.id);
    if (settings.leaveChannelId && settings.leaveMessage) {
        const channel = await member.guild.channels.fetch(settings.leaveChannelId).catch(() => null);
        if (channel) {
            let formattedMsg = settings.leaveMessage
                .replace(/{üye}/g, `**${member.user.tag}**`)
                .replace(/{sayı}/g, member.guild.memberCount.toString())
                .replace(/{kişi}/g, member.guild.memberCount.toString())
                .replace(/{sunucu}/g, member.guild.name);

            if (!formattedMsg.includes(member.guild.memberCount.toString())) {
                formattedMsg += ` (${member.guild.memberCount} kişi kaldık)`;
            }

            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription(formattedMsg)
                .setTimestamp();

            if (settings.leaveImage) embed.setImage(settings.leaveImage);

            channel.send({ embeds: [embed] }).catch(() => {});
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
        await interaction.reply({ content: `Otorol ayarlandı.`, flags: [64] });
    }
    if (commandName === 'panel-ayarla') {
        settings.memberCountChannelId = options.getChannel('kanal').id;
        await settings.save(); await updateMemberCount(guild);
        await interaction.reply({ content: `Üye panel kanalı ayarlandı.`, flags: [64] });
    }
    if (commandName === 'hosgeldin-ayarla') {
        settings.welcomeChannelId = options.getChannel('kanal').id;
        settings.welcomeMessage = options.getString('mesaj');
        settings.welcomeImage = options.getString('resim') || null;
        await settings.save();
        await interaction.reply({ content: `Hoş geldin sistemi ayarlandı! Metin: ${settings.welcomeMessage}`, flags: [64] });
    }
    if (commandName === 'gorusuruz-ayarla') {
        settings.leaveChannelId = options.getChannel('kanal').id;
        settings.leaveMessage = options.getString('mesaj');
        settings.leaveImage = options.getString('resim') || null;
        await settings.save();
        await interaction.reply({ content: `Görüşürüz sistemi ayarlandı! Metin: ${settings.leaveMessage}`, flags: [64] });
    }
    if (commandName === 'ban') {
        const user = options.getUser('kisi');
        const reason = options.getString('sebep') || 'Sebep yok.';
        try {
            await guild.members.ban(user, { reason });
            await interaction.reply({ content: `${user.tag} yasaklandı.` });
        } catch (err) { await interaction.reply({ content: `Hata! Rol sıralamasını kontrol edin.`, flags: [64] }); }
    }
    if (commandName === 'kufur-ekle') {
        const word = options.getString('kelime');
        if (!settings.bannedWords.includes(word)) { settings.bannedWords.push(word); await settings.save(); await interaction.reply({ content: `Eklendi.`, flags: [64] }); }
        else await interaction.reply({ content: `Zaten var.`, flags: [64] });
    }
    if (commandName === 'kufur-sil') {
        const word = options.getString('kelime');
        const index = settings.bannedWords.indexOf(word);
        if (index > -1) { settings.bannedWords.splice(index, 1); await settings.save(); await interaction.reply({ content: `Silindi.`, flags: [64] }); }
        else await interaction.reply({ content: `Bulunamadı.`, flags: [64] });
    }
    if (commandName === 'kufur-liste') {
        if (settings.bannedWords.length === 0) return interaction.reply({ content: 'Liste boş.', flags: [64] });
        await interaction.reply({ content: `**Yasaklı Kelimeler:**\n${settings.bannedWords.join(', ')}`, flags: [64] });
    }
    if (commandName === 'sil') {
        const amount = options.getInteger('miktar');
        if (amount < 1 || amount > 100) return interaction.reply({ content: '1 ile 100 arasında bir miktar belirtin.', flags: [64] });
        
        await interaction.channel.bulkDelete(amount, true).catch(err => {
            return interaction.reply({ content: 'Mesajlar silinirken bir hata oluştu (14 günden eski mesajlar silinemez).', flags: [64] });
        });
        
        await interaction.reply({ content: `${amount} adet mesaj başarıyla silindi.`, flags: [64] });
    }
    if (commandName === 'sunucu-bilgi') {
        const { members, channels, roles, createdAt, ownerId } = guild;
        const embed = new EmbedBuilder()
            .setTitle(`${guild.name} - Sunucu Bilgileri`)
            .setThumbnail(guild.iconURL({ dynamic: true }))
            .addFields(
                { name: '👑 Sahibi', value: `<@${ownerId}>`, inline: true },
                { name: '👥 Üyeler', value: `${guild.memberCount}`, inline: true },
                { name: '💬 Kanallar', value: `${channels.cache.size}`, inline: true },
                { name: '🛡️ Roller', value: `${roles.cache.size}`, inline: true },
                { name: '📅 Kuruluş', value: `<t:${Math.floor(createdAt.getTime() / 1000)}:R>`, inline: true }
            )
            .setColor('Blue')
            .setTimestamp();
        await interaction.reply({ embeds: [embed] });
    }
    if (commandName === 'cekilis-baslat') {
        const durationStr = options.getString('sure');
        const winnerCount = options.getInteger('kazanan');
        const prize = options.getString('odul');
        
        const timeUnits = { 'm': 60000, 'h': 3600000, 'd': 86400000 };
        const unit = durationStr.slice(-1);
        const time = parseInt(durationStr.slice(0, -1));
        
        if (isNaN(time) || !timeUnits[unit]) return interaction.reply({ content: 'Geçersiz süre formatı! Örnek: 10m, 1h, 1d', flags: [64] });
        
        const ms = time * timeUnits[unit];
        const endTimestamp = Math.floor((Date.now() + ms) / 1000);
        
        const embed = new EmbedBuilder()
            .setTitle('🎉 Çekiliş Başladı! 🎉')
            .setDescription(`Ödül: **${prize}**\nBitiş: <t:${endTimestamp}:R>\nDüzenleyen: ${interaction.user}\nKazanan Sayısı: **${winnerCount}**`)
            .setColor('Gold')
            .setFooter({ text: 'Katılmak için aşağıdaki butona basın!' });
            
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('cekilis-katil')
                .setEmoji('🎉')
                .setLabel('Katıl')
                .setStyle(ButtonStyle.Primary)
        );
        
        await interaction.reply({ embeds: [embed], components: [row] });
        const actualMsg = await interaction.fetchReply();
        
        const participants = new Set();
        const collector = actualMsg.createMessageComponentCollector({ time: ms });
        
        collector.on('collect', i => {
            if (i.customId === 'cekilis-katil') {
                if (participants.has(i.user.id)) {
                    return i.reply({ content: 'Zaten çekilişe katıldın!', flags: [64] });
                }
                participants.add(i.user.id);
                i.reply({ content: 'Başarıyla katıldın! 🎉', flags: [64] });
            }
        });
        
        collector.on('end', async () => {
            const winners = Array.from(participants).sort(() => 0.5 - Math.random()).slice(0, winnerCount);
            
            if (winners.length === 0) {
                await actualMsg.edit({ components: [] });
                return interaction.channel.send(`Çekiliş sona erdi! Maalesef kimse katılmadı. Ödül: **${prize}**`);
            }
            
            const winnerMention = winners.map(id => `<@${id}>`).join(', ');
            const winEmbed = new EmbedBuilder()
                .setTitle('🎉 Çekiliş Sona Erdi! 🎉')
                .setDescription(`Ödül: **${prize}**\nKazananlar: ${winnerMention}\nDüzenleyen: ${interaction.user}`)
                .setColor('Green')
                .setTimestamp();
                
            await actualMsg.edit({ embeds: [winEmbed], components: [] });
            interaction.channel.send(`Tebrikler ${winnerMention}! **${prize}** çekilişini kazandınız! 🎉`);
        });
    }

    // Müzik Komutları
    if (commandName === 'oynat') {
        const query = options.getString('şarkı');
        const voiceChannel = interaction.member.voice.channel;
        
        if (!voiceChannel) return interaction.reply({ content: 'Önce bir ses kanalına katılmalısın!', flags: [64] });
        
        await interaction.reply({ content: '🔍 Şarkı aranıyor...', flags: [64] });
        
        try {
            await distube.play(voiceChannel, query, {
                textChannel: interaction.channel,
                member: interaction.member,
                interaction
            });
            // Başarılı olursa distube "playSong" event'ini tetikleyecek
        } catch (err) {
            console.error('Müzik Çalma Hatası:', err);
            await interaction.editReply({ content: `❌ Hata oluştu: ${err.message}` });
        }
    }
    
    if (commandName === 'atla') {
        const queue = distube.getQueue(guildId);
        if (!queue) return interaction.reply({ content: 'Şu an çalan bir şey yok!', ephemeral: true });
        
        try {
            await distube.skip(guildId);
            await interaction.reply({ content: '⏭️ Şarkı atlandı.' });
        } catch (err) {
            await interaction.reply({ content: '⚠️ Sırada başka şarkı yok!', ephemeral: true });
        }
    }
    
    if (commandName === 'durdur') {
        const queue = distube.getQueue(guildId);
        if (!queue) return interaction.reply({ content: 'Şu an çalan bir şey yok!', ephemeral: true });
        
        await distube.stop(guildId);
        await interaction.reply({ content: '⏹️ Müzik durduruldu ve kanaldan çıkıldı.' });
    }
});

client.login(process.env.TOKEN);
