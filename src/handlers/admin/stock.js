const { getOwnerId } = require('../../middleware/roleCheck');

const registerStock = (bot, db) => {
    bot.command('addst', async (ctx) => {
        const ownerId = await getOwnerId();
        const adminUsername = await db.getSetting('adminUsername');
        const isOwner = ctx.from.id === ownerId;
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

        const product = await db.getProduct(code);
        if (!product) {
            return ctx.reply(`⚠️ Produk "${code}" tidak ditemukan`);
        }

        await db.addStock(code, stockItems);
        const newCount = await db.getStockCount(code);
        ctx.reply(`✅ ${stockItems.length} stok ditambahkan ke ${product.name}\nTotal stok: ${newCount}`);
    });

    bot.command('delst', async (ctx) => {
        const ownerId = await getOwnerId();
        const adminUsername = await db.getSetting('adminUsername');
        const isOwner = ctx.from.id === ownerId;
        const adminList = adminUsername ? adminUsername.split(',').map(a => a.trim().toLowerCase()) : [];
        const isAdmin = ctx.from.username && adminList.includes(ctx.from.username.toLowerCase());
        if (!isOwner && !isAdmin) return ctx.reply('⛔ Akses ditolak');

        const args = ctx.message.text.split(' ').slice(1);

        if (args.length < 1) {
            return ctx.reply('⚠️ Format:\n/delst <code> - Hapus semua stok\n/delst <code> <jumlah> - Hapus sejumlah stok');
        }

        const code = args[0];
        const amount = args[1] ? parseInt(args[1]) : null;

        const product = await db.getProduct(code);
        if (!product) {
            return ctx.reply(`⚠️ Produk "${code}" tidak ditemukan`);
        }

        const currentStock = await db.getStockCount(code);
        if (currentStock === 0) {
            return ctx.reply(`⚠️ Stok produk "${product.name}" sudah kosong`);
        }

        let deleted = 0;
        if (amount && amount > 0) {
            deleted = await db.deleteStock(code, amount);
        } else {
            deleted = await db.deleteStock(code, currentStock);
        }

        const newStock = await db.getStockCount(code);
        ctx.reply(`✅ ${deleted} stok dihapus dari ${product.name}\nSisa stok: ${newStock}`);
    });
};

module.exports = { registerStock };
