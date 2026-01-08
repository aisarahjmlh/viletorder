const { getRole } = require('../middleware/roleCheck');
const { Markup } = require('telegraf');
const violetpay = require('../violetpay');
const QRCode = require('qrcode');

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


const getMemberSaldo = (db, userId) => {
    const members = db.read('members.json');
    const member = members.find(m => m.userId === userId);
    return member ? (member.saldo || 0) : 0;
};

const updateMemberSaldo = (db, userId, amount) => {
    const members = db.read('members.json');
    const member = members.find(m => m.userId === userId);
    if (member) {
        member.saldo = (member.saldo || 0) + amount;
        db.write('members.json', members);
        return member.saldo;
    }
    return 0;
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
const processWelcomeText = (text, db, userId, userName, extraVars = {}) => {
    const stats = db.getStats();
    const members = db.getMembers();
    const saldo = getMemberSaldo(db, userId);
    const totalOrder = db.getMemberOrderCount(userId);

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

    // Apply extra variables like {price}
    for (const [key, value] of Object.entries(extraVars)) {
        result = result.replace(new RegExp(`{${key}}`, 'g'), value);
    }

    return result;
};

const registerStart = (bot, db, botConfig = {}) => {
    bot.command('start', async (ctx) => {
        // Show emoji first, then delete
        const emojiMsg = await ctx.reply('😁');
        await new Promise(r => setTimeout(r, 500));
        try { await ctx.deleteMessage(emojiMsg.message_id); } catch (e) { }

        const role = getRole(db, ctx.from.id, ctx.from.username);
        const roleText = role === 'owner' ? '👑 Owner' : role === 'admin' ? '🛡️ Admin' : '👤 Member';

        const photo = db.getSetting('photo');

        if (role === 'member') {
            const isMainBot = db.botId === 'main';

            if (isMainBot) {
                // Clear cache to always get latest price
                delete require.cache[require.resolve('../../config/owner.json')];
                const ownerConfig = require('../../config/owner.json');
                const RENTAL_PRICE = ownerConfig.rentalPrice || 50000;
                const welcomeText = db.getSetting('welcomeText');

                let msg;
                if (welcomeText) {
                    // Use custom welcome text with all placeholders
                    msg = processWelcomeText(welcomeText, db, ctx.from.id, ctx.from.first_name, {
                        price: `Rp${RENTAL_PRICE.toLocaleString()}`
                    });
                } else {
                    // Default message
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


            const welcomeText = db.getSetting('welcomeText');
            const saldo = getMemberSaldo(db, ctx.from.id);
            let msg;

            if (welcomeText) {
                // Use custom welcome text with all placeholders
                msg = processWelcomeText(welcomeText, db, ctx.from.id, ctx.from.first_name);
            } else {
                // Default message
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

    bot.action('menu_buy', (ctx) => {
        return showCategoryList(ctx, db, 1, true);
    });

    bot.action('menu_deposit', (ctx) => {
        setDepositMode(db.botId, ctx.from.id, true);
        return ctx.reply('Silakan konfirmasi jumlah deposit dengan mengirimkan angka (Contoh: 10000):', Markup.forceReply());
    });

    bot.action('menu_admin', async (ctx) => {
        await ctx.answerCbQuery();

        const fs = require('fs');
        const path = require('path');
        let expInfo = '';

        try {
            const botsPath = path.join(__dirname, '../../data/bots.json');
            if (fs.existsSync(botsPath)) {
                const botsData = JSON.parse(fs.readFileSync(botsPath, 'utf8'));
                const myBot = botsData.bots.find(b => b.id === db.botId);

                if (myBot && myBot.expiresAt) {
                    const expDate = new Date(myBot.expiresAt);
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
        msg += `┊ 👥  /checkbalance - Toal Saldo VIOLET-PAYMENT\n`;
        msg += `┊  💾 /backup - Backup database\n`;
        msg += `┊  📝 /setwelc - Set welcome text\n`;
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

        const fs = require('fs');
        const path = require('path');
        let expInfo = '';

        try {
            const botsPath = path.join(__dirname, '../../data/bots.json');
            if (fs.existsSync(botsPath)) {
                const botsData = JSON.parse(fs.readFileSync(botsPath, 'utf8'));
                const myBot = botsData.bots.find(b => b.id === db.botId);

                if (myBot && myBot.expiresAt) {
                    const expDate = new Date(myBot.expiresAt);
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
        const role = getRole(db, ctx.from.id, ctx.from.username);
        const roleText = role === 'owner' ? '👑 Owner' : role === 'admin' ? '🛡️ Admin' : '👤 Member';

        if (role === 'member') {
            const saldo = getMemberSaldo(db, ctx.from.id);
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

    bot.action(/cat_page_(\d+)/, (ctx) => {
        const page = parseInt(ctx.match[1]);
        return showCategoryList(ctx, db, page, true);
    });

    bot.action(/cat_(\d+)/, (ctx) => {
        const index = parseInt(ctx.match[1]);
        return showProductsByCategory(ctx, db, index);
    });

    bot.action('back_to_cat', (ctx) => {
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

        const pendingOrders = db.read('pending_orders.json') || [];
        const order = pendingOrders.find(o => o.refKode === refKode);

        if (!order) {
            return ctx.reply('❌ Transaksi tidak ditemukan / sudah selesai');
        }

        const { apiKey, secretKey, isProduction } = botConfig.violetpay;

        try {
            const result = await violetpay.checkTransaction(
                apiKey,
                secretKey,
                refKode,
                order.refId,
                isProduction
            );


            const txStatus = result.data ? result.data.status : result.status;
            const statusLower = String(txStatus).toLowerCase();

            if (statusLower === 'success' || statusLower === 'sukses' || statusLower === 'dibayar') {
                const idx = pendingOrders.findIndex(o => o.refKode === refKode);
                if (idx > -1) pendingOrders.splice(idx, 1);
                db.write('pending_orders.json', pendingOrders);


                if (order.type === 'deposit') {
                    const newSaldo = updateMemberSaldo(db, order.userId, order.total);


                    if (order.messageId) {
                        try { await bot.telegram.deleteMessage(order.userId, order.messageId); } catch (e) { }
                    }

                    return ctx.reply(`✅ Deposit Rp${order.total.toLocaleString()} Berhasil!\nSaldo Anda sekarang: Rp${newSaldo.toLocaleString()}`,
                        Markup.inlineKeyboard([[Markup.button.callback('🔙 Menu', 'back_to_cat')]]));

                } else {

                    const products = db.read('products.json');
                    const product = products.find(p => p.code.toLowerCase() === order.productCode.toLowerCase());

                    if (!product || product.stock.length < order.qty) {
                        return ctx.reply('❌ Stok tidak tersedia, hubungi admin. Saldo tidak terpotong.');
                    }

                    const items = product.stock.splice(0, order.qty);
                    db.write('products.json', products);
                    setQty(order.userId, order.productCode, 1);
                    return deliverProduct(bot, db, order, product, items);
                }

            } else if (statusLower === 'kadaluarsa' || statusLower === 'expired') {
                const idx = pendingOrders.findIndex(o => o.refKode === refKode);
                if (idx > -1) pendingOrders.splice(idx, 1);
                db.write('pending_orders.json', pendingOrders);

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

        const pendingOrders = db.read('pending_orders.json') || [];
        const idx = pendingOrders.findIndex(o => o.refKode === refKode);
        if (idx > -1) {
            pendingOrders.splice(idx, 1);
            db.write('pending_orders.json', pendingOrders);
        }

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
        const channelPayment = db.getSetting('channelPayment') || 'qris';
        const paymentResult = await violetpay.createQrisPayment(
            apiKey,
            secretKey,
            amount,
            customer,
            `Deposit Saldo Rp${amount}`,
            isProduction,
            channelPayment
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

            // Try to assume it's a URL first
            if (qrisData && (qrisData.startsWith('http') || qrisData.startsWith('https'))) {
                try {
                    sentMsg = await ctx.replyWithPhoto(qrisData, { caption: msg, ...keyboard });
                } catch (e) {
                    // fall through if failed
                }
            }

            // If it wasn't a URL or sending as URL failed, try generating QR from string
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

            const pendingOrders = db.read('pending_orders.json') || [];
            pendingOrders.push({
                refKode: paymentResult.refKode,
                refId: paymentResult.id_reference || paymentResult.ref_id,
                userId: userId,
                type: 'deposit',
                total: amount,
                createdAt: Date.now(),
                messageId: sentMsg ? sentMsg.message_id : null
            });
            db.write('pending_orders.json', pendingOrders);

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

    // Track sales stats
    try {
        db.updateStats(1, order.total); // 1 sale, add omzet
        db.incrementMemberOrder(order.userId);
    } catch (e) {
        console.error('Failed to track sale stats:', e.message);
    }


    try {
        if (order.userId) {

            const photo = db.getSetting('photo');
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
        const pendingOrders = db.read('pending_orders.json') || [];
        if (pendingOrders.length === 0) return;


        const ordersToCheck = [...pendingOrders];
        let changes = false;

        for (const order of ordersToCheck) {
            try {
                const result = await violetpay.checkTransaction(
                    apiKey, secretKey, order.refKode, order.refId, isProduction
                );

                const txStatus = result.data ? result.data.status : result.status;
                const statusLower = String(txStatus).toLowerCase();

                if (statusLower === 'success' || statusLower === 'sukses' || statusLower === 'dibayar') {



                    if (order.type === 'deposit') {
                        updateMemberSaldo(db, order.userId, order.total);


                        if (order.messageId) {
                            try { await bot.telegram.deleteMessage(order.userId, order.messageId); } catch (e) { }
                        }

                        try {
                            if (order.userId) {
                                await bot.telegram.sendMessage(order.userId, `✅ Deposit Rp${order.total.toLocaleString()} Berhasil diterima!`);
                            }
                        } catch (e) { }

                    } else {

                        const products = db.read('products.json');
                        const product = products.find(p => p.code.toLowerCase() === order.productCode.toLowerCase());

                        if (product && product.stock.length >= order.qty) {
                            const items = product.stock.splice(0, order.qty);
                            db.write('products.json', products);

                            await deliverProduct(bot, db, order, product, items);
                            setQty(order.userId, order.productCode, 1);
                        }
                    }


                    const idx = pendingOrders.findIndex(o => o.refKode === order.refKode);
                    if (idx > -1) {
                        pendingOrders.splice(idx, 1);
                        changes = true;
                    }

                } else if (statusLower === 'kadaluarsa' || statusLower === 'expired') {

                    const idx = pendingOrders.findIndex(o => o.refKode === order.refKode);
                    if (idx > -1) {
                        pendingOrders.splice(idx, 1);
                        changes = true;

                        try {
                            if (order.userId) {
                                await bot.telegram.sendMessage(order.userId, '❌ Pembayaran QRIS telah kadaluarsa.',
                                    Markup.inlineKeyboard([[Markup.button.callback('🔙 Menu', 'back_to_cat')]])
                                );
                            }
                        } catch (e) { }
                    }
                }
            } catch (error) {
                console.error(`Error checking payment ${order.refKode}:`, error.message);
            }
        }

        if (changes) {
            db.write('pending_orders.json', pendingOrders);
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
            } catch (e3) {

            }
        }
    }
}

async function showCategoryList(ctx, db, page, edit = false) {
    const products = db.read('products.json');
    const categories = db.read('categories.json');

    if (categories.length === 0) {
        const msg = '📭 Belum ada produk tersedia';
        if (edit) return editCaption(ctx, msg, {});
        return ctx.reply(msg);
    }

    const catWithStock = categories.map((cat, idx) => {
        const prods = products.filter(p => p.category.toLowerCase() === cat.name.toLowerCase());
        const totalStock = prods.reduce((sum, p) => sum + p.stock.length, 0);
        return { ...cat, index: idx, stock: totalStock };
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

    const photo = db.getSetting('photo');
    if (photo) {
        try { return await ctx.replyWithPhoto(photo, { caption: msg, ...keyboard }); }
        catch (e) { }
    }
    return ctx.reply(msg, keyboard);
}

async function showProductsByCategory(ctx, db, categoryIndex) {
    const categories = db.read('categories.json');
    const products = db.read('products.json');

    if (!categories[categoryIndex]) {
        return editCaption(ctx, 'Category tidak ditemukan', {});
    }

    const cat = categories[categoryIndex];
    const prods = products.filter(p => p.category.toLowerCase() === cat.name.toLowerCase());

    if (prods.length === 0) {
        const keyboard = Markup.inlineKeyboard([[Markup.button.callback('🔙 Kembali', 'back_to_cat')]]);
        return editCaption(ctx, `📭 Belum ada produk di ${cat.name}`, keyboard);
    }

    let msg = `╭ - - - - - - - - - - - - - - - - - - - ╮\n`;
    msg += `┊  ${cat.name.toUpperCase()}\n`;
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
    const products = db.read('products.json');
    const product = products.find(p => p.code.toLowerCase() === code.toLowerCase());
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
    const products = db.read('products.json');
    const product = products.find(p => p.code.toLowerCase() === code.toLowerCase());
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
    const products = db.read('products.json');
    const product = products.find(p => p.code.toLowerCase() === code.toLowerCase());
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

        const items = product.stock.splice(0, qty);
        db.write('products.json', products);
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
        const channelPayment = db.getSetting('channelPayment') || 'qris';
        const paymentResult = await violetpay.createQrisPayment(
            apiKey,
            secretKey,
            total,
            customer,
            `${product.name} x${qty}`,
            isProduction,
            channelPayment
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
                } catch (e) {

                }
            }

            if (!sentMsg) {
                sentMsg = await editCaption(ctx, msg, keyboard);
            }


            const pendingOrders = db.read('pending_orders.json') || [];
            pendingOrders.push({
                refKode: paymentResult.refKode,
                refId: paymentResult.id_reference || paymentResult.ref_id,
                userId: userId,
                productCode: code,
                qty: qty,
                total: total,
                createdAt: Date.now(),
                messageId: sentMsg ? sentMsg.message_id : null
            });
            db.write('pending_orders.json', pendingOrders);

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
    const products = db.read('products.json');
    console.log(`[DEBUG] Buying Saldo. Code: '${code}'`);
    console.log(`[DEBUG] Available products:`, products.map(p => p.code));

    const product = products.find(p => p.code.toLowerCase() === code.toLowerCase());
    console.log(`[DEBUG] Found product:`, product ? product.name : 'null');

    const userId = ctx.from.id;
    const qty = getQty(userId, code);

    if (!product) {
        const productCodes = products.map(p => p.code).join(', ');
        const debugMsg = `❌ Produk tidak ditemukan.\n\n` +
            `ℹ️ Debug Info:\n` +
            `Searched Code: '${code}'\n` +
            `Total Products: ${products.length}\n` +
            `Available Codes: ${productCodes}`;
        return editCaption(ctx, debugMsg, Markup.inlineKeyboard([[Markup.button.callback('🔙 Kembali', 'back_to_cat')]]));
    }

    if (product.stock.length === 0) {
        return editCaption(ctx, '❌ Stok habis', Markup.inlineKeyboard([[Markup.button.callback('🔙 Kembali', 'back_to_cat')]]));
    }

    if (product.stock.length < qty) {
        return editCaption(ctx, `❌ Stok tidak cukup (tersedia: ${product.stock.length})`, Markup.inlineKeyboard([[Markup.button.callback('🔙 Kembali', 'back_to_cat')]]));
    }

    const total = product.price * qty;
    const currentSaldo = getMemberSaldo(db, userId);

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


    updateMemberSaldo(db, userId, -total);


    const items = product.stock.splice(0, qty);
    db.write('products.json', products);


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
