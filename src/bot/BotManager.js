const { Telegraf } = require('telegraf');
const BotInstance = require('./BotInstance');
const { registerBotCommands } = require('../handlers');
const pool = require('../database/db');

class BotManager {
    constructor() {
        this.runningBots = new Map();
    }

    async loadBotsData() {
        const [rows] = await pool.query(
            `SELECT id, username, token, admin_username as adminUsername, 
             violetpay_api_key, violetpay_secret_key, violetpay_is_production,
             expires_at as expiresAt, added_at as addedAt
             FROM bots WHERE id != 'main'`
        );
        return {
            bots: rows.map(row => ({
                id: row.id,
                username: row.username,
                token: row.token,
                adminUsername: row.adminUsername,
                violetpay: row.violetpay_api_key ? {
                    apiKey: row.violetpay_api_key,
                    secretKey: row.violetpay_secret_key,
                    isProduction: row.violetpay_is_production
                } : null,
                expiresAt: row.expiresAt,
                addedAt: row.addedAt
            }))
        };
    }

    async saveBot(botData) {
        await pool.query(
            `INSERT INTO bots (id, username, token, admin_username, violetpay_api_key, violetpay_secret_key, violetpay_is_production, expires_at, added_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
             username = VALUES(username),
             admin_username = VALUES(admin_username),
             violetpay_api_key = VALUES(violetpay_api_key),
             violetpay_secret_key = VALUES(violetpay_secret_key),
             violetpay_is_production = VALUES(violetpay_is_production),
             expires_at = VALUES(expires_at)`,
            [
                botData.id,
                botData.username,
                botData.token,
                botData.adminUsername || null,
                botData.violetpay?.apiKey || null,
                botData.violetpay?.secretKey || null,
                botData.violetpay?.isProduction ?? true,
                botData.expiresAt ? new Date(botData.expiresAt) : null,
                botData.addedAt ? new Date(botData.addedAt) : new Date()
            ]
        );
    }

    async getBots() {
        const data = await this.loadBotsData();
        return data.bots;
    }

    async getBot(botId) {
        const [rows] = await pool.query(
            `SELECT id, username, token, admin_username as adminUsername,
             violetpay_api_key, violetpay_secret_key, violetpay_is_production,
             expires_at as expiresAt, added_at as addedAt
             FROM bots WHERE id = ?`,
            [botId]
        );
        if (rows.length === 0) return null;
        const row = rows[0];
        return {
            id: row.id,
            username: row.username,
            token: row.token,
            adminUsername: row.adminUsername,
            violetpay: row.violetpay_api_key ? {
                apiKey: row.violetpay_api_key,
                secretKey: row.violetpay_secret_key,
                isProduction: row.violetpay_is_production
            } : null,
            expiresAt: row.expiresAt,
            addedAt: row.addedAt
        };
    }

    async addBot(token, violetConfig = null, adminUsername = null, expiresAt = null) {
        try {
            const tempBot = new Telegraf(token);
            const info = await tempBot.telegram.getMe();

            const [existing] = await pool.query('SELECT id FROM bots WHERE id = ?', [info.id.toString()]);
            if (existing.length > 0) {
                return { success: false, error: 'Bot sudah terdaftar' };
            }

            const newBot = {
                id: info.id.toString(),
                username: info.username,
                token: token,
                adminUsername: adminUsername,
                violetpay: violetConfig,
                expiresAt: expiresAt,
                addedAt: new Date().toISOString()
            };

            await this.saveBot(newBot);

            // Initialize stats for new bot
            await pool.query(
                `INSERT IGNORE INTO stats (bot_id, total_sales, total_omzet, rating_total, rating_count)
                 VALUES (?, 0, 0, 0, 0)`,
                [info.id.toString()]
            );

            const botInstance = new BotInstance(token, this);
            await botInstance.start();
            this.runningBots.set(info.id.toString(), botInstance);

            return { success: true, botId: info.id.toString(), username: info.username };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async removeBot(botId) {
        try {
            const [existing] = await pool.query('SELECT id FROM bots WHERE id = ?', [botId]);
            if (existing.length === 0) {
                return { success: false, error: 'Bot tidak ditemukan' };
            }

            if (this.runningBots.has(botId)) {
                await this.runningBots.get(botId).stop();
                this.runningBots.delete(botId);
            }

            // Delete from database (CASCADE will handle related tables)
            await pool.query('DELETE FROM bots WHERE id = ?', [botId]);

            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async updateBotExpiration(botId, newExpiresAt) {
        await pool.query(
            'UPDATE bots SET expires_at = ? WHERE id = ?',
            [new Date(newExpiresAt), botId]
        );
    }

    async startAllBots() {
        const data = await this.loadBotsData();
        const now = new Date();

        for (const botData of data.bots) {
            try {
                if (botData.expiresAt) {
                    const expDate = new Date(botData.expiresAt);
                    if (expDate < now) {
                        console.log(`[BotManager] Bot ${botData.id} (@${botData.username}) EXPIRED - skipped`);
                        continue;
                    }
                }

                console.log(`[BotManager] Starting bot ${botData.id}...`);
                const botInstance = new BotInstance(botData.token, this);
                await botInstance.start();
                this.runningBots.set(botData.id, botInstance);
            } catch (error) {
                console.error(`[BotManager] Failed: ${error.message}`);
            }
        }
    }

    async stopAllBots() {
        for (const [botId, botInstance] of this.runningBots) {
            await botInstance.stop();
        }
        this.runningBots.clear();
    }

    createMainBot(token) {
        const mainBot = new Telegraf(token);
        const MySQLDatabase = require('../database/MySQLDatabase');
        const db = new MySQLDatabase('main');
        const { registerStart } = require('../handlers');
        const { registerAdminHandlers } = require('../handlers/admin');
        const { registerRental } = require('../handlers/rental');
        const { isMember } = require('../middleware/roleCheck');

        mainBot.use(isMember(db));
        registerStart(mainBot, db);
        registerAdminHandlers(mainBot, db);
        registerRental(mainBot, this);
        registerBotCommands(mainBot, this);

        mainBot.catch((err) => {
            console.error('[MainBot] Error:', err.message);
        });

        return mainBot;
    }

    startExpirationMonitor() {
        setInterval(async () => {
            const data = await this.loadBotsData();
            const now = new Date();

            for (const botData of data.bots) {
                if (!botData.expiresAt) continue;

                const expDate = new Date(botData.expiresAt);
                if (expDate > now) continue;

                if (!this.runningBots.has(botData.id)) continue;

                console.log(`[ExpirationMonitor] Bot ${botData.id} (@${botData.username}) has expired. Stopping...`);

                try {
                    const botInstance = this.runningBots.get(botData.id);

                    if (botInstance && botInstance.bot) {
                        const expDateStr = expDate.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
                        const msg = `⚠️ *BOT EXPIRED*\n\n` +
                            `Bot @${botData.username} telah expired pada:\n` +
                            `📅 ${expDateStr} WIB\n\n` +
                            `Bot akan dimatikan.\n` +
                            `Hubungi owner untuk perpanjangan.`;

                        const MySQLDatabase = require('../database/MySQLDatabase');
                        const db = new MySQLDatabase(botData.id);
                        const members = await db.getMembers();

                        for (const member of members) {
                            try {
                                await botInstance.bot.telegram.sendMessage(member.userId, msg, { parse_mode: 'Markdown' });
                            } catch (e) { }
                        }

                        await new Promise(r => setTimeout(r, 1000));
                    }

                    await botInstance.stop();
                    this.runningBots.delete(botData.id);

                    console.log(`[ExpirationMonitor] Bot ${botData.id} stopped successfully.`);
                } catch (error) {
                    console.error(`[ExpirationMonitor] Error stopping bot ${botData.id}:`, error.message);
                }
            }
        }, 30000);
    }
}

module.exports = BotManager;
