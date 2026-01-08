const { getOwnerId } = require('../../middleware/roleCheck');

const registerProduct = (bot, db) => {
    bot.command('addprd', async (ctx) => {
        const ownerId = await getOwnerId();
        const adminUsername = await db.getSetting('adminUsername');
        const isOwner = ctx.from.id === ownerId;
        const adminList = adminUsername ? adminUsername.split(',').map(a => a.trim().toLowerCase()) : [];
        const isAdmin = ctx.from.username && adminList.includes(ctx.from.username.toLowerCase());
        if (!isOwner && !isAdmin) return ctx.reply('⛔ Akses ditolak');

        const args = ctx.message.text.split(' ').slice(1).join(' ');
        const parts = args.split(',').map(p => p.trim());

        if (parts.length < 5) {
            return ctx.reply('⚠️ Format: /addprd category,code,nama,harga,deskripsi');
        }

        const [category, code, name, price, ...descParts] = parts;
        const description = descParts.join(',');

        // Check if category exists
        const categories = await db.getCategories();
        if (!categories.find(c => c.toLowerCase() === category.toLowerCase())) {
            return ctx.reply(`⚠️ Category "${category}" tidak ditemukan`);
        }

        const result = await db.addProduct({
            category,
            code,
            name,
            price: parseInt(price),
            description,
            stock: []
        });

        if (!result) {
            return ctx.reply(`⚠️ Code "${code}" sudah digunakan`);
        }

        ctx.reply(`✅ Produk "${name}" (${code}) berhasil ditambahkan`);
    });

    bot.command('listprd', async (ctx) => {
        const products = await db.getProducts();
        if (products.length === 0) return ctx.reply('📭 Belum ada produk');

        let msg = `📋 Daftar Produk (${products.length})\n\n`;
        products.forEach((p, i) => {
            msg += `${i + 1}. [${p.code}] ${p.name}\n   ${p.category || 'No Category'} | Rp${p.price.toLocaleString()} | Stok: ${p.stock.length}\n\n`;
        });
        ctx.reply(msg);
    });

    bot.command('delprd', async (ctx) => {
        const ownerId = await getOwnerId();
        const adminUsername = await db.getSetting('adminUsername');
        const isOwner = ctx.from.id === ownerId;
        const adminList = adminUsername ? adminUsername.split(',').map(a => a.trim().toLowerCase()) : [];
        const isAdmin = ctx.from.username && adminList.includes(ctx.from.username.toLowerCase());
        if (!isOwner && !isAdmin) return ctx.reply('⛔ Akses ditolak');

        const args = ctx.message.text.split(' ').slice(1);
        if (args.length === 0) {
            return ctx.reply('⚠️ Format: /delprd <code>');
        }

        const code = args[0];
        const result = await db.removeProduct(code);

        if (!result) {
            return ctx.reply(`❌ Produk dengan code "${code}" tidak ditemukan`);
        }

        ctx.reply(`✅ Produk "${code}" berhasil dihapus`);
    });

    bot.command('editprd', async (ctx) => {
        const ownerId = await getOwnerId();
        const adminUsername = await db.getSetting('adminUsername');
        const isOwner = ctx.from.id === ownerId;
        const adminList = adminUsername ? adminUsername.split(',').map(a => a.trim().toLowerCase()) : [];
        const isAdmin = ctx.from.username && adminList.includes(ctx.from.username.toLowerCase());
        if (!isOwner && !isAdmin) return ctx.reply('⛔ Akses ditolak');

        const args = ctx.message.text.split(' ').slice(1);
        if (args.length < 3) {
            let msg = `⚠️ Format: /editprd <code> <field> <value>\n\n`;
            msg += `Field yang bisa diedit:\n`;
            msg += `• code - Kode produk\n`;
            msg += `• name - Nama produk\n`;
            msg += `• price - Harga produk\n`;
            msg += `• desc - Deskripsi\n`;
            msg += `• category - Kategori\n\n`;
            msg += `Contoh:\n`;
            msg += `/editprd net price 15000\n`;
            msg += `/editprd net code netflix\n`;
            msg += `/editprd net name Netflix Premium`;
            return ctx.reply(msg);
        }

        // Note: For editprd, we need a more complex implementation
        // This is a simplified version - full implementation needs direct SQL queries
        ctx.reply('⚠️ Fitur edit produk sedang dalam pengembangan untuk versi MySQL');
    });
};

module.exports = { registerProduct };
