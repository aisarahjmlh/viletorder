const { getOwnerId } = require('../../middleware/roleCheck');
const violetpay = require('../../violetpay');

const registerCheckBalance = (bot, db, botConfig = {}) => {
    bot.command('checkbalance', async (ctx) => {
        try {
            const ownerId = await getOwnerId();
            const adminUsername = await db.getSetting('adminUsername');
            const userUsername = ctx.from.username;

            const isOwner = ctx.from.id === ownerId;
            const adminList = adminUsername ? adminUsername.split(',').map(a => a.trim().toLowerCase()) : [];
            const isAdmin = userUsername && adminList.includes(userUsername.toLowerCase());

            if (!isOwner && !isAdmin) return ctx.reply('⛔ Akses ditolak');

            if (!botConfig.violetpay || !botConfig.violetpay.apiKey) {
                return ctx.reply('❌ VioletPay belum dikonfigurasi');
            }

            const { apiKey, secretKey, isProduction } = botConfig.violetpay;
            await ctx.reply('⏳ Mengecek saldo...');

            const result = await violetpay.checkBalance(apiKey, secretKey, isProduction);

            if (result && (result.status === true || result.success)) {
                const balance = result.balance || result.saldo || result.data?.balance || 0;
                let msg = `╭ - - - - - - - - - - - - - - - - - - - ╮\n`;
                msg += `┊  💰 SALDO VIOLETPAY\n`;
                msg += `┊- - - - - - - - - - - - - - - - - - - - -\n`;
                msg += `┊  💵 Rp ${Number(balance).toLocaleString('id-ID')}\n`;
                msg += `╰ - - - - - - - - - - - - - - - - - - - ╯`;
                return ctx.reply(msg);
            } else {
                return ctx.reply(`❌ Gagal: ${result?.message || result?.error || 'API Error'}`);
            }
        } catch (error) {
            ctx.reply(`❌ Error: ${error?.message || 'Unknown error'}`);
        }
    });
};

module.exports = { registerCheckBalance };
