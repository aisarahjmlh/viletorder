const { Markup } = require('telegraf');

const registerCheckBalance = (bot, db) => {
    bot.command('checkbalance', (ctx) => {
        const ownerConfig = require('../../../config/owner.json');
        const adminUsername = db.getSetting('adminUsername');
        const userUsername = ctx.from.username;

        const isOwner = ctx.from.id === ownerConfig.ownerId;
        const adminList = adminUsername ? adminUsername.split(',').map(a => a.trim().toLowerCase()) : [];
        const isAdmin = userUsername && adminList.includes(userUsername.toLowerCase());

        if (!isOwner && !isAdmin) {
            return ctx.reply('⛔ Akses ditolak');
        }

        const members = db.read('members.json') || [];
        const totalSaldo = members.reduce((acc, curr) => acc + (curr.saldo || 0), 0);

        return ctx.reply(`total semua saldo user : rp ${totalSaldo.toLocaleString('id-ID')}`);
    });
};

module.exports = { registerCheckBalance };
