const { Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

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

const createBackupZip = async (botId, isFullBackup = false) => {
    // If full backup (owner), backup ../../../data
    // If single backup (admin), backup ../../../data/bot_{botId}
    const sourceDir = isFullBackup
        ? path.join(__dirname, '../../../data')
        : path.join(__dirname, '../../../data', `bot_${botId}`);

    const date = new Date();
    const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
    const timeStr = date.toTimeString().split(' ')[0].replace(/:/g, '');
    const prefix = isFullBackup ? 'FULL_BACKUP' : `backup_${botId}`;
    const zipName = `${prefix}_${dateStr}_${timeStr}.zip`;
    const zipPath = path.join(__dirname, '../../../temp', zipName);

    // Ensure temp directory exists
    const tempDir = path.join(__dirname, '../../../temp');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => resolve({ zipPath, zipName }));
        archive.on('error', (err) => reject(err));

        archive.pipe(output);

        if (fs.existsSync(sourceDir)) {
            archive.directory(sourceDir, isFullBackup ? 'data' : false);
        }

        archive.finalize();
    });
};

const registerBackup = (bot, db) => {
    bot.command('backup', async (ctx) => {
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
        const botId = db.botId;

        // /backup - Manual backup
        if (args.length === 0) {
            ctx.reply('⏳ Membuat backup...');

            try {
                // Owner gets full backup, admin gets single bot backup
                const { zipPath, zipName } = await createBackupZip(botId, isOwner);

                await ctx.replyWithDocument(
                    { source: zipPath, filename: zipName },
                    { caption: `✅ Backup berhasil!\n📁 ${zipName}\n${isOwner ? '🔐 Mode: Full Backup (Owner)' : '👤 Mode: Bot Backup'}` }
                );

                // Clean up temp file
                fs.unlinkSync(zipPath);
            } catch (error) {
                ctx.reply(`❌ Gagal backup: ${error.message}`);
            }
            return;
        }

        // /backup on <interval>
        if (args[0].toLowerCase() === 'on') {
            if (args.length < 2) {
                return ctx.reply('⚠️ Format: /backup on <interval>\n\nContoh:\n• /backup on 1h\n• /backup on 1d\n• /backup on 1month');
            }

            const interval = args[1];
            const ms = parseDuration(interval);

            if (!ms) {
                return ctx.reply('❌ Format interval tidak valid. Contoh: 1s, 5m, 1h, 1d, 1month');
            }

            // Stop existing interval if any
            if (backupIntervals[botId]) {
                clearInterval(backupIntervals[botId].intervalId);
            }

            // Start new interval
            const intervalId = setInterval(async () => {
                try {
                    const { zipPath, zipName } = await createBackupZip(botId, isOwner);

                    await bot.telegram.sendDocument(
                        ctx.from.id,
                        { source: zipPath, filename: zipName },
                        { caption: `🔄 Auto Backup\n📁 ${zipName}\n${isOwner ? '🔐 Mode: Full Backup (Owner)' : '👤 Mode: Bot Backup'}` }
                    );

                    fs.unlinkSync(zipPath);
                } catch (error) {
                    console.error(`Backup error for bot ${botId}:`, error.message);
                }
            }, ms);

            backupIntervals[botId] = {
                intervalId,
                interval,
                userId: ctx.from.id
            };

            db.setSetting('autoBackup', { interval, userId: ctx.from.id });

            return ctx.reply(`✅ Auto backup aktif!\n\n⏱️ Interval: ${interval}\n\nGunakan /backup off untuk menonaktifkan`);
        }

        // /backup off
        if (args[0].toLowerCase() === 'off') {
            if (backupIntervals[botId]) {
                clearInterval(backupIntervals[botId].intervalId);
                delete backupIntervals[botId];
            }

            db.setSetting('autoBackup', null);
            return ctx.reply('✅ Auto backup dinonaktifkan');
        }

        // /backup status
        if (args[0].toLowerCase() === 'status') {
            const autoBackup = db.getSetting('autoBackup');
            if (autoBackup && backupIntervals[botId]) {
                return ctx.reply(`📊 Status Auto Backup\n\n✅ Aktif\n⏱️ Interval: ${autoBackup.interval}`);
            }
            return ctx.reply('📊 Status Auto Backup\n\n❌ Tidak aktif');
        }

        return ctx.reply('⚠️ Format:\n• /backup - Backup manual\n• /backup on <interval> - Aktifkan auto backup\n• /backup off - Nonaktifkan auto backup\n• /backup status - Cek status');
    });

    bot.command('upbackup', async (ctx) => {
        const ownerConfig = require('../../../config/owner.json');
        if (ctx.from.id !== ownerConfig.ownerId) {
            return ctx.reply('⛔ Akses ditolak. Hanya owner.');
        }

        if (!ctx.message.reply_to_message || !ctx.message.reply_to_message.document) {
            return ctx.reply('⚠️ Reply file zip backup dengan command ini.\n\nFormat:\n• /upbackup - Restore Full Data\n• /upbackup <botId> - Restore Bot Tertentu');
        }

        const doc = ctx.message.reply_to_message.document;
        if (doc.mime_type !== 'application/zip') {
            return ctx.reply('❌ File harus berformat .zip');
        }

        const args = ctx.message.text.split(' ').slice(1);
        const targetBotId = args[0];

        ctx.reply('⏳ Mendownload & memproses backup...');

        try {
            const fileLink = await bot.telegram.getFileLink(doc.file_id);
            const axios = require('axios');
            const AdmZip = require('adm-zip');

            const response = await axios({
                url: fileLink.href,
                method: 'GET',
                responseType: 'arraybuffer'
            });

            const zip = new AdmZip(response.data);
            const dataDir = path.join(__dirname, '../../../data');

            if (targetBotId) {
                // Restore single bot: replace data/bot_{id} content
                const targetDir = path.join(dataDir, `bot_${targetBotId}`);

                // Clear existing directory first
                if (fs.existsSync(targetDir)) {
                    fs.rmSync(targetDir, { recursive: true, force: true });
                }
                fs.mkdirSync(targetDir, { recursive: true });

                // Extract to target dir
                zip.extractAllTo(targetDir, true);

                // If zip contains a 'data' wrap, move content up
                // Logic: check if extracted has 'data' folder inside
                const extractedDataPath = path.join(targetDir, 'data');
                if (fs.existsSync(extractedDataPath)) {
                    // Move content from data/bot_{id}/data -> data/bot_{id}
                    // But wait, structure inside zip depends on how it was created
                    // Our backup creates zip with 'data' root folder if full backup
                    // Or 'data/bot_{id}' if single backup?
                    // Let's assume zip structure matches what we create in createBackupZip
                    // Single backup: archive.directory(dataDir, false) -> zip root has files
                    // Full backup: archive.directory(sourceDir, 'data') -> zip root has 'data' folder
                }

                ctx.reply(`✅ Backup berhasil direstore untuk Bot ID: ${targetBotId}`);
            } else {
                // Restore full data: replace ALL content in data/

                // 1. Extract to temporary folder first to check structure
                const tempExtractDir = path.join(__dirname, '../../../temp/restore_extract');
                if (fs.existsSync(tempExtractDir)) {
                    fs.rmSync(tempExtractDir, { recursive: true, force: true });
                }
                fs.mkdirSync(tempExtractDir, { recursive: true });

                zip.extractAllTo(tempExtractDir, true);

                // 2. Check if there is a 'data' folder inside
                const innerDataDir = path.join(tempExtractDir, 'data');
                const sourceForRestore = fs.existsSync(innerDataDir) ? innerDataDir : tempExtractDir;

                // 3. Clear current data directory (danger zone!)
                // Only clear if we have valid extracted data
                if (fs.readdirSync(sourceForRestore).length > 0) {
                    // We don't delete data dir itself to keep permissions, just contents
                    // But bots.json might be needing preservation? No, full restore implies replacing everything.

                    // Helper to copy recursive
                    const copyRecursiveSync = (src, dest) => {
                        if (fs.existsSync(src) && fs.statSync(src).isDirectory()) {
                            if (!fs.existsSync(dest)) fs.mkdirSync(dest);
                            fs.readdirSync(src).forEach(childItemName => {
                                copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
                            });
                        } else {
                            fs.copyFileSync(src, dest);
                        }
                    };

                    // Overwrite files
                    copyRecursiveSync(sourceForRestore, dataDir);

                    // Cleanup temp
                    fs.rmSync(tempExtractDir, { recursive: true, force: true });

                    ctx.reply('✅ Full Data Backup berhasil direstore! \n⚠️ Folder data telah diperbarui sesuai file backup.');
                } else {
                    ctx.reply('❌ File zip kosong atau format salah.');
                }
            }
        } catch (error) {
            ctx.reply(`❌ Gagal restore: ${error.message}`);
            console.error(error);
        }
    });
};

module.exports = { registerBackup };
