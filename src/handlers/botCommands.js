const { isOwner } = require('../middleware/roleCheck');
const Database = require('../database/Database');

const parseDuration = (duration) => {
    if (!duration) return null;

    const match = duration.match(/^(\d+)(s|m|h|d|month)$/i);
    if (!match) return null;

    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    let ms = 0;
    switch (unit) {
        case 's':
            ms = value * 1000;
            break;
        case 'm':
            ms = value * 60 * 1000;
            break;
        case 'h':
            ms = value * 60 * 60 * 1000;
            break;
        case 'd':
            ms = value * 24 * 60 * 60 * 1000;
            break;
        case 'month':
            ms = value * 30 * 24 * 60 * 60 * 1000;
            break;
        default:
            return null;
    }

    return new Date(Date.now() + ms).toISOString();
};

const registerBotCommands = (bot, botManager) => {
    bot.command('addbot', isOwner(), async (ctx) => {
        const args = ctx.message.text.split(' ').slice(1);
        if (args.length < 3) {
            return ctx.reply('⚠️ Format: /addbot <token> @username <apiKey> <secretKey> <durasi>\n\nContoh durasi:\n• 5s = 5 detik\n• 5m = 5 menit\n• 5h = 5 jam\n• 5d = 5 hari\n• 5month = 5 bulan');
        }

        const token = args[0];
        let adminUsername = args[1];
        const apiKey = args[2];
        const secretKey = args[3];
        const duration = args[4];

        if (!adminUsername.startsWith('@')) {
            return ctx.reply('⚠️ Username harus diawali dengan @');
        }

        adminUsername = adminUsername.substring(1);

        let violetConfig = null;
        if (apiKey && secretKey) {
            violetConfig = {
                apiKey,
                secretKey,
                isProduction: true
            };
        }

        let expiresAt = null;
        if (duration) {
            expiresAt = parseDuration(duration);
            if (!expiresAt) {
                return ctx.reply('⚠️ Format durasi tidak valid. Contoh: 5s, 5m, 5d, 5month');
            }
        }

        ctx.reply('⏳ Menambahkan bot...');

        const result = await botManager.addBot(token, violetConfig, adminUsername, expiresAt);

        if (result.success) {
            const db = new Database(result.botId);
            db.setSetting('adminUsername', adminUsername);

            let msg = `✅ Bot berhasil ditambahkan!\n\n` +
                `🆔 ID: ${result.botId}\n` +
                `🤖 @${result.username}\n` +
                `👤 Admin: @${adminUsername}`;

            if (violetConfig) {
                msg += `\n💳 VioletPay: Configured`;
            }

            if (expiresAt) {
                const expDate = new Date(expiresAt);
                msg += `\n⏰ Expired: ${expDate.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`;
            }

            ctx.reply(msg);
        } else {
            ctx.reply(`❌ Gagal: ${result.error}`);
        }
    });

    bot.command('delbot', isOwner(), async (ctx) => {
        const args = ctx.message.text.split(' ').slice(1);
        if (args.length === 0) {
            return ctx.reply('⚠️ Format: /delbot <botId>');
        }

        const botId = args[0];
        const result = await botManager.removeBot(botId);

        if (result.success) {
            ctx.reply(`✅ Bot ${botId} berhasil dihapus!`);
        } else {
            ctx.reply(`❌ Gagal: ${result.error}`);
        }
    });

    bot.command('listbot', isOwner(), async (ctx) => {
        const bots = botManager.getBots();

        if (bots.length === 0) {
            return ctx.reply('📭 Belum ada bot terdaftar.');
        }

        let message = `📋 Daftar Bot (${bots.length})\n\n`;
        for (const [index, botData] of bots.entries()) {
            const isRunning = botManager.runningBots.has(botData.id);
            const status = isRunning ? '🟢' : '🔴';
            const adminUsername = botData.adminUsername || '-';

            let expInfo = '';
            if (botData.expiresAt) {
                const expDate = new Date(botData.expiresAt);
                const isExpired = expDate < new Date();
                const expStatus = isExpired ? '🔴 EXPIRED' : '🟢 Active';
                expInfo = `\n   ⏰ ${expStatus}: ${expDate.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`;
            }

            message += `${index + 1}. ${status} @${botData.username}\n   ID: ${botData.id}\n   Admin: @${adminUsername}${expInfo}\n\n`;
        }

        ctx.reply(message);
    });

    bot.command('addactive', isOwner(), async (ctx) => {
        const args = ctx.message.text.split(' ').slice(1);
        if (args.length < 2) {
            return ctx.reply('⚠️ Format: /addactive <botId/@username> <durasi>\n\nContoh durasi:\n• 5s = 5 detik\n• 5m = 5 menit\n• 5h = 5 jam\n• 5d = 5 hari\n• 5month = 5 bulan');
        }

        let identifier = args[0];
        const duration = args[1];

        if (identifier.startsWith('@')) {
            identifier = identifier.substring(1);
        }

        const data = botManager.loadBotsData();
        const botData = data.bots.find(b =>
            b.id === identifier ||
            b.username.toLowerCase() === identifier.toLowerCase()
        );

        if (!botData) {
            return ctx.reply(`❌ Bot "${identifier}" tidak ditemukan`);
        }

        const match = duration.match(/^(\d+)(s|m|h|d|month)$/i);
        if (!match) {
            return ctx.reply('❌ Format durasi tidak valid. Contoh: 5s, 5m, 5h, 5d, 5month');
        }

        const value = parseInt(match[1]);
        const unit = match[2].toLowerCase();

        let ms = 0;
        switch (unit) {
            case 's': ms = value * 1000; break;
            case 'm': ms = value * 60 * 1000; break;
            case 'h': ms = value * 60 * 60 * 1000; break;
            case 'd': ms = value * 24 * 60 * 60 * 1000; break;
            case 'month': ms = value * 30 * 24 * 60 * 60 * 1000; break;
        }

        const baseDate = botData.expiresAt ? new Date(botData.expiresAt) : new Date();
        const newExpiry = new Date(Math.max(baseDate.getTime(), Date.now()) + ms);
        botData.expiresAt = newExpiry.toISOString();

        botManager.saveBotsData(data);

        const expStr = newExpiry.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
        ctx.reply(`✅ Masa aktif bot @${botData.username} diperpanjang!\n\n⏰ Expired baru: ${expStr} WIB`);

        if (!botManager.runningBots.has(botData.id)) {
            try {
                const BotInstance = require('../bot/BotInstance');
                const botInstance = new BotInstance(botData.token, botManager);
                await botInstance.start();
                botManager.runningBots.set(botData.id, botInstance);
                ctx.reply(`🟢 Bot @${botData.username} berhasil diaktifkan kembali!`);
            } catch (e) {
                ctx.reply(`⚠️ Gagal mengaktifkan bot: ${e.message}`);
            }
        }
    });
};

module.exports = { registerBotCommands };
