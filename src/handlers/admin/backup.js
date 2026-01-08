const { Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { getOwnerId } = require('../../middleware/roleCheck');
const pool = require('../../database/db');

const backupIntervals = {};

const parseDuration = (duration) => {
    const match = duration.match(/^(\d+)(s|m|h|d|month)$/i);
    if (!match) return null;
    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    switch (unit) {
        case 's': return value * 1000;
        case 'm': return value * 60 * 1000;
        case 'h': return value * 60 * 60 * 1000;
        case 'd': return value * 24 * 60 * 60 * 1000;
        case 'month': return value * 30 * 24 * 60 * 60 * 1000;
        default: return null;
    }
};

const createMySQLBackup = async (botId, isFullBackup = false) => {
    const date = new Date();
    const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
    const timeStr = date.toTimeString().split(' ')[0].replace(/:/g, '');
    const prefix = isFullBackup ? 'FULL_BACKUP' : `backup_${botId}`;
    const fileName = `${prefix}_${dateStr}_${timeStr}.sql`;
    const filePath = path.join(__dirname, '../../../temp', fileName);

    const tempDir = path.join(__dirname, '../../../temp');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    let sql = `-- MySQL Backup for ${isFullBackup ? 'ALL BOTS' : 'Bot ' + botId}\n`;
    sql += `-- Generated: ${date.toISOString()}\n\n`;

    if (isFullBackup) {
        const tables = ['owner_config', 'bots', 'bot_settings', 'members', 'categories', 'products', 'product_stock', 'pending_orders', 'stats'];
        for (const table of tables) {
            const [rows] = await pool.query(`SELECT * FROM ${table}`);
            if (rows.length > 0) {
                sql += `-- Table: ${table}\n`;
                for (const row of rows) {
                    const keys = Object.keys(row).join(', ');
                    const values = Object.values(row).map(v => v === null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`).join(', ');
                    sql += `INSERT INTO ${table} (${keys}) VALUES (${values});\n`;
                }
                sql += '\n';
            }
        }
    } else {
        const tables = ['bot_settings', 'members', 'categories', 'products', 'pending_orders', 'stats'];
        for (const table of tables) {
            const [rows] = await pool.query(`SELECT * FROM ${table} WHERE bot_id = ?`, [botId]);
            if (rows.length > 0) {
                sql += `-- Table: ${table}\n`;
                for (const row of rows) {
                    const keys = Object.keys(row).join(', ');
                    const values = Object.values(row).map(v => v === null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`).join(', ');
                    sql += `INSERT INTO ${table} (${keys}) VALUES (${values});\n`;
                }
                sql += '\n';
            }
        }
    }

    fs.writeFileSync(filePath, sql);
    return { filePath, fileName };
};

const registerBackup = (bot, db) => {
    bot.command('backup', async (ctx) => {
        const ownerId = await getOwnerId();
        const adminUsername = await db.getSetting('adminUsername');
        const userUsername = ctx.from.username;

        const isOwner = ctx.from.id === ownerId;
        const adminList = adminUsername ? adminUsername.split(',').map(a => a.trim().toLowerCase()) : [];
        const isAdmin = userUsername && adminList.includes(userUsername.toLowerCase());

        if (!isOwner && !isAdmin) return ctx.reply('⛔ Akses ditolak');

        const args = ctx.message.text.split(' ').slice(1);
        const botId = db.botId;

        if (args.length === 0) {
            ctx.reply('⏳ Membuat backup MySQL...');
            try {
                const { filePath, fileName } = await createMySQLBackup(botId, isOwner);
                await ctx.replyWithDocument(
                    { source: filePath, filename: fileName },
                    { caption: `✅ Backup MySQL berhasil!\n📁 ${fileName}` }
                );
                fs.unlinkSync(filePath);
            } catch (error) {
                ctx.reply(`❌ Gagal backup: ${error.message}`);
            }
            return;
        }

        if (args[0].toLowerCase() === 'on') {
            if (args.length < 2) return ctx.reply('⚠️ Format: /backup on <interval>');
            const interval = args[1];
            const ms = parseDuration(interval);
            if (!ms) return ctx.reply('❌ Format interval tidak valid');

            if (backupIntervals[botId]) clearInterval(backupIntervals[botId].intervalId);

            const intervalId = setInterval(async () => {
                try {
                    const { filePath, fileName } = await createMySQLBackup(botId, false);
                    await bot.telegram.sendDocument(ctx.from.id, { source: filePath, filename: fileName }, { caption: `🔄 Auto Backup\n📁 ${fileName}` });
                    fs.unlinkSync(filePath);
                } catch (error) {
                    console.error(`Backup error:`, error.message);
                }
            }, ms);

            backupIntervals[botId] = { intervalId, interval, userId: ctx.from.id };
            await db.setSetting('autoBackup', JSON.stringify({ interval, userId: ctx.from.id }));
            return ctx.reply(`✅ Auto backup aktif!\n⏱️ Interval: ${interval}`);
        }

        if (args[0].toLowerCase() === 'off') {
            if (backupIntervals[botId]) {
                clearInterval(backupIntervals[botId].intervalId);
                delete backupIntervals[botId];
            }
            await db.setSetting('autoBackup', null);
            return ctx.reply('✅ Auto backup dinonaktifkan');
        }

        if (args[0].toLowerCase() === 'status') {
            const autoBackup = await db.getSetting('autoBackup');
            if (autoBackup && backupIntervals[botId]) {
                const parsed = JSON.parse(autoBackup);
                return ctx.reply(`📊 Auto Backup: ✅ Aktif\n⏱️ Interval: ${parsed.interval}`);
            }
            return ctx.reply('📊 Auto Backup: ❌ Tidak aktif');
        }
    });

    bot.command('upbackup', async (ctx) => {
        const ownerId = await getOwnerId();
        if (ctx.from.id !== ownerId) return ctx.reply('⛔ Akses ditolak. Hanya owner.');
        return ctx.reply('⚠️ Restore backup MySQL: Import file .sql melalui phpMyAdmin atau mysql CLI');
    });
};

module.exports = { registerBackup };
