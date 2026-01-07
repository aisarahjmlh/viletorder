const registerProduct = (bot, db) => {
    bot.command('addprd', (ctx) => {
        const ownerConfig = require('../../../config/owner.json');
        const adminUsername = db.getSetting('adminUsername');
        const isOwner = ctx.from.id === ownerConfig.ownerId;
        const adminList = adminUsername ? adminUsername.split(',').map(a => a.trim().toLowerCase()) : [];
        const isAdmin = ctx.from.username && adminList.includes(ctx.from.username.toLowerCase());
        if (!isOwner && !isAdmin) return ctx.reply('⛔ Akses ditolak');

        const args = ctx.message.text.split(' ').slice(1).join(' ');
        const parts = args.split(',').map(p => p.trim());

        if (parts.length < 5) {
            return ctx.reply('⚠️ Format: /addprd category,code,nama,harga,deskripsi');
        }

        const [category, code, name, price, ...descParts] = parts;
        const desc = descParts.join(',');

        const categories = db.read('categories.json');
        if (!categories.find(c => c.name.toLowerCase() === category.toLowerCase())) {
            return ctx.reply(`⚠️ Category "${category}" tidak ditemukan`);
        }

        const products = db.read('products.json');
        if (products.find(p => p.code.toLowerCase() === code.toLowerCase())) {
            return ctx.reply(`⚠️ Code "${code}" sudah digunakan`);
        }

        products.push({
            category, code, name,
            price: parseInt(price),
            desc,
            stock: [],
            createdAt: new Date().toISOString()
        });
        db.write('products.json', products);
        ctx.reply(`✅ Produk "${name}" (${code}) berhasil ditambahkan`);
    });

    bot.command('listprd', (ctx) => {
        const products = db.read('products.json');
        if (products.length === 0) return ctx.reply('📭 Belum ada produk');

        let msg = `📋 Daftar Produk (${products.length})\n\n`;
        products.forEach((p, i) => {
            msg += `${i + 1}. [${p.code}] ${p.name}\n   ${p.category} | Rp${p.price.toLocaleString()} | Stok: ${p.stock.length}\n\n`;
        });
        ctx.reply(msg);
    });

    bot.command('delprd', (ctx) => {
        const ownerConfig = require('../../../config/owner.json');
        const adminUsername = db.getSetting('adminUsername');
        const isOwner = ctx.from.id === ownerConfig.ownerId;
        const adminList = adminUsername ? adminUsername.split(',').map(a => a.trim().toLowerCase()) : [];
        const isAdmin = ctx.from.username && adminList.includes(ctx.from.username.toLowerCase());
        if (!isOwner && !isAdmin) return ctx.reply('⛔ Akses ditolak');

        const args = ctx.message.text.split(' ').slice(1);
        if (args.length === 0) {
            return ctx.reply('⚠️ Format: /delprd <code>');
        }

        const code = args[0].toLowerCase();
        const products = db.read('products.json');
        const index = products.findIndex(p => p.code.toLowerCase() === code);

        if (index === -1) {
            return ctx.reply(`❌ Produk dengan code "${code}" tidak ditemukan`);
        }

        const deleted = products.splice(index, 1)[0];
        db.write('products.json', products);
        ctx.reply(`✅ Produk "${deleted.name}" (${deleted.code}) berhasil dihapus`);
    });

    bot.command('editprd', (ctx) => {
        const ownerConfig = require('../../../config/owner.json');
        const adminUsername = db.getSetting('adminUsername');
        const isOwner = ctx.from.id === ownerConfig.ownerId;
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

        const code = args[0].toLowerCase();
        const field = args[1].toLowerCase();
        const value = args.slice(2).join(' ');

        const validFields = ['code', 'name', 'price', 'desc', 'category'];
        if (!validFields.includes(field)) {
            return ctx.reply(`❌ Field "${field}" tidak valid. Gunakan: ${validFields.join(', ')}`);
        }

        const products = db.read('products.json');
        const product = products.find(p => p.code.toLowerCase() === code);

        if (!product) {
            return ctx.reply(`❌ Produk dengan code "${code}" tidak ditemukan`);
        }

        const oldValue = product[field];

        if (field === 'price') {
            const priceNum = parseInt(value);
            if (isNaN(priceNum) || priceNum < 0) {
                return ctx.reply('❌ Harga harus berupa angka positif');
            }
            product.price = priceNum;
        } else if (field === 'code') {
            if (products.find(p => p.code.toLowerCase() === value.toLowerCase() && p !== product)) {
                return ctx.reply(`❌ Code "${value}" sudah digunakan produk lain`);
            }
            product.code = value;
        } else if (field === 'category') {
            const categories = db.read('categories.json');
            if (!categories.find(c => c.name.toLowerCase() === value.toLowerCase())) {
                return ctx.reply(`❌ Category "${value}" tidak ditemukan`);
            }
            product.category = value;
        } else {
            product[field] = value;
        }

        db.write('products.json', products);
        ctx.reply(`✅ Produk "${product.name}" berhasil diupdate\n\n${field}: ${oldValue} → ${product[field]}`);
    });
};

module.exports = { registerProduct };
