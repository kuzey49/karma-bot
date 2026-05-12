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
    ]
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
        await interaction.reply({ content: `Otorol ayarlandı.`, ephemeral: true });
    }
    if (commandName === 'panel-ayarla') {
        settings.memberCountChannelId = options.getChannel('kanal').id;
        await settings.save(); await updateMemberCount(guild);
        await interaction.reply({ content: `Üye panel kanalı ayarlandı.`, ephemeral: true });
    }
    if (commandName === 'hosgeldin-ayarla') {
        settings.welcomeChannelId = options.getChannel('kanal').id;
        settings.welcomeMessage = options.getString('mesaj');
        settings.welcomeImage = options.getString('resim') || null;
        await settings.save();
        await interaction.reply({ content: `Hoş geldin sistemi ayarlandı! Metin: ${settings.welcomeMessage}`, ephemeral: true });
    }
    if (commandName === 'gorusuruz-ayarla') {
        settings.leaveChannelId = options.getChannel('kanal').id;
        settings.leaveMessage = options.getString('mesaj');
        settings.leaveImage = options.getString('resim') || null;
        await settings.save();
        await interaction.reply({ content: `Görüşürüz sistemi ayarlandı! Metin: ${settings.leaveMessage}`, ephemeral: true });
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
        if (settings.bannedWords.length === 0) return interaction.reply({ content: 'Liste boş.', ephemeral: true });
        await interaction.reply({ content: `**Yasaklı Kelimeler:**\n${settings.bannedWords.join(', ')}`, ephemeral: true });
    }
    if (commandName === 'sil') {
        const amount = options.getInteger('miktar');
        if (amount < 1 || amount > 100) return interaction.reply({ content: '1 ile 100 arasında bir miktar belirtin.', ephemeral: true });
        
        await interaction.channel.bulkDelete(amount, true).catch(err => {
            return interaction.reply({ content: 'Mesajlar silinirken bir hata oluştu (14 günden eski mesajlar silinemez).', ephemeral: true });
        });
        
        await interaction.reply({ content: `${amount} adet mesaj başarıyla silindi.`, ephemeral: true });
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
        
        if (isNaN(time) || !timeUnits[unit]) return interaction.reply({ content: 'Geçersiz süre formatı! Örnek: 10m, 1h, 1d', ephemeral: true });
        
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
        
        const msg = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });
        
        const participants = new Set();
        const collector = msg.createMessageComponentCollector({ time: ms });
        
        collector.on('collect', i => {
            if (i.customId === 'cekilis-katil') {
                if (participants.has(i.user.id)) {
                    return i.reply({ content: 'Zaten çekilişe katıldın!', ephemeral: true });
                }
                participants.add(i.user.id);
                i.reply({ content: 'Başarıyla katıldın! 🎉', ephemeral: true });
            }
        });
        
        collector.on('end', async () => {
            const winners = Array.from(participants).sort(() => 0.5 - Math.random()).slice(0, winnerCount);
            
            if (winners.length === 0) {
                await msg.edit({ components: [] });
                return interaction.channel.send(`Çekiliş sona erdi! Maalesef kimse katılmadı. Ödül: **${prize}**`);
            }
            
            const winnerMention = winners.map(id => `<@${id}>`).join(', ');
            const winEmbed = new EmbedBuilder()
                .setTitle('🎉 Çekiliş Sona Erdi! 🎉')
                .setDescription(`Ödül: **${prize}**\nKazananlar: ${winnerMention}\nDüzenleyen: ${interaction.user}`)
                .setColor('Green')
                .setTimestamp();
                
            await msg.edit({ embeds: [winEmbed], components: [] });
            interaction.channel.send(`Tebrikler ${winnerMention}! **${prize}** çekilişini kazandınız! 🎉`);
        });
    }
});

client.login(process.env.TOKEN);
