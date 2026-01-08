const { getOwnerId } = require('../../middleware/roleCheck');

const registerCategory = (bot, db) => {
    bot.command('addc', async (ctx) => {
        const ownerId = await getOwnerId();
        const adminUsername = await db.getSetting('adminUsername');
        const isOwner = ctx.from.id === ownerId;
        const adminList = adminUsername ? adminUsername.split(',').map(a => a.trim().toLowerCase()) : [];
        const isAdmin = ctx.from.username && adminList.includes(ctx.from.username.toLowerCase());
        if (!isOwner && !isAdmin) return ctx.reply('⛔ Akses ditolak');

        const name = ctx.message.text.split(' ').slice(1).join(' ');
        if (!name) return ctx.reply('⚠️ Format: /addc <nama_category>');

        const result = await db.addCategory(name);
        if (!result) {
            return ctx.reply('⚠️ Category sudah ada');
        }

        ctx.reply(`✅ Category "${name}" berhasil ditambahkan`);
    });

    bot.command('listc', async (ctx) => {
        const categories = await db.getCategories();
        if (categories.length === 0) return ctx.reply('📭 Belum ada category');

        let msg = `📋 Daftar Category (${categories.length})\n\n`;
        categories.forEach((c, i) => msg += `${i + 1}. ${c}\n`);
        ctx.reply(msg);
    });

    bot.command('delc', async (ctx) => {
        const ownerId = await getOwnerId();
        const adminUsername = await db.getSetting('adminUsername');
        const isOwner = ctx.from.id === ownerId;
        const adminList = adminUsername ? adminUsername.split(',').map(a => a.trim().toLowerCase()) : [];
        const isAdmin = ctx.from.username && adminList.includes(ctx.from.username.toLowerCase());
        if (!isOwner && !isAdmin) return ctx.reply('⛔ Akses ditolak');

        const name = ctx.message.text.split(' ').slice(1).join(' ');
        if (!name) return ctx.reply('⚠️ Format: /delc <nama_category>');

        const result = await db.removeCategory(name);
        if (!result) {
            return ctx.reply(`❌ Category "${name}" tidak ditemukan`);
        }

        ctx.reply(`✅ Category "${name}" berhasil dihapus`);
    });
};

module.exports = { registerCategory };
