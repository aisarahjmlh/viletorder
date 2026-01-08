const { getOwnerId } = require('../../middleware/roleCheck');
const pool = require('../../database/db');

const registerWelcome = (bot, db) => {
    bot.command('setwelc', async (ctx) => {
        const ownerId = await getOwnerId();
        const adminUsername = await db.getSetting('adminUsername');
        const userUsername = ctx.from.username;

        const isOwner = ctx.from.id === ownerId;
        const adminList = adminUsername ? adminUsername.split(',').map(a => a.trim().toLowerCase()) : [];
        const isAdmin = userUsername && adminList.includes(userUsername.toLowerCase());
        const isMainBot = db.botId === 'main';

        if (isMainBot && !isOwner) {
            return ctx.reply('⛔ Akses ditolak. Hanya owner.');
        }
        if (!isMainBot && !isOwner && !isAdmin) {
            return ctx.reply('⛔ Akses ditolak');
        }

        const text = ctx.message.text.split(' ').slice(1).join(' ');

        if (!text) {
            const current = await db.getSetting('welcomeText');
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
            await db.setSetting('welcomeText', null);
            return ctx.reply('✅ Welcome text berhasil dihapus. Akan menggunakan teks default.');
        }

        await db.setSetting('welcomeText', text);

        const stats = await db.getStats();
        const members = await db.getMembers();
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

    bot.command('setrating', async (ctx) => {
        const ownerId = await getOwnerId();
        const adminUsername = await db.getSetting('adminUsername');
        const userUsername = ctx.from.username;

        const isOwner = ctx.from.id === ownerId;
        const adminList = adminUsername ? adminUsername.split(',').map(a => a.trim().toLowerCase()) : [];
        const isAdmin = userUsername && adminList.includes(userUsername.toLowerCase());

        if (!isOwner && !isAdmin) {
            return ctx.reply('⛔ Akses ditolak');
        }

        const args = ctx.message.text.split(' ').slice(1);

        if (args.length < 2) {
            const stats = await db.getStats();
            const currentRating = stats.rating && stats.rating.count > 0
                ? `${stats.rating.total} / 5.0 (${stats.rating.count} ulasan)`
                : 'Belum ada rating';
            return ctx.reply(`⭐ SET RATING BOT\n\nFormat: /setrating [rating] [jumlah_ulasan]\nContoh: /setrating 4.9 149\n\nRating saat ini: ${currentRating}`);
        }

        const rating = parseFloat(args[0]);
        const count = parseInt(args[1]);

        if (isNaN(rating) || rating < 0 || rating > 5) {
            return ctx.reply('❌ Rating harus antara 0 - 5');
        }
        if (isNaN(count) || count < 0) {
            return ctx.reply('❌ Jumlah ulasan harus angka positif');
        }

        await db.setRating(rating, count);
        ctx.reply(`✅ Rating berhasil diupdate!\n\n⭐ Rating: ${rating} / 5.0 (${count} ulasan)`);
    });

    bot.command('setprice', async (ctx) => {
        const ownerId = await getOwnerId();

        if (ctx.from.id !== ownerId) {
            return ctx.reply('⛔ Akses ditolak. Hanya owner.');
        }

        const args = ctx.message.text.split(' ').slice(1);

        // Get current price from MySQL
        const [rows] = await pool.query('SELECT rental_price FROM owner_config LIMIT 1');
        const currentPrice = rows.length > 0 ? rows[0].rental_price : 50000;

        if (args.length === 0) {
            return ctx.reply(`💰 *HARGA SEWA BOT*\n\nHarga saat ini: Rp${currentPrice.toLocaleString()}/bulan\n\nFormat: /setprice <nominal>\nContoh: /setprice 50000`, { parse_mode: 'Markdown' });
        }

        const price = parseInt(args[0].replace(/[^0-9]/g, ''));

        if (isNaN(price) || price < 1000) {
            return ctx.reply('❌ Nominal tidak valid. Minimal Rp1.000');
        }

        // Update in MySQL
        await pool.query(
            'UPDATE owner_config SET rental_price = ? WHERE id = (SELECT id FROM (SELECT id FROM owner_config LIMIT 1) AS t)',
            [price]
        );

        ctx.reply(`✅ Harga sewa berhasil diubah!\n\n💰 Harga baru: Rp${price.toLocaleString()}/bulan`);
    });
};

module.exports = { registerWelcome };
