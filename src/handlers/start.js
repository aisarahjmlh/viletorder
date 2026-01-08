const { getRole } = require('../middleware/roleCheck');
const { Markup } = require('telegraf');
const violetpay = require('../violetpay');
const QRCode = require('qrcode');
const pool = require('../database/db');

const ITEMS_PER_PAGE = 10;

const qtySession = {};
const editSession = {};
const depositSession = {};

const getQty = (userId, code) => {
    return qtySession[`${userId}_${code}`] || 1;
};

const setQty = (userId, code, qty) => {
    qtySession[`${userId}_${code}`] = qty;
};

const setEditMode = (userId, code) => {
    editSession[userId] = code;
};

const getEditProduct = (userId) => {
    return editSession[userId];
};

const clearEditMode = (userId) => {
    delete editSession[userId];
};

const setDepositMode = (botId, userId, state) => {
    const key = `${botId}_${userId}`;
    if (state) depositSession[key] = true;
    else delete depositSession[key];
};

const isDepositMode = (botId, userId) => {
    return !!depositSession[`${botId}_${userId}`];
};

// Helper to format date in WIB
const getFormattedDateWIB = () => {
    return new Date().toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta',
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    }) + ' WIB';
};

// Helper to process welcome text with all placeholders
const processWelcomeText = async (text, db, userId, userName, extraVars = {}) => {
    const stats = await db.getStats();
    const members = await db.getMembers();
    const saldo = await db.getMemberSaldo(userId);
    const totalOrder = await db.getMemberOrderCount(userId);

    const ratingText = stats.rating && stats.rating.count > 0
        ? `${stats.rating.total} / 5.0 (${stats.rating.count} ulasan)`
        : '0 / 5.0 (0 ulasan)';

    let result = text
        .replace(/{name}/g, userName)
        .replace(/{saldo}/g, `Rp${saldo.toLocaleString()}`)
        .replace(/{tanggal}/g, getFormattedDateWIB())
        .replace(/{totalorder}/g, totalOrder.toLocaleString())
        .replace(/{rating}/g, ratingText)
        .replace(/{totaluser}/g, members.length.toLocaleString())
        .replace(/{totalpenjualan}/g, (stats.totalSales || 0).toLocaleString())
        .replace(/{totalomzet}/g, `Rp${(stats.totalOmzet || 0).toLocaleString()}`);

    for (const [key, value] of Object.entries(extraVars)) {
        result = result.replace(new RegExp(`{${key}}`, 'g'), value);
    }

    return result;
};

// Get owner config from MySQL
const getOwnerConfig = async () => {
    const [rows] = await pool.query('SELECT * FROM owner_config LIMIT 1');
    if (rows.length === 0) {
        return { ownerId: 0, rentalPrice: 50000, ownerVioletpay: null };
    }
    const row = rows[0];
    return {
        ownerId: row.owner_id,
        rentalPrice: row.rental_price || 50000,
        ownerVioletpay: row.violetpay_api_key ? {
            apiKey: row.violetpay_api_key,
            secretKey: row.violetpay_secret_key,
            isProduction: row.violetpay_is_production
        } : null
    };
};

// Get bot expiration info from MySQL
const getBotExpiration = async (botId) => {
    const [rows] = await pool.query('SELECT expires_at FROM bots WHERE id = ?', [botId]);
    if (rows.length === 0 || !rows[0].expires_at) return null;
    return rows[0].expires_at;
};

const registerStart = (bot, db, botConfig = {}) => {
    bot.command('start', async (ctx) => {
        const emojiMsg = await ctx.reply('😁');
        await new Promise(r => setTimeout(r, 500));
        try { await ctx.deleteMessage(emojiMsg.message_id); } catch (e) { }

        const role = await getRole(db, ctx.from.id, ctx.from.username);
        const roleText = role === 'owner' ? '👑 Owner' : role === 'admin' ? '🛡️ Admin' : '👤 Member';

        const photo = await db.getSetting('photo');

        if (role === 'member') {
            const isMainBot = db.botId === 'main';

            if (isMainBot) {
                const ownerConfig = await getOwnerConfig();
                const RENTAL_PRICE = ownerConfig.rentalPrice || 50000;
                const welcomeText = await db.getSetting('welcomeText');

                let msg;
                if (welcomeText) {
                    msg = await processWelcomeText(welcomeText, db, ctx.from.id, ctx.from.first_name, {
                        price: `Rp${RENTAL_PRICE.toLocaleString()}`
                    });
                } else {
                    msg = `╭ - - - - - - - - - - - - - - - - - - - ╮\n`;
                    msg += `┊  🤖 SEWA BOT STORE TELEGRAM\n`;
                    msg += `┊- - - - - - - - - - - - - - - - - - - - -\n`;
                    msg += `┊  Halo ${ctx.from.first_name}! 👋\n`;
                    msg += `┊\n`;
                    msg += `┊  ✨ Fitur Bot:\n`;
                    msg += `┊  • Toko otomatis dengan QRIS\n`;
                    msg += `┊  • Multi kategori & produk\n`;
                    msg += `┊  • Deposit saldo member\n`;
                    msg += `┊  • Broadcast ke member\n`;
                    msg += `┊- - - - - - - - - - - - - - - - - - - - -\n`;
                    msg += `┊  💰 Harga: Rp${RENTAL_PRICE.toLocaleString()}/bulan\n`;
                    msg += `╰ - - - - - - - - - - - - - - - - - - - ╯`;
                }

                const keyboard = Markup.inlineKeyboard([
                    [Markup.button.callback('🤖 SEWA BOT', 'menu_rental')]
                ]);

                if (photo) {
                    try {
                        return await ctx.replyWithPhoto(photo, { caption: msg, ...keyboard });
                    } catch (e) {
                        return ctx.reply(msg, keyboard);
                    }
                }
                return ctx.reply(msg, keyboard);
            }

            const welcomeText = await db.getSetting('welcomeText');
            const saldo = await db.getMemberSaldo(ctx.from.id);
            let msg;

            if (welcomeText) {
                msg = await processWelcomeText(welcomeText, db, ctx.from.id, ctx.from.first_name);
            } else {
                msg = `Halo ${ctx.from.first_name}! 👋\n` +
                    `Saldo: Rp${saldo.toLocaleString()}\n\n` +
                    `Silakan pilih menu:`;
            }

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('🛍️ Beli Produk', 'menu_buy')],
                [Markup.button.callback('💰 Deposit', 'menu_deposit')]
            ]);

            if (photo) {
                try {
                    return await ctx.replyWithPhoto(photo, { caption: msg, ...keyboard });
                } catch (e) {
                    return ctx.reply(msg, keyboard);
                }
            }
            return ctx.reply(msg, keyboard);
        }

        if (role === 'owner') {
            const msg = `Halo ${ctx.from.first_name}! 👋\n` +
                `Role Anda: ${roleText}\n\n` +
                `Gunakan menu di bawah ini:`;

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('🛍️ Beli Produk', 'menu_buy')],
                [Markup.button.callback('👑 Dashboard Owner', 'menu_owner')]
            ]);

            if (photo) {
                try {
                    return await ctx.replyWithPhoto(photo, { caption: msg, ...keyboard });
                } catch (e) {
                    return ctx.reply(msg, keyboard);
                }
            }
            return ctx.reply(msg, keyboard);
        }

        const msg = `Halo ${ctx.from.first_name}! 👋\n` +
            `Role Anda: ${roleText}\n\n` +
            `Gunakan menu di bawah ini:`;

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🛍️ Beli Produk', 'menu_buy')],
            [Markup.button.callback('⚙️ Dashboard Admin', 'menu_admin')]
        ]);

        if (photo) {
            try {
                return await ctx.replyWithPhoto(photo, { caption: msg, ...keyboard });
            } catch (e) {
                return ctx.reply(msg, keyboard);
            }
        }
        return ctx.reply(msg, keyboard);
    });

    bot.action('menu_buy', async (ctx) => {
        return showCategoryList(ctx, db, 1, true);
    });

    bot.action('menu_deposit', (ctx) => {
        setDepositMode(db.botId, ctx.from.id, true);
        return ctx.reply('Silakan konfirmasi jumlah deposit dengan mengirimkan angka (Contoh: 10000):', Markup.forceReply());
    });

    bot.action('menu_admin', async (ctx) => {
        await ctx.answerCbQuery();
        let expInfo = '';

        try {
            const expiresAt = await getBotExpiration(db.botId);
            if (expiresAt) {
                const expDate = new Date(expiresAt);
                const now = new Date();
                const timeLeft = expDate - now;
                const daysLeft = Math.ceil(timeLeft / (1000 * 60 * 60 * 24));
                const expStr = expDate.toLocaleString('id-ID', {
                    timeZone: 'Asia/Jakarta',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                const statusIcon = daysLeft <= 3 ? '⚠️' : '✅';
                expInfo = `\n┊  ${statusIcon} Expired: ${expStr} WIB\n┊  ⏱️ Sisa: ${daysLeft} hari lagi\n`;
            }
        } catch (e) {
            console.error('Error reading bot expiration:', e);
        }

        let msg = `╭ - - - - - - - - - - - - - - - - - - - ╮\n`;
        msg += `┊  ⚙️ DASHBOARD ADMIN\n`;
        msg += `┊- - - - - - - - - - - - - - - - - - - - -\n`;
        msg += `┊  📂 /addc <nama> - Tambah kategori\n`;
        msg += `┊  🗑️ /delc <nama> - Hapus kategori\n`;
        msg += `┊  📦 /addprd - Tambah produk\n`;
        msg += `┊  🗑️ /delprd <code> - Hapus produk\n`;
        msg += `┊  📋 /listprd - Daftar produk\n`;
        msg += `┊  📥 /addst <kode> - Tambah stok\n`;
        msg += `┊  🗑️ /delst <kode> - Hapus stok\n`;
        msg += `┊  🖼️ /foto <url> - Set foto bot\n`;
        msg += `┊  📢 /broadcast - Broadcast ke member\n`;
        msg += `┊  💳 /setpg qris/qrisc - Set payment\n`;
        msg += `┊  👥 /listuser - Daftar member\n`;
        msg += `┊  👥 /checkbalance - Total Saldo VIOLET-PAYMENT\n`;
        msg += `┊  💾 /backup - Backup database\n`;
        msg += `┊  📝 /setwelc - Set welcome text\n`;
        msg += `┊  📝 /setrating - setrating 5.0 129\n`;
        if (expInfo) {
            msg += `┊- - - - - - - - - - - - - - - - - - - - -\n`;
            msg += `┊  INFORMASI AKTIF BOT:${expInfo}`;
        }
        msg += `┊- - - - - - - - - - - - - - - - - - - - -\n`;
        msg += `┊  💡 Ketik command untuk mulai\n`;
        msg += `╰ - - - - - - - - - - - - - - - - - - - ╯`;

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Kembali', 'back_to_start')]
        ]);

        return editCaption(ctx, msg, keyboard);
    });

    bot.action('menu_owner', async (ctx) => {
        await ctx.answerCbQuery();
        let expInfo = '';

        try {
            const expiresAt = await getBotExpiration(db.botId);
            if (expiresAt) {
                const expDate = new Date(expiresAt);
                const now = new Date();
                const timeLeft = expDate - now;
                const daysLeft = Math.ceil(timeLeft / (1000 * 60 * 60 * 24));
                const expStr = expDate.toLocaleString('id-ID', {
                    timeZone: 'Asia/Jakarta',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                const statusIcon = daysLeft <= 3 ? '⚠️' : '✅';
                expInfo = `\n┊  ${statusIcon} Expired: ${expStr} WIB\n┊  ⏱️ Sisa: ${daysLeft} hari lagi\n`;
            }
        } catch (e) {
            console.error('Error reading bot expiration:', e);
        }

        let msg = `╭ - - - - - - - - - - - - - - - - - - - ╮\n`;
        msg += `┊  👑 DASHBOARD OWNER\n`;
        msg += `┊- - - - - - - - - - - - - - - - - - - - -\n`;
        msg += `┊  🤖 /addbot <token> @admin - Tambah bot\n`;
        msg += `┊  🗑️ /delbot <id> - Hapus bot\n`;
        msg += `┊  📋 /listbot - Daftar bot\n`;
        msg += `┊  ⏰ /addactive <id> <durasi> - Tambah expired\n`;
        msg += `┊  💾 /backup - Full backup data\n`;
        msg += `┊  📤 /upbackup - Upload restore data\n`;
        msg += `┊- - - - - - - - - - - - - - - - - - - - -\n`;
        msg += `┊  📝 /setwelc - Set teks promosi\n`;
        msg += `┊  💰 /setprice <nominal> - Set harga sewa\n`;
        if (expInfo) {
            msg += `┊- - - - - - - - - - - - - - - - - - - - -\n`;
            msg += `┊  INFORMASI AKTIF BOT:${expInfo}`;
        }
        msg += `┊- - - - - - - - - - - - - - - - - - - - -\n`;
        msg += `┊  💡 Ketik command untuk mulai\n`;
        msg += `╰ - - - - - - - - - - - - - - - - - - - ╯`;

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Kembali', 'back_to_start')]
        ]);

        return editCaption(ctx, msg, keyboard);
    });

    bot.action('back_to_start', async (ctx) => {
        await ctx.answerCbQuery();
        const role = await getRole(db, ctx.from.id, ctx.from.username);
        const roleText = role === 'owner' ? '👑 Owner' : role === 'admin' ? '🛡️ Admin' : '👤 Member';

        if (role === 'member') {
            const saldo = await db.getMemberSaldo(ctx.from.id);
            const msg = `Halo ${ctx.from.first_name}! 👋\n` +
                `Saldo: Rp${saldo.toLocaleString()}\n\n` +
                `Silakan pilih menu:`;

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('🛍️ Beli Produk', 'menu_buy')],
                [Markup.button.callback('💰 Deposit', 'menu_deposit')]
            ]);

            return editCaption(ctx, msg, keyboard);
        }

        if (role === 'owner') {
            const msg = `Halo ${ctx.from.first_name}! 👋\n` +
                `Role Anda: ${roleText}\n\n` +
                `Gunakan menu di bawah ini:`;

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('🛍️ Beli Produk', 'menu_buy')],
                [Markup.button.callback('👑 Dashboard Owner', 'menu_owner')]
            ]);

            return editCaption(ctx, msg, keyboard);
        }

        const msg = `Halo ${ctx.from.first_name}! 👋\n` +
            `Role Anda: ${roleText}\n\n` +
            `Gunakan menu di bawah ini:`;

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🛍️ Beli Produk', 'menu_buy')],
            [Markup.button.callback('⚙️ Dashboard Admin', 'menu_admin')]
        ]);

        return editCaption(ctx, msg, keyboard);
    });

    bot.action(/cat_page_(\d+)/, async (ctx) => {
        const page = parseInt(ctx.match[1]);
        return showCategoryList(ctx, db, page, true);
    });

    bot.action(/cat_(\d+)/, async (ctx) => {
        const index = parseInt(ctx.match[1]);
        return showProductsByCategory(ctx, db, index);
    });

    bot.action('back_to_cat', async (ctx) => {
        return showCategoryList(ctx, db, 1, true);
    });

    bot.action(/^buy_(?!saldo_)(.+)$/, async (ctx) => {
        const code = ctx.match[1].trim();
        const userId = ctx.from.id;
        setQty(userId, code, 1);
        return showPayment(ctx, db, code);
    });

    bot.action(/^qty_plus_(.+)$/, async (ctx) => {
        const code = ctx.match[1];
        const userId = ctx.from.id;
        const currentQty = getQty(userId, code);
        setQty(userId, code, currentQty + 1);
        return showPayment(ctx, db, code);
    });

    bot.action(/^qty_minus_(.+)$/, async (ctx) => {
        const code = ctx.match[1];
        const userId = ctx.from.id;
        const currentQty = getQty(userId, code);
        if (currentQty > 1) {
            setQty(userId, code, currentQty - 1);
        }
        return showPayment(ctx, db, code);
    });

    bot.action(/^qty_edit_(.+)$/, async (ctx) => {
        const code = ctx.match[1];
        setEditMode(ctx.from.id, code);
        return ctx.reply('✏️ Silakan kirim jumlah yang diinginkan (angka):', Markup.forceReply());
    });

    bot.on('text', async (ctx, next) => {
        const userId = ctx.from.id;

        if (isDepositMode(db.botId, userId)) {
            const amount = parseInt(ctx.message.text.replace(/[^0-9]/g, ''));
            if (!isNaN(amount) && amount >= 1000) {
                setDepositMode(db.botId, userId, false);
                return processDeposit(ctx, db, amount, botConfig);
            } else {
                return ctx.reply('❌ Harap masukkan jumlah deposit yang valid (Minimal 1000).');
            }
        }

        const code = getEditProduct(userId);
        if (code) {
            const qty = parseInt(ctx.message.text);
            if (!isNaN(qty) && qty > 0) {
                setQty(userId, code, qty);
                clearEditMode(userId);
                await showPaymentNew(ctx, db, code);
            } else {
                ctx.reply('❌ Harap masukkan angka yang valid.');
            }
            return;
        }

        return next();
    });

    bot.action(/^confirm_(.+)$/, async (ctx) => {
        const code = ctx.match[1];
        await ctx.answerCbQuery('Sedang membuat pembayaran...');
        return processPurchase(ctx, db, code, botConfig);
    });

    bot.action(/^check_payment_(.+)$/, async (ctx) => {
        const refKode = ctx.match[1];
        await ctx.answerCbQuery('⏳ Mengecek...');

        if (!botConfig.violetpay || !botConfig.violetpay.apiKey) {
            return ctx.reply('❌ VioletPay tidak dikonfigurasi');
        }

        const order = await db.getPendingOrder(refKode);
        if (!order) {
            return ctx.reply('❌ Transaksi tidak ditemukan / sudah selesai');
        }

        const { apiKey, secretKey, isProduction } = botConfig.violetpay;

        try {
            const result = await violetpay.checkTransaction(
                apiKey, secretKey, refKode, order.refId, isProduction
            );

            const txStatus = result.data ? result.data.status : result.status;
            const statusLower = String(txStatus).toLowerCase();

            if (statusLower === 'success' || statusLower === 'sukses' || statusLower === 'dibayar') {
                await db.removePendingOrder(refKode);

                if (order.type === 'deposit') {
                    const newSaldo = await db.updateMemberSaldo(order.userId, order.total);

                    if (order.messageId) {
                        try { await bot.telegram.deleteMessage(order.userId, order.messageId); } catch (e) { }
                    }

                    return ctx.reply(`✅ Deposit Rp${order.total.toLocaleString()} Berhasil!\nSaldo Anda sekarang: Rp${newSaldo.toLocaleString()}`,
                        Markup.inlineKeyboard([[Markup.button.callback('🔙 Menu', 'back_to_cat')]]));

                } else {
                    const product = await db.getProduct(order.productCode);

                    if (!product || product.stock.length < order.qty) {
                        return ctx.reply('❌ Stok tidak tersedia, hubungi admin. Saldo tidak terpotong.');
                    }

                    const items = await db.removeStock(order.productCode, order.qty);
                    setQty(order.userId, order.productCode, 1);
                    return deliverProduct(bot, db, order, product, items);
                }

            } else if (statusLower === 'kadaluarsa' || statusLower === 'expired') {
                await db.removePendingOrder(refKode);
                return ctx.reply('❌ Pembayaran sudah kadaluarsa', Markup.inlineKeyboard([[Markup.button.callback('🔙 Menu', 'back_to_cat')]]));
            } else {
                return;
            }
        } catch (error) {
            return ctx.reply(`❌ Error: ${error.message}`);
        }
    });

    bot.action(/^buy_saldo_(.+)$/, async (ctx) => {
        const code = ctx.match[1].trim();
        await ctx.answerCbQuery('Sedang membuat pembayaran...');
        return processPurchaseSaldo(ctx, db, code);
    });

    bot.action(/^cancel_payment_(.+)$/, async (ctx) => {
        const refKode = ctx.match[1];
        await ctx.answerCbQuery('Membatalkan pembayaran...');

        try {
            await ctx.deleteMessage();
        } catch (e) { }

        await db.removePendingOrder(refKode);
        return ctx.reply('🚫 Pembayaran Dibatalkan');
    });

    bot.command('myid', (ctx) => {
        ctx.reply(`🆔 ID: ${ctx.from.id}`);
    });

    startPaymentMonitor(bot, db, botConfig);
};

async function processDeposit(ctx, db, amount, botConfig) {
    if (!botConfig.violetpay || !botConfig.violetpay.apiKey) {
        return ctx.reply('❌ Sistem pembayaran sedang tidak tersedia.', Markup.inlineKeyboard([[Markup.button.callback('🔙 Menu', 'back_to_cat')]]));
    }

    const { apiKey, secretKey, isProduction } = botConfig.violetpay;
    const userId = ctx.from.id;
    const customer = {
        nama: ctx.from.first_name || 'Member',
        email: 'member@email.com',
        phone: '08123456789'
    };

    try {
        const channelPayment = await db.getSetting('channelPayment') || 'qris';
        const paymentResult = await violetpay.createQrisPayment(
            apiKey, secretKey, amount, customer,
            `Deposit Saldo Rp${amount}`, isProduction, channelPayment
        );

        if (paymentResult.success || paymentResult.status) {
            let msg = `╭ - - - - - - - - - - - - - - - - - - - ╮\n`;
            msg += `┊  💳 DEPOSIT SALDO\n`;
            msg += `┊- - - - - - - - - - - - - - - - - - - - -\n`;
            msg += `┊  Nominal: Rp${amount.toLocaleString()}\n`;
            msg += `┊  Ref: ${paymentResult.refKode}\n`;
            msg += `┊- - - - - - - - - - - - - - - - - - - - -\n`;
            msg += `┊  Scan QRIS untuk bayar\n`;
            msg += `┊  Otomatis masuk saldo\n`;
            msg += `╰ - - - - - - - - - - - - - - - - - - - ╯`;

            const buttons = [];
            if (paymentResult.checkout_url) {
                buttons.push([Markup.button.url('💸 Bayar Sekarang', paymentResult.checkout_url)]);
            }
            buttons.push([Markup.button.callback('🔄 Cek Status', `check_payment_${paymentResult.refKode}`)]);
            buttons.push([Markup.button.callback('❌ Batal', `cancel_payment_${paymentResult.refKode}`)]);

            const keyboard = Markup.inlineKeyboard(buttons);
            const qrisData = paymentResult.qris_url || paymentResult.qr_url || paymentResult.payment_url || paymentResult.qris;
            let sentMsg;

            if (qrisData && (qrisData.startsWith('http') || qrisData.startsWith('https'))) {
                try {
                    sentMsg = await ctx.replyWithPhoto(qrisData, { caption: msg, ...keyboard });
                } catch (e) { }
            }

            if (!sentMsg && qrisData) {
                try {
                    const qrBuffer = await QRCode.toBuffer(qrisData);
                    sentMsg = await ctx.replyWithPhoto({ source: qrBuffer }, { caption: msg, ...keyboard });
                } catch (e) {
                    console.error('Failed to generate/send QR:', e);
                }
            }

            if (!sentMsg) {
                sentMsg = await ctx.reply(msg, keyboard);
            }

            await db.addPendingOrder({
                refKode: paymentResult.refKode,
                refId: paymentResult.id_reference || paymentResult.ref_id,
                userId: userId,
                type: 'deposit',
                total: amount,
                messageId: sentMsg ? sentMsg.message_id : null
            });

        } else {
            const resultData = paymentResult.data || {};
            const statusMsg = resultData.status || '';

            if (statusMsg.includes('Merchant tidak valid') || statusMsg.includes('Invalid') || paymentResult.message?.includes('Invalid')) {
                return ctx.reply('❌ Keterangan konfigurasi payment gateway admin salah.');
            }

            ctx.reply(`❌ Gagal membuat deposit: ${statusMsg || paymentResult.message || 'Error API'}`);
        }
    } catch (error) {
        ctx.reply(`❌ Error: ${error.message}`);
    }
}

async function deliverProduct(bot, db, order, product, items) {
    if (order.messageId) {
        try {
            await bot.telegram.deleteMessage(order.userId, order.messageId);
        } catch (e) { }
    }

    let msg = `╭ - - - - - - - - - - - - - - - - - - - ╮\n`;
    msg += `┊  ✅ PEMBAYARAN BERHASIL\n`;
    msg += `┊- - - - - - - - - - - - - - - - - - - - -\n`;
    msg += `┊  Produk: ${product.name}\n`;
    msg += `┊  Jumlah: ${order.qty}\n`;
    msg += `┊  Total: Rp${order.total.toLocaleString()}\n`;
    msg += `┊- - - - - - - - - - - - - - - - - - - - -\n`;
    msg += `┊  📦 AKUN:\n`;
    items.forEach((item, i) => {
        msg += `┊  ${i + 1}. ${item}\n`;
    });
    msg += `╰ - - - - - - - - - - - - - - - - - - - ╯`;

    try {
        await db.updateStats(1, order.total);
        await db.incrementMemberOrder(order.userId);
    } catch (e) {
        console.error('Failed to track sale stats:', e.message);
    }

    try {
        if (order.userId) {
            const photo = await db.getSetting('photo');
            const keyboard = Markup.inlineKeyboard([[Markup.button.callback('🔙 Menu', 'back_to_cat')]]);

            if (photo) {
                try {
                    await bot.telegram.sendPhoto(order.userId, photo, { caption: msg, ...keyboard });
                } catch (e) {
                    await bot.telegram.sendMessage(order.userId, msg, keyboard);
                }
            } else {
                await bot.telegram.sendMessage(order.userId, msg, keyboard);
            }
        }
    } catch (e) {
        console.error(`Failed to send product to user ${order.userId}:`, e.message);
    }
}

function startPaymentMonitor(bot, db, botConfig) {
    if (!botConfig.violetpay || !botConfig.violetpay.apiKey) return;

    const { apiKey, secretKey, isProduction } = botConfig.violetpay;

    setInterval(async () => {
        const pendingOrders = await db.getPendingOrders();
        if (pendingOrders.length === 0) return;

        for (const order of pendingOrders) {
            try {
                const result = await violetpay.checkTransaction(
                    apiKey, secretKey, order.refKode, order.refId, isProduction
                );

                const txStatus = result.data ? result.data.status : result.status;
                const statusLower = String(txStatus).toLowerCase();

                if (statusLower === 'success' || statusLower === 'sukses' || statusLower === 'dibayar') {
                    if (order.type === 'deposit') {
                        await db.updateMemberSaldo(order.userId, order.total);

                        if (order.messageId) {
                            try { await bot.telegram.deleteMessage(order.userId, order.messageId); } catch (e) { }
                        }

                        try {
                            if (order.userId) {
                                await bot.telegram.sendMessage(order.userId, `✅ Deposit Rp${order.total.toLocaleString()} Berhasil diterima!`);
                            }
                        } catch (e) { }

                    } else {
                        const product = await db.getProduct(order.productCode);

                        if (product && product.stock.length >= order.qty) {
                            const items = await db.removeStock(order.productCode, order.qty);
                            await deliverProduct(bot, db, order, product, items);
                            setQty(order.userId, order.productCode, 1);
                        }
                    }

                    await db.removePendingOrder(order.refKode);

                } else if (statusLower === 'kadaluarsa' || statusLower === 'expired') {
                    await db.removePendingOrder(order.refKode);

                    try {
                        if (order.userId) {
                            await bot.telegram.sendMessage(order.userId, '❌ Pembayaran QRIS telah kadaluarsa.',
                                Markup.inlineKeyboard([[Markup.button.callback('🔙 Menu', 'back_to_cat')]])
                            );
                        }
                    } catch (e) { }
                }
            } catch (error) {
                console.error(`Error checking payment ${order.refKode}:`, error.message);
            }
        }
    }, 5000);
}

async function editCaption(ctx, caption, keyboard) {
    try {
        const msg = ctx.callbackQuery?.message;
        if (msg?.photo || msg?.caption !== undefined) {
            return await ctx.editMessageCaption(caption, keyboard);
        } else {
            return await ctx.editMessageText(caption, keyboard);
        }
    } catch (e) {
        try {
            return await ctx.editMessageCaption(caption, keyboard);
        } catch (e2) {
            try {
                return await ctx.editMessageText(caption, keyboard);
            } catch (e3) { }
        }
    }
}

async function showCategoryList(ctx, db, page, edit = false) {
    const products = await db.getProducts();
    const categories = await db.getCategories();

    if (categories.length === 0) {
        const msg = '📭 Belum ada produk tersedia';
        if (edit) return editCaption(ctx, msg, {});
        return ctx.reply(msg);
    }

    const catWithStock = categories.map((catName, idx) => {
        const prods = products.filter(p => p.category && p.category.toLowerCase() === catName.toLowerCase());
        const totalStock = prods.reduce((sum, p) => sum + p.stock.length, 0);
        return { name: catName, index: idx, stock: totalStock };
    });

    const totalPages = Math.ceil(catWithStock.length / ITEMS_PER_PAGE);
    const start = (page - 1) * ITEMS_PER_PAGE;
    const pageItems = catWithStock.slice(start, start + ITEMS_PER_PAGE);

    let msg = `╭ - - - - - - - - - - - - - - - - - - - ╮\n`;
    msg += `┊  LIST PRODUK\n`;
    msg += `┊  page ${page} / ${totalPages}\n`;
    msg += `┊- - - - - - - - - - - - - - - - - - - - -\n`;

    pageItems.forEach((cat, i) => {
        const num = start + i + 1;
        const icon = cat.stock > 0 ? '✅' : '❌';
        msg += `┊ ${icon} [${num}] ${cat.name.toUpperCase()} (${cat.stock})\n`;
    });

    msg += `╰ - - - - - - - - - - - - - - - - - - - ╯`;

    const buttons = [];
    const row = [];
    pageItems.forEach((cat, i) => {
        row.push(Markup.button.callback(`${start + i + 1}`, `cat_${cat.index}`));
        if (row.length === 5) {
            buttons.push([...row]);
            row.length = 0;
        }
    });
    if (row.length > 0) buttons.push(row);

    const navRow = [];
    if (page > 1) navRow.push(Markup.button.callback('◀️', `cat_page_${page - 1}`));
    if (page < totalPages) navRow.push(Markup.button.callback('▶️', `cat_page_${page + 1}`));
    if (navRow.length > 0) buttons.push(navRow);

    const keyboard = Markup.inlineKeyboard(buttons);

    if (edit) return editCaption(ctx, msg, keyboard);

    const photo = await db.getSetting('photo');
    if (photo) {
        try { return await ctx.replyWithPhoto(photo, { caption: msg, ...keyboard }); }
        catch (e) { }
    }
    return ctx.reply(msg, keyboard);
}

async function showProductsByCategory(ctx, db, categoryIndex) {
    const categories = await db.getCategories();
    const products = await db.getProducts();

    if (!categories[categoryIndex]) {
        return editCaption(ctx, 'Category tidak ditemukan', {});
    }

    const catName = categories[categoryIndex];
    const prods = products.filter(p => p.category && p.category.toLowerCase() === catName.toLowerCase());

    if (prods.length === 0) {
        const keyboard = Markup.inlineKeyboard([[Markup.button.callback('🔙 Kembali', 'back_to_cat')]]);
        return editCaption(ctx, `📭 Belum ada produk di ${catName}`, keyboard);
    }

    let msg = `╭ - - - - - - - - - - - - - - - - - - - ╮\n`;
    msg += `┊  ${catName.toUpperCase()}\n`;
    msg += `┊- - - - - - - - - - - - - - - - - - - - -\n`;

    prods.forEach((p) => {
        const icon = p.stock.length > 0 ? '✅' : '❌';
        msg += `┊ ${icon} [${p.code}] ${p.name}\n`;
        msg += `┊    Rp${p.price.toLocaleString()} | Stok: ${p.stock.length}\n`;
    });

    msg += `╰ - - - - - - - - - - - - - - - - - - - ╯`;

    const buttons = prods.map(p =>
        [Markup.button.callback(`🛒 ${p.code}`, `buy_${p.code}`)]
    );
    buttons.push([Markup.button.callback('🔙 Kembali', 'back_to_cat')]);

    return editCaption(ctx, msg, Markup.inlineKeyboard(buttons));
}

async function showPayment(ctx, db, code) {
    const product = await db.getProduct(code);
    const userId = ctx.from.id;

    if (!product) {
        return editCaption(ctx, 'Produk tidak ditemukan', {});
    }

    if (product.stock.length === 0) {
        const keyboard = Markup.inlineKeyboard([[Markup.button.callback('🔙 Kembali', 'back_to_cat')]]);
        return editCaption(ctx, '❌ Stok habis', keyboard);
    }

    const qty = getQty(userId, code);
    const total = product.price * qty;

    let msg = `╭ - - - - - - - - - - - - - - - - - - - ╮\n`;
    msg += `┊  PEMBAYARAN\n`;
    msg += `┊- - - - - - - - - - - - - - - - - - - - -\n`;
    msg += `┊  Produk: ${product.name}\n`;
    msg += `┊  Code: ${product.code}\n`;
    msg += `┊  Harga: Rp${product.price.toLocaleString()}\n`;
    msg += `┊  Stok: ${product.stock.length}\n`;
    msg += `┊  Jumlah: ${qty}\n`;
    msg += `┊- - - - - - - - - - - - - - - - - - - - -\n`;
    msg += `┊  TOTAL: Rp${total.toLocaleString()}\n`;
    msg += `╰ - - - - - - - - - - - - - - - - - - - ╯`;

    const keyboard = Markup.inlineKeyboard([
        [
            Markup.button.callback('➖', `qty_minus_${code}`),
            Markup.button.callback('✏️', `qty_edit_${code}`),
            Markup.button.callback('➕', `qty_plus_${code}`)
        ],
        [
            Markup.button.callback('✅ BUY NOW', `confirm_${code}`),
            Markup.button.callback('💰 BUY SALDO', `buy_saldo_${code}`)
        ],
        [Markup.button.callback('🔙 Kembali', 'back_to_cat')]
    ]);

    return editCaption(ctx, msg, keyboard);
}

async function showPaymentNew(ctx, db, code) {
    const product = await db.getProduct(code);
    const userId = ctx.from.id;

    if (!product) {
        return ctx.reply('Produk tidak ditemukan');
    }

    const qty = getQty(userId, code);
    const total = product.price * qty;

    let msg = `╭ - - - - - - - - - - - - - - - - - - - ╮\n`;
    msg += `┊  PEMBAYARAN\n`;
    msg += `┊- - - - - - - - - - - - - - - - - - - - -\n`;
    msg += `┊  Produk: ${product.name}\n`;
    msg += `┊  Code: ${product.code}\n`;
    msg += `┊  Harga: Rp${product.price.toLocaleString()}\n`;
    msg += `┊  Stok: ${product.stock.length}\n`;
    msg += `┊  Jumlah: ${qty}\n`;
    msg += `┊- - - - - - - - - - - - - - - - - - - - -\n`;
    msg += `┊  TOTAL: Rp${total.toLocaleString()}\n`;
    msg += `╰ - - - - - - - - - - - - - - - - - - - ╯`;

    const keyboard = Markup.inlineKeyboard([
        [
            Markup.button.callback('➖', `qty_minus_${code}`),
            Markup.button.callback('✏️', `qty_edit_${code}`),
            Markup.button.callback('➕', `qty_plus_${code}`)
        ],
        [
            Markup.button.callback('✅ BUY NOW', `confirm_${code}`),
            Markup.button.callback('💰 BUY SALDO', `buy_saldo_${code}`)
        ],
        [Markup.button.callback('🔙 Kembali', 'back_to_cat')]
    ]);

    return ctx.reply(msg, keyboard);
}

async function processPurchase(ctx, db, code, botConfig) {
    const product = await db.getProduct(code);
    const userId = ctx.from.id;
    const qty = getQty(userId, code);

    if (!product || product.stock.length === 0) {
        return editCaption(ctx, '❌ Stok habis', Markup.inlineKeyboard([[Markup.button.callback('🔙 Kembali', 'back_to_cat')]]));
    }

    if (product.stock.length < qty) {
        return editCaption(ctx, `❌ Stok tidak cukup (tersedia: ${product.stock.length})`, Markup.inlineKeyboard([[Markup.button.callback('🔙 Kembali', 'back_to_cat')]]));
    }

    const total = product.price * qty;

    if (!botConfig.violetpay || !botConfig.violetpay.apiKey) {
        const items = await db.removeStock(code, qty);
        setQty(userId, code, 1);
        return deliverProduct(ctx, db, { qty, total, userId }, product, items);
    }

    const { apiKey, secretKey, isProduction } = botConfig.violetpay;
    const customer = {
        nama: ctx.from.first_name || 'Customer',
        email: 'customer@email.com',
        phone: '08123456789'
    };

    try {
        const channelPayment = await db.getSetting('channelPayment') || 'qris';
        const paymentResult = await violetpay.createQrisPayment(
            apiKey, secretKey, total, customer,
            `${product.name} x${qty}`, isProduction, channelPayment
        );

        if (paymentResult.success || paymentResult.status) {
            let msg = `╭ - - - - - - - - - - - - - - - - - - - ╮\n`;
            msg += `┊  💳 PEMBAYARAN QRIS\n`;
            msg += `┊- - - - - - - - - - - - - - - - - - - - -\n`;
            msg += `┊  Produk: ${product.name}\n`;
            msg += `┊  Jumlah: ${qty}\n`;
            msg += `┊  Total: Rp${total.toLocaleString()}\n`;
            msg += `┊  Ref: ${paymentResult.refKode}\n`;
            msg += `┊- - - - - - - - - - - - - - - - - - - - -\n`;
            msg += `┊  Scan QRIS untuk bayar\n`;
            msg += `┊  Berlaku 24 jam\n`;
            msg += `╰ - - - - - - - - - - - - - - - - - - - ╯`;

            const buttons = [];
            if (paymentResult.checkout_url) {
                buttons.push([Markup.button.url('💸 Bayar Sekarang', paymentResult.checkout_url)]);
            }
            buttons.push([Markup.button.callback('🔄 Cek Status', `check_payment_${paymentResult.refKode}`)]);
            buttons.push([Markup.button.callback('❌ Batal', `cancel_payment_${paymentResult.refKode}`)]);

            const keyboard = Markup.inlineKeyboard(buttons);
            const qrisUrl = paymentResult.qris_url || paymentResult.qr_url || paymentResult.payment_url || paymentResult.qris;
            let sentMsg;

            if (qrisUrl) {
                try {
                    sentMsg = await ctx.replyWithPhoto(qrisUrl, { caption: msg, ...keyboard });
                } catch (e) { }
            }

            if (!sentMsg) {
                sentMsg = await editCaption(ctx, msg, keyboard);
            }

            await db.addPendingOrder({
                refKode: paymentResult.refKode,
                refId: paymentResult.id_reference || paymentResult.ref_id,
                userId: userId,
                type: 'purchase',
                productCode: code,
                qty: qty,
                total: total,
                messageId: sentMsg ? sentMsg.message_id : null
            });

            return sentMsg;
        } else {
            let errorMsg = paymentResult.message || paymentResult.error || 'Unknown error';
            const resultData = paymentResult.data || {};
            const statusMsg = resultData.status || '';

            if (statusMsg.includes('Merchant tidak valid') || statusMsg.includes('Invalid') || errorMsg.includes('Invalid')) {
                errorMsg = 'Keterangan konfigurasi payment gateway admin salah.';
            } else {
                errorMsg = statusMsg || errorMsg;
            }

            let msg = `╭ - - - - - - - - - - - - - - - - - - - ╮\n`;
            msg += `┊  ❌ GAGAL MEMBUAT PEMBAYARAN\n`;
            msg += `┊- - - - - - - - - - - - - - - - - - - - -\n`;
            msg += `┊  ${errorMsg}\n`;
            msg += `╰ - - - - - - - - - - - - - - - - - - - ╯`;

            return editCaption(ctx, msg, Markup.inlineKeyboard([[Markup.button.callback('🔙 Kembali', 'back_to_cat')]]));
        }
    } catch (error) {
        let msg = `╭ - - - - - - - - - - - - - - - - - - - ╮\n`;
        msg += `┊  ❌ ERROR\n`;
        msg += `┊- - - - - - - - - - - - - - - - - - - - -\n`;
        msg += `┊  ${error.message}\n`;
        msg += `╰ - - - - - - - - - - - - - - - - - - - ╯`;

        return editCaption(ctx, msg, Markup.inlineKeyboard([[Markup.button.callback('🔙 Kembali', 'back_to_cat')]]));
    }
}

async function processPurchaseSaldo(ctx, db, code) {
    const product = await db.getProduct(code);
    const userId = ctx.from.id;
    const qty = getQty(userId, code);

    if (!product) {
        return editCaption(ctx, '❌ Produk tidak ditemukan.', Markup.inlineKeyboard([[Markup.button.callback('🔙 Kembali', 'back_to_cat')]]));
    }

    if (product.stock.length === 0) {
        return editCaption(ctx, '❌ Stok habis', Markup.inlineKeyboard([[Markup.button.callback('🔙 Kembali', 'back_to_cat')]]));
    }

    if (product.stock.length < qty) {
        return editCaption(ctx, `❌ Stok tidak cukup (tersedia: ${product.stock.length})`, Markup.inlineKeyboard([[Markup.button.callback('🔙 Kembali', 'back_to_cat')]]));
    }

    const total = product.price * qty;
    const currentSaldo = await db.getMemberSaldo(userId);

    if (currentSaldo < total) {
        const kurang = total - currentSaldo;
        let msg = `╭ - - - - - - - - - - - - - - - - - - - ╮\n`;
        msg += `┊  💸 SALDO TIDAK CUKUP\n`;
        msg += `┊- - - - - - - - - - - - - - - - - - - - -\n`;
        msg += `┊  Saldo Anda: Rp${currentSaldo.toLocaleString()}\n`;
        msg += `┊  Total Belanja: Rp${total.toLocaleString()}\n`;
        msg += `┊  Kekurangan: Rp${kurang.toLocaleString()}\n`;
        msg += `┊- - - - - - - - - - - - - - - - - - - - -\n`;
        msg += `┊  ⚠️ Silakan isi saldo terlebih dahulu\n`;
        msg += `╰ - - - - - - - - - - - - - - - - - - - ╯`;

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('💰 Deposit Saldo', 'menu_deposit')],
            [Markup.button.callback('🔙 Kembali', 'back_to_cat')]
        ]);

        return editCaption(ctx, msg, keyboard);
    }

    await db.updateMemberSaldo(userId, -total);
    const items = await db.removeStock(code, qty);
    setQty(userId, code, 1);
    return deliverProduct(ctx, db, { qty, total, userId }, product, items);
}

module.exports = {
    registerStart,
    editCaption,
    showPaymentNew,
    showPayment,
    showProductsByCategory,
    showCategoryList,
    processPurchase
};
