const { Markup } = require('telegraf');
const { getOwnerId } = require('../../middleware/roleCheck');

const USERS_PER_PAGE = 10;

const registerUserList = (bot, db) => {
    bot.command('listuser', async (ctx) => {
        const ownerId = await getOwnerId();
        const adminUsername = await db.getSetting('adminUsername');
        const userUsername = ctx.from.username;

        const isOwner = ctx.from.id === ownerId;
        const adminList = adminUsername ? adminUsername.split(',').map(a => a.trim().toLowerCase()) : [];
        const isAdmin = userUsername && adminList.includes(userUsername.toLowerCase());

        if (!isOwner && !isAdmin) {
            return ctx.reply('⛔ Akses ditolak');
        }

        return showUserList(ctx, db, 1, false);
    });

    bot.action(/^userlist_page_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const page = parseInt(ctx.match[1]);
        return showUserList(ctx, db, page, true);
    });
};

async function showUserList(ctx, db, page, edit = false) {
    const members = await db.getMembers();

    if (members.length === 0) {
        const msg = '📭 Belum ada member terdaftar';
        if (edit) {
            try { return await ctx.editMessageText(msg); } catch (e) { }
        }
        return ctx.reply(msg);
    }

    const totalPages = Math.ceil(members.length / USERS_PER_PAGE);
    const start = (page - 1) * USERS_PER_PAGE;
    const pageMembers = members.slice(start, start + USERS_PER_PAGE);

    let msg = `╭ - - - - - - - - - - - - - - - - - - - ╮\n`;
    msg += `┊  👥 DAFTAR MEMBER\n`;
    msg += `┊  Page ${page}/${totalPages} (${members.length} total)\n`;
    msg += `┊- - - - - - - - - - - - - - - - - - - - -\n`;

    pageMembers.forEach((m, i) => {
        const username = m.username || 'NoUsername';
        const saldo = m.saldo || 0;
        msg += `┊  ${start + i + 1}. @${username} : Rp${saldo.toLocaleString()}\n`;
    });

    msg += `╰ - - - - - - - - - - - - - - - - - - - ╯`;

    const buttons = [];
    const navRow = [];

    if (page > 1) {
        navRow.push(Markup.button.callback('◀️ Back', `userlist_page_${page - 1}`));
    }
    if (page < totalPages) {
        navRow.push(Markup.button.callback('Next ▶️', `userlist_page_${page + 1}`));
    }
    if (navRow.length > 0) {
        buttons.push(navRow);
    }

    const keyboard = buttons.length > 0 ? Markup.inlineKeyboard(buttons) : {};

    if (edit) {
        try {
            return await ctx.editMessageText(msg, keyboard);
        } catch (e) { }
    }
    return ctx.reply(msg, keyboard);
}

module.exports = { registerUserList };
