const fs = require('fs');
const path = require('path');
const { Telegraf } = require('telegraf');
const BotInstance = require('./BotInstance');
const { registerBotCommands } = require('../handlers');

class BotManager {
    constructor() {
        this.botsFile = path.join(__dirname, '../../data/bots.json');
        this.runningBots = new Map();
    }

    loadBotsData() {
        if (!fs.existsSync(this.botsFile)) {
            return { bots: [] };
        }
        return JSON.parse(fs.readFileSync(this.botsFile, 'utf8'));
    }

    saveBotsData(data) {
        fs.writeFileSync(this.botsFile, JSON.stringify(data, null, 2));
    }

    getBots() {
        return this.loadBotsData().bots;
    }

    async addBot(token, violetConfig = null, adminUsername = null, expiresAt = null) {
        try {
            const tempBot = new Telegraf(token);
            const info = await tempBot.telegram.getMe();

            const data = this.loadBotsData();
            const exists = data.bots.find(b => b.id === info.id.toString());

            if (exists) {
                return { success: false, error: 'Bot sudah terdaftar' };
            }

            const newBot = {
                id: info.id.toString(),
                username: info.username,
                token: token,
                addedAt: new Date().toISOString()
            };

            if (adminUsername) {
                newBot.adminUsername = adminUsername;
            }

            if (violetConfig) {
                newBot.violetpay = violetConfig;
            }

            if (expiresAt) {
                newBot.expiresAt = expiresAt;
            }

            data.bots.push(newBot);

            this.saveBotsData(data);

            // Initialize database with stats for new bot
            const Database = require('../database/Database');
            const db = new Database(info.id.toString());
            db.write('stats.json', {
                totalSales: 0,
                totalOmzet: 0,
                rating: { total: 0, count: 0 }
            });

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
            const data = this.loadBotsData();
            const index = data.bots.findIndex(b => b.id === botId);

            if (index === -1) {
                return { success: false, error: 'Bot tidak ditemukan' };
            }

            if (this.runningBots.has(botId)) {
                await this.runningBots.get(botId).stop();
                this.runningBots.delete(botId);
            }

            data.bots.splice(index, 1);
            this.saveBotsData(data);

            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async startAllBots() {
        const data = this.loadBotsData();
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
        const Database = require('../database/Database');
        const db = new Database('main');
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
            const data = this.loadBotsData();
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

                        const Database = require('../database/Database');
                        const db = new Database(botData.id);
                        const members = db.read('members.json') || [];

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
