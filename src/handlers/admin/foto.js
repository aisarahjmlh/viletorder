const registerFoto = (bot, db) => {
    bot.command('foto', (ctx) => {
        const ownerConfig = require('../../../config/owner.json');
        const adminUsername = db.getSetting('adminUsername');
        const userUsername = ctx.from.username;

        const isOwner = ctx.from.id === ownerConfig.ownerId;
        const adminList = adminUsername ? adminUsername.split(',').map(a => a.trim().toLowerCase()) : [];
        const isAdmin = userUsername && adminList.includes(userUsername.toLowerCase());

        if (!isOwner && !isAdmin) {
            return ctx.reply('⛔ Akses ditolak');
        }

        const args = ctx.message.text.split(' ').slice(1);
        if (args.length === 0) {
            const current = db.getSetting('photo');
            if (current) {
                return ctx.reply(`📷 Foto saat ini: ${current}\n\nGunakan /foto <url> untuk mengubah\nGunakan /foto hapus untuk menghapus`);
            }
            return ctx.reply('⚠️ Format: /foto <url gambar>');
        }

        if (args[0].toLowerCase() === 'hapus') {
            db.setSetting('photo', null);
            return ctx.reply('✅ Foto berhasil dihapus');
        }

        const url = args[0];
        db.setSetting('photo', url);
        ctx.reply('✅ Foto berhasil disimpan');
    });
};

module.exports = { registerFoto };
