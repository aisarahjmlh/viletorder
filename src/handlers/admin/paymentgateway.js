const { getOwnerId } = require('../../middleware/roleCheck');

const registerPaymentGateway = (bot, db) => {
    bot.command('setpg', async (ctx) => {
        const ownerId = await getOwnerId();
        const adminUsername = await db.getSetting('adminUsername');
        const userUsername = ctx.from.username;

        const isOwner = ctx.from.id === ownerId;
        const adminList = adminUsername ? adminUsername.split(',').map(a => a.trim().toLowerCase()) : [];
        const isAdmin = userUsername && adminList.includes(userUsername.toLowerCase());

        if (!isOwner && !isAdmin) return ctx.reply('⛔ Akses ditolak');

        const args = ctx.message.text.split(' ').slice(1);

        if (args.length === 0) {
            const current = await db.getSetting('channelPayment') || 'qris';
            return ctx.reply(`💳 *PAYMENT GATEWAY*\n\nChannel saat ini: *${current.toUpperCase()}*\n\n*Channel tersedia:*\n• qris - QRIS Standard\n• qrisc - QRIS Custom\n\nFormat: /setpg qris atau /setpg qrisc`, { parse_mode: 'Markdown' });
        }

        const channel = args[0].toLowerCase();
        if (!['qris', 'qrisc'].includes(channel)) {
            return ctx.reply('❌ Channel tidak valid. Gunakan: qris atau qrisc');
        }

        await db.setSetting('channelPayment', channel);
        ctx.reply(`✅ Channel payment berhasil diubah ke *${channel.toUpperCase()}*`, { parse_mode: 'Markdown' });
    });
};

module.exports = { registerPaymentGateway };
