const { Markup } = require('telegraf');
const { getOwnerId } = require('../../middleware/roleCheck');

const broadcastSession = {};

const setBroadcastMode = (userId, state) => {
    if (state) broadcastSession[userId] = true;
    else delete broadcastSession[userId];
};

const isBroadcastMode = (userId) => {
    return !!broadcastSession[userId];
};

const registerBroadcast = (bot, db) => {
    bot.command('broadcast', async (ctx) => {
        const ownerId = await getOwnerId();
        const adminUsername = await db.getSetting('adminUsername');
        const userUsername = ctx.from.username;

        const isOwner = ctx.from.id === ownerId;
        const adminList = adminUsername ? adminUsername.split(',').map(a => a.trim().toLowerCase()) : [];
        const isAdmin = userUsername && adminList.includes(userUsername.toLowerCase());

        if (!isOwner && !isAdmin) {
            return ctx.reply('⛔ Akses ditolak');
        }

        setBroadcastMode(ctx.from.id, true);
        return ctx.reply('📢 Kirim pesan yang ingin di-broadcast ke semua MEMBER:\n\n(Ketik /cancel untuk membatalkan)', Markup.forceReply());
    });

    bot.on('text', async (ctx, next) => {
        const userId = ctx.from.id;

        if (!isBroadcastMode(userId)) {
            return next();
        }

        if (ctx.message.text === '/cancel') {
            setBroadcastMode(userId, false);
            return ctx.reply('❌ Broadcast dibatalkan');
        }

        setBroadcastMode(userId, false);

        const members = await db.getMembers();
        const targets = members.map(m => m.userId).filter(id => id);

        if (targets.length === 0) {
            return ctx.reply('❌ Tidak ada member untuk broadcast.');
        }

        await ctx.reply(`📢 Memulai broadcast ke ${targets.length} member...`);

        let successCount = 0;
        let failCount = 0;

        for (const target of targets) {
            try {
                await ctx.telegram.sendMessage(target, `📢 *BROADCAST*\n\n${ctx.message.text}`, { parse_mode: 'Markdown' });
                successCount++;
            } catch (e) {
                failCount++;
            }
            await new Promise(r => setTimeout(r, 100));
        }

        let resultMsg = `╭ - - - - - - - - - - - - - - - - - - - ╮\n`;
        resultMsg += `┊  📢 BROADCAST SELESAI\n`;
        resultMsg += `┊- - - - - - - - - - - - - - - - - - - - -\n`;
        resultMsg += `┊  ✅ Berhasil: ${successCount}\n`;
        resultMsg += `┊  ❌ Gagal: ${failCount}\n`;
        resultMsg += `┊  📊 Total: ${targets.length}\n`;
        resultMsg += `╰ - - - - - - - - - - - - - - - - - - - ╯`;

        return ctx.reply(resultMsg);
    });
};

module.exports = { registerBroadcast };
