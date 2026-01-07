const registerStock = (bot, db) => {
    bot.command('addst', (ctx) => {
        const ownerConfig = require('../../../config/owner.json');
        const adminUsername = db.getSetting('adminUsername');
        const isOwner = ctx.from.id === ownerConfig.ownerId;
        const adminList = adminUsername ? adminUsername.split(',').map(a => a.trim().toLowerCase()) : [];
        const isAdmin = ctx.from.username && adminList.includes(ctx.from.username.toLowerCase());
        if (!isOwner && !isAdmin) return ctx.reply('⛔ Akses ditolak');

        const lines = ctx.message.text.split('\n');
        const firstLine = lines[0].split(' ').slice(1).join(' ').trim();

        if (!firstLine) {
            return ctx.reply('⚠️ Format:\n/addst <code>\nstok1\nstok2\nstok3');
        }

        const code = firstLine;
        const stockItems = lines.slice(1).filter(l => l.trim());

        if (stockItems.length === 0) {
            return ctx.reply('⚠️ Masukkan stok di baris baru setelah code');
        }

        const products = db.read('products.json');
        const product = products.find(p => p.code.toLowerCase() === code.toLowerCase());

        if (!product) {
            return ctx.reply(`⚠️ Produk "${code}" tidak ditemukan`);
        }

        product.stock.push(...stockItems);
        db.write('products.json', products);
        ctx.reply(`✅ ${stockItems.length} stok ditambahkan ke ${product.name}\nTotal stok: ${product.stock.length}`);
    });

    bot.command('delst', (ctx) => {
        const ownerConfig = require('../../../config/owner.json');
        const adminUsername = db.getSetting('adminUsername');
        const isOwner = ctx.from.id === ownerConfig.ownerId;
        const adminList = adminUsername ? adminUsername.split(',').map(a => a.trim().toLowerCase()) : [];
        const isAdmin = ctx.from.username && adminList.includes(ctx.from.username.toLowerCase());
        if (!isOwner && !isAdmin) return ctx.reply('⛔ Akses ditolak');

        const args = ctx.message.text.split(' ').slice(1);

        if (args.length < 1) {
            return ctx.reply('⚠️ Format:\n/delst <code> - Hapus semua stok\n/delst <code> <jumlah> - Hapus sejumlah stok');
        }

        const code = args[0];
        const amount = args[1] ? parseInt(args[1]) : null;

        const products = db.read('products.json');
        const product = products.find(p => p.code.toLowerCase() === code.toLowerCase());

        if (!product) {
            return ctx.reply(`⚠️ Produk "${code}" tidak ditemukan`);
        }

        if (product.stock.length === 0) {
            return ctx.reply(`⚠️ Stok produk "${product.name}" sudah kosong`);
        }

        let deleted = 0;
        if (amount && amount > 0) {
            // Delete specific amount
            deleted = Math.min(amount, product.stock.length);
            product.stock.splice(0, deleted);
        } else {
            // Delete all stock
            deleted = product.stock.length;
            product.stock = [];
        }

        db.write('products.json', products);
        ctx.reply(`✅ ${deleted} stok dihapus dari ${product.name}\nSisa stok: ${product.stock.length}`);
    });
};

module.exports = { registerStock };
