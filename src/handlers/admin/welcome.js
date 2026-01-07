const registerWelcome = (bot, db) => {
    bot.command('setwelc', (ctx) => {
        const ownerConfig = require('../../../config/owner.json');
        const adminUsername = db.getSetting('adminUsername');
        const userUsername = ctx.from.username;

        const isOwner = ctx.from.id === ownerConfig.ownerId;
        const adminList = adminUsername ? adminUsername.split(',').map(a => a.trim().toLowerCase()) : [];
        const isAdmin = userUsername && adminList.includes(userUsername.toLowerCase());
        const isMainBot = db.botId === 'main';

        // Main bot: only owner can set welcome (for rental page)
        // Child bot: admin can set welcome (for member start page)
        if (isMainBot && !isOwner) {
            return ctx.reply('⛔ Akses ditolak. Hanya owner.');
        }
        if (!isMainBot && !isOwner && !isAdmin) {
            return ctx.reply('⛔ Akses ditolak');
        }

        const text = ctx.message.text.split(' ').slice(1).join(' ');

        if (!text) {
            const current = db.getSetting('welcomeText');
            let helpMsg = `📝 *SET WELCOME TEXT*\n\n`;
            helpMsg += `Format: /setwelc <teks>\n\n`;
            helpMsg += `*Variable yang tersedia:*\n`;
            helpMsg += `• {name} = Nama user\n`;
            helpMsg += `• {saldo} = Saldo user\n`;
            helpMsg += `• {tanggal} = Tanggal WIB lengkap\n`;
            helpMsg += `• {totalorder} = Total order user\n`;
            helpMsg += `• {rating} = Rating bot\n`;
            helpMsg += `• {totaluser} = Total pengguna\n`;
            helpMsg += `• {totalpenjualan} = Total penjualan\n`;
            helpMsg += `• {totalomzet} = Total omzet\n`;
            if (isMainBot) {
                helpMsg += `• {price} = Harga sewa\n`;
            }
            helpMsg += `\n*Contoh:*\n`;
            helpMsg += `/setwelc Halo {name}! 👋\nSelamat datang di store kami!\n\n`;
            if (current) {
                helpMsg += `─────────────────\n`;
                helpMsg += `*Teks saat ini:*\n${current}\n\n`;
                helpMsg += `Gunakan /setwelc hapus untuk menghapus`;
            }
            return ctx.reply(helpMsg, { parse_mode: 'Markdown' });
        }

        if (text.toLowerCase() === 'hapus') {
            db.setSetting('welcomeText', null);
            return ctx.reply('✅ Welcome text berhasil dihapus. Akan menggunakan teks default.');
        }

        db.setSetting('welcomeText', text);

        // Generate preview with sample data
        const stats = db.getStats();
        const members = db.getMembers();
        const now = new Date();
        const tanggalWIB = now.toLocaleString('id-ID', {
            timeZone: 'Asia/Jakarta',
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        }) + ' WIB';

        const ratingText = stats.rating && stats.rating.count > 0
            ? `${stats.rating.total} / 5.0 (${stats.rating.count} ulasan)`
            : '0 / 5.0 (0 ulasan)';

        const preview = text
            .replace(/{name}/g, ctx.from.first_name)
            .replace(/{saldo}/g, 'Rp0')
            .replace(/{price}/g, 'Rp50.000')
            .replace(/{tanggal}/g, tanggalWIB)
            .replace(/{totalorder}/g, '0')
            .replace(/{rating}/g, ratingText)
            .replace(/{totaluser}/g, members.length.toLocaleString())
            .replace(/{totalpenjualan}/g, (stats.totalSales || 0).toLocaleString())
            .replace(/{totalomzet}/g, `Rp${(stats.totalOmzet || 0).toLocaleString()}`);

        ctx.reply(`✅ Welcome text berhasil disimpan!\n\n*Preview:*\n${preview}`, { parse_mode: 'Markdown' });
    });

    // Set Rating Command
    bot.command('setrating', (ctx) => {
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

        if (args.length < 2) {
            const stats = db.getStats();
            const currentRating = stats.rating && stats.rating.count > 0
                ? `${stats.rating.total} / 5.0 (${stats.rating.count} ulasan)`
                : 'Belum ada rating';
            return ctx.reply(`⭐ *SET RATING BOT*\n\nFormat: /setrating <rating> <jumlah_ulasan>\nContoh: /setrating 4.9 149\n\nRating saat ini: ${currentRating}`, { parse_mode: 'Markdown' });
        }

        const rating = parseFloat(args[0]);
        const count = parseInt(args[1]);

        if (isNaN(rating) || rating < 0 || rating > 5) {
            return ctx.reply('❌ Rating harus antara 0 - 5');
        }
        if (isNaN(count) || count < 0) {
            return ctx.reply('❌ Jumlah ulasan harus angka positif');
        }

        db.setRating(rating, count);
        ctx.reply(`✅ Rating berhasil diupdate!\n\n⭐ Rating: ${rating} / 5.0 (${count} ulasan)`);
    });

    bot.command('setprice', (ctx) => {
        const ownerConfig = require('../../../config/owner.json');
        const fs = require('fs');
        const path = require('path');

        // Only owner can set price
        if (ctx.from.id !== ownerConfig.ownerId) {
            return ctx.reply('⛔ Akses ditolak. Hanya owner.');
        }

        const args = ctx.message.text.split(' ').slice(1);

        if (args.length === 0) {
            const currentPrice = ownerConfig.rentalPrice || 50000;
            return ctx.reply(`💰 *HARGA SEWA BOT*\n\nHarga saat ini: Rp${currentPrice.toLocaleString()}/bulan\n\nFormat: /setprice <nominal>\nContoh: /setprice 50000`, { parse_mode: 'Markdown' });
        }

        const price = parseInt(args[0].replace(/[^0-9]/g, ''));

        if (isNaN(price) || price < 1000) {
            return ctx.reply('❌ Nominal tidak valid. Minimal Rp1.000');
        }

        // Update owner.json
        ownerConfig.rentalPrice = price;
        const configPath = path.join(__dirname, '../../../config/owner.json');
        fs.writeFileSync(configPath, JSON.stringify(ownerConfig, null, 4));

        ctx.reply(`✅ Harga sewa berhasil diubah!\n\n💰 Harga baru: Rp${price.toLocaleString()}/bulan`);
    });
};

module.exports = { registerWelcome };
