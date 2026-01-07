const registerCategory = (bot, db) => {
    bot.command('addc', (ctx) => {
        const ownerConfig = require('../../../config/owner.json');
        const adminUsername = db.getSetting('adminUsername');
        const isOwner = ctx.from.id === ownerConfig.ownerId;
        const adminList = adminUsername ? adminUsername.split(',').map(a => a.trim().toLowerCase()) : [];
        const isAdmin = ctx.from.username && adminList.includes(ctx.from.username.toLowerCase());
        if (!isOwner && !isAdmin) return ctx.reply('⛔ Akses ditolak');

        const name = ctx.message.text.split(' ').slice(1).join(' ');
        if (!name) return ctx.reply('⚠️ Format: /addc <nama_category>');

        const categories = db.read('categories.json');
        if (categories.find(c => c.name.toLowerCase() === name.toLowerCase())) {
            return ctx.reply('⚠️ Category sudah ada');
        }

        categories.push({ name, createdAt: new Date().toISOString() });
        db.write('categories.json', categories);
        ctx.reply(`✅ Category "${name}" berhasil ditambahkan`);
    });

    bot.command('listc', (ctx) => {
        const categories = db.read('categories.json');
        if (categories.length === 0) return ctx.reply('📭 Belum ada category');

        let msg = `📋 Daftar Category (${categories.length})\n\n`;
        categories.forEach((c, i) => msg += `${i + 1}. ${c.name}\n`);
        ctx.reply(msg);
    });

    bot.command('delc', (ctx) => {
        const ownerConfig = require('../../../config/owner.json');
        const adminUsername = db.getSetting('adminUsername');
        const isOwner = ctx.from.id === ownerConfig.ownerId;
        const adminList = adminUsername ? adminUsername.split(',').map(a => a.trim().toLowerCase()) : [];
        const isAdmin = ctx.from.username && adminList.includes(ctx.from.username.toLowerCase());
        if (!isOwner && !isAdmin) return ctx.reply('⛔ Akses ditolak');

        const name = ctx.message.text.split(' ').slice(1).join(' ');
        if (!name) return ctx.reply('⚠️ Format: /delc <nama_category>');

        const categories = db.read('categories.json');
        const index = categories.findIndex(c => c.name.toLowerCase() === name.toLowerCase());

        if (index === -1) {
            return ctx.reply(`❌ Category "${name}" tidak ditemukan`);
        }

        const deleted = categories.splice(index, 1)[0];
        db.write('categories.json', categories);
        ctx.reply(`✅ Category "${deleted.name}" berhasil dihapus`);
    });
};

module.exports = { registerCategory };
