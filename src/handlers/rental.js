const { Markup } = require('telegraf');
const violetpay = require('../violetpay');
const QRCode = require('qrcode');


const rentalSession = {};

const getRentalSession = (userId) => {
    if (!rentalSession[userId]) {
        rentalSession[userId] = { months: 1, step: null, data: {} };
    }
    return rentalSession[userId];
};

const clearRentalSession = (userId) => {
    delete rentalSession[userId];
};

const registerRental = (bot, botManager) => {
    const ownerConfig = require('../../config/owner.json');
    const RENTAL_PRICE = ownerConfig.rentalPrice || 50000;

    bot.action('menu_rental', async (ctx) => {
        await ctx.answerCbQuery();
        const session = getRentalSession(ctx.from.id);
        session.months = 1;
        return showRentalOffer(ctx, session.months, RENTAL_PRICE, true);
    });

    bot.action('rental_plus', async (ctx) => {
        await ctx.answerCbQuery();
        const session = getRentalSession(ctx.from.id);
        session.months = Math.min(session.months + 1, 12);
        return showRentalOffer(ctx, session.months, RENTAL_PRICE, true);
    });

    bot.action('rental_minus', async (ctx) => {
        await ctx.answerCbQuery();
        const session = getRentalSession(ctx.from.id);
        session.months = Math.max(session.months - 1, 1);
        return showRentalOffer(ctx, session.months, RENTAL_PRICE, true);
    });

    bot.action(/^rental_edit_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const months = parseInt(ctx.match[1]);
        const session = getRentalSession(ctx.from.id);
        session.months = months;
        return showRentalOffer(ctx, session.months, RENTAL_PRICE, true);
    });

    bot.action('rental_pay', async (ctx) => {
        await ctx.answerCbQuery('Sedang membuat pembayaran...');
        const session = getRentalSession(ctx.from.id);
        const total = RENTAL_PRICE * session.months;

        if (!ownerConfig.ownerVioletpay || !ownerConfig.ownerVioletpay.apiKey) {
            return ctx.reply('❌ Sistem pembayaran tidak tersedia');
        }

        const { apiKey, secretKey, isProduction } = ownerConfig.ownerVioletpay;
        const customer = {
            nama: ctx.from.first_name || 'Customer',
            email: 'customer@email.com',
            phone: '08123456789'
        };

        try {
            const paymentResult = await violetpay.createQrisPayment(
                apiKey,
                secretKey,
                total,
                customer,
                `Sewa Bot ${session.months} Bulan`,
                isProduction
            );

            if (paymentResult.success || paymentResult.status) {
                let msg = `╭ - - - - - - - - - - - - - - - - - - - ╮\n`;
                msg += `┊  💳 PEMBAYARAN SEWA BOT\n`;
                msg += `┊- - - - - - - - - - - - - - - - - - - - -\n`;
                msg += `┊  Durasi: ${session.months} Bulan\n`;
                msg += `┊  Total: Rp${total.toLocaleString()}\n`;
                msg += `┊  Ref: ${paymentResult.refKode}\n`;
                msg += `┊- - - - - - - - - - - - - - - - - - - - -\n`;
                msg += `┊  Scan QRIS untuk bayar\n`;
                msg += `┊  ⏳ Auto-cek setiap 10 detik\n`;
                msg += `╰ - - - - - - - - - - - - - - - - - - - ╯`;

                const buttons = [];
                if (paymentResult.checkout_url) {
                    buttons.push([Markup.button.url('💸 Bayar Sekarang', paymentResult.checkout_url)]);
                }
                buttons.push([Markup.button.callback('🔄 Cek Status', `check_rental_${paymentResult.refKode}`)]);
                buttons.push([Markup.button.callback('❌ Batal', 'cancel_rental')]);

                const keyboard = Markup.inlineKeyboard(buttons);

                session.refKode = paymentResult.refKode;
                session.refId = paymentResult.id_reference || paymentResult.ref_id;
                session.total = total;
                session.userId = ctx.from.id;
                session.chatId = ctx.chat.id;

                const qrisData = paymentResult.qris_url || paymentResult.qr_url || paymentResult.payment_url;
                let sentMsg;

                // Try to assume it's a URL first
                if (qrisData && (qrisData.startsWith('http') || qrisData.startsWith('https'))) {
                    try {
                        sentMsg = await ctx.replyWithPhoto(qrisData, { caption: msg, ...keyboard });
                    } catch (e) {
                        // fall through
                    }
                }

                // If it wasn't a URL or sending as URL failed, try generating QR from string
                if (!sentMsg && qrisData) {
                    try {
                        const qrBuffer = await QRCode.toBuffer(qrisData);
                        sentMsg = await ctx.replyWithPhoto({ source: qrBuffer }, { caption: msg, ...keyboard });
                    } catch (e) {
                        console.error('Failed to generate/send QR for rental:', e);
                    }
                }

                if (!sentMsg) {
                    sentMsg = await ctx.reply(msg, keyboard);
                }

                session.messageId = sentMsg?.message_id;

                startRentalPaymentMonitor(bot, botManager, ctx.from.id, session, ownerConfig);

                return sentMsg;
            } else {
                return ctx.reply('❌ Gagal membuat pembayaran: ' + (paymentResult.message || 'Unknown error'));
            }
        } catch (error) {
            return ctx.reply('❌ Error: ' + error.message);
        }
    });

    bot.action(/^check_rental_(.+)$/, async (ctx) => {
        const refKode = ctx.match[1];
        await ctx.answerCbQuery('Mengecek pembayaran...');
        const session = getRentalSession(ctx.from.id);

        if (!ownerConfig.ownerVioletpay) return ctx.reply('❌ Config error');

        const { apiKey, secretKey, isProduction } = ownerConfig.ownerVioletpay;

        try {
            const result = await violetpay.checkTransaction(
                apiKey, secretKey, refKode, session.refId, isProduction
            );

            const txStatus = result.data ? result.data.status : result.status;
            const statusLower = String(txStatus).toLowerCase();

            if (statusLower === 'success' || statusLower === 'sukses' || statusLower === 'dibayar') {
                session.step = 'token';
                let msg = `╭ - - - - - - - - - - - - - - - - - - - ╮\n`;
                msg += `┊  ✅ PEMBAYARAN BERHASIL!\n`;
                msg += `┊- - - - - - - - - - - - - - - - - - - - -\n`;
                msg += `┊  Durasi: ${session.months} Bulan\n`;
                msg += `┊- - - - - - - - - - - - - - - - - - - - -\n`;
                msg += `┊  📤 Silakan kirim TOKEN BOT Anda\n`;
                msg += `┊  (Dapatkan dari @BotFather)\n`;
                msg += `╰ - - - - - - - - - - - - - - - - - - - ╯`;
                return ctx.reply(msg, Markup.forceReply());

            } else if (statusLower === 'kadaluarsa' || statusLower === 'expired') {
                clearRentalSession(ctx.from.id);
                return ctx.reply('❌ Pembayaran kadaluarsa', Markup.inlineKeyboard([
                    [Markup.button.callback('🔙 Kembali', 'menu_rental')]
                ]));
            } else {
                return ctx.reply(`⏳ Status: Menunggu pembayaran\n\nScan QRIS untuk bayar.`, Markup.inlineKeyboard([
                    [Markup.button.callback('🔄 Cek Lagi', `check_rental_${refKode}`)],
                    [Markup.button.callback('❌ Batal', 'cancel_rental')]
                ]));
            }
        } catch (error) {
            return ctx.reply('❌ Error: ' + error.message);
        }
    });

    bot.action('cancel_rental', async (ctx) => {
        await ctx.answerCbQuery();
        clearRentalSession(ctx.from.id);

        try {
            await ctx.deleteMessage();
        } catch (e) { }

        return ctx.reply('🚫 Pembayaran sewa dibatalkan');
    });

    bot.on('text', async (ctx, next) => {
        const session = rentalSession[ctx.from.id];
        if (!session || !session.step) return next();

        const text = ctx.message.text.trim();

        if (session.step === 'token') {
            if (!text.includes(':')) {
                return ctx.reply('⚠️ Token tidak valid. Kirim token bot dari @BotFather\n\nFormat: 123456789:ABCdefGHI...');
            }
            session.data.token = text;
            session.step = 'admin';
            return ctx.reply('✅ Token diterima!\n\n📤 Sekarang kirim USERNAME ADMIN bot\n(tanpa @, contoh: nuroela)', Markup.forceReply());
        }

        if (session.step === 'admin') {
            session.data.adminUsername = text.replace('@', '');
            session.step = 'apikey';
            return ctx.reply('✅ Admin username diterima!\n\n📤 Sekarang kirim API KEY VioletPay Anda', Markup.forceReply());
        }

        if (session.step === 'apikey') {
            session.data.apiKey = text;
            session.step = 'secretkey';
            return ctx.reply('✅ API Key diterima!\n\n📤 Sekarang kirim SECRET KEY VioletPay Anda', Markup.forceReply());
        }

        if (session.step === 'secretkey') {
            session.data.secretKey = text;
            session.step = 'processing';

            const expiresAt = new Date();
            expiresAt.setMonth(expiresAt.getMonth() + session.months);

            const violetConfig = {
                apiKey: session.data.apiKey,
                secretKey: session.data.secretKey,
                isProduction: true
            };

            try {
                const result = await botManager.addBot(
                    session.data.token,
                    violetConfig,
                    session.data.adminUsername,
                    expiresAt.toISOString()
                );

                if (result.success) {
                    clearRentalSession(ctx.from.id);
                    let msg = `╭ - - - - - - - - - - - - - - - - - - - ╮\n`;
                    msg += `┊  🎉 BOT BERHASIL DIAKTIFKAN!\n`;
                    msg += `┊- - - - - - - - - - - - - - - - - - - - -\n`;
                    msg += `┊  🤖 Bot: @${result.username}\n`;
                    msg += `┊  👤 Admin: @${session.data.adminUsername}\n`;
                    msg += `┊  📅 Expired: ${expiresAt.toLocaleDateString('id-ID')}\n`;
                    msg += `┊- - - - - - - - - - - - - - - - - - - - -\n`;
                    msg += `┊  Bot sudah berjalan dan siap digunakan!\n`;
                    msg += `╰ - - - - - - - - - - - - - - - - - - - ╯`;
                    return ctx.reply(msg);
                } else {
                    session.step = 'token';
                    return ctx.reply('❌ Gagal: ' + result.error + '\n\nSilakan kirim token yang valid.');
                }
            } catch (error) {
                session.step = 'token';
                return ctx.reply('❌ Error: ' + error.message + '\n\nSilakan kirim token yang valid.');
            }
        }

        return next();
    });
};

async function showRentalOffer(ctx, months, pricePerMonth, edit = false) {
    const total = months * pricePerMonth;

    let msg = `╭ - - - - - - - - - - - - - - - - - - - ╮\n`;
    msg += `┊  🤖 SEWA BOT STORE TELEGRAM\n`;
    msg += `┊- - - - - - - - - - - - - - - - - - - - -\n`;
    msg += `┊  ✨ Fitur:\n`;
    msg += `┊  • Toko otomatis dengan QRIS\n`;
    msg += `┊  • Multi kategori & produk\n`;
    msg += `┊  • Deposit saldo member\n`;
    msg += `┊  • Broadcast ke member\n`;
    msg += `┊- - - - - - - - - - - - - - - - - - - - -\n`;
    msg += `┊  💰 Harga: Rp${pricePerMonth.toLocaleString()}/bulan\n`;
    msg += `┊  📅 Durasi: ${months} Bulan\n`;
    msg += `┊  💵 TOTAL: Rp${total.toLocaleString()}\n`;
    msg += `╰ - - - - - - - - - - - - - - - - - - - ╯`;

    const keyboard = Markup.inlineKeyboard([
        [
            Markup.button.callback('➖', 'rental_minus'),
            Markup.button.callback(`${months} Bulan`, 'rental_noop'),
            Markup.button.callback('➕', 'rental_plus')
        ],
        [Markup.button.callback('💳 SEWA SEKARANG', 'rental_pay')]
    ]);

    if (edit) {
        try {
            if (ctx.callbackQuery?.message?.photo) {
                return await ctx.editMessageCaption(msg, keyboard);
            }
            return await ctx.editMessageText(msg, keyboard);
        } catch (e) { }
    }
    return ctx.reply(msg, keyboard);
}

function startRentalPaymentMonitor(bot, botManager, userId, session, ownerConfig) {
    if (session.monitorInterval) {
        clearInterval(session.monitorInterval);
    }

    const { apiKey, secretKey, isProduction } = ownerConfig.ownerVioletpay;

    session.monitorInterval = setInterval(async () => {
        if (!session.refKode || session.step) {
            clearInterval(session.monitorInterval);
            return;
        }

        try {
            const result = await violetpay.checkTransaction(
                apiKey, secretKey, session.refKode, session.refId, isProduction
            );

            const txStatus = result.data ? result.data.status : result.status;
            const statusLower = String(txStatus).toLowerCase();

            if (statusLower === 'success' || statusLower === 'sukses' || statusLower === 'dibayar') {
                clearInterval(session.monitorInterval);
                session.step = 'token';

                if (session.messageId) {
                    try {
                        await bot.telegram.deleteMessage(session.chatId, session.messageId);
                    } catch (e) { }
                }

                let msg = `╭ - - - - - - - - - - - - - - - - - - - ╮\n`;
                msg += `┊  ✅ PEMBAYARAN BERHASIL!\n`;
                msg += `┊- - - - - - - - - - - - - - - - - - - - -\n`;
                msg += `┊  Durasi: ${session.months} Bulan\n`;
                msg += `┊- - - - - - - - - - - - - - - - - - - - -\n`;
                msg += `┊  📤 Silakan kirim TOKEN BOT Anda\n`;
                msg += `┊  (Dapatkan dari @BotFather)\n`;
                msg += `╰ - - - - - - - - - - - - - - - - - - - ╯`;

                try {
                    await bot.telegram.sendMessage(session.chatId, msg, { reply_markup: { force_reply: true } });
                } catch (e) {
                    console.error('Failed to send token request:', e.message);
                }

            } else if (statusLower === 'kadaluarsa' || statusLower === 'expired') {
                clearInterval(session.monitorInterval);
                clearRentalSession(userId);

                try {
                    await bot.telegram.sendMessage(session.chatId, '❌ Pembayaran kadaluarsa');
                } catch (e) { }
            }
        } catch (error) {
            console.error('Rental payment check error:', error.message);
        }
    }, 5000);
}

module.exports = { registerRental };

