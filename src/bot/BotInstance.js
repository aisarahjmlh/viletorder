const { Telegraf } = require('telegraf');
const Database = require('../database/Database');
const { registerStart } = require('../handlers');
const { registerAdminHandlers } = require('../handlers/admin');
const { registerMemberHandlers } = require('../handlers/member');
const { isMember } = require('../middleware/roleCheck');

class BotInstance {
    constructor(token, botManager) {
        this.token = token;
        this.botId = token.split(':')[0];
        this.botManager = botManager;
        this.bot = new Telegraf(token);
        this.db = new Database(this.botId);
        this.isRunning = false;
        this.config = this.loadBotConfig();
    }

    loadBotConfig() {
        const data = this.botManager.loadBotsData();
        return data.bots.find(b => b.id === this.botId) || {};
    }

    registerHandlers() {
        this.bot.use(isMember(this.db));
        registerStart(this.bot, this.db, this.config);
        registerAdminHandlers(this.bot, this.db);
        registerMemberHandlers(this.bot, this.db);

        this.bot.catch((err, ctx) => {
            console.error(`[Bot ${this.botId}] Error:`, err.message);
        });
    }

    async start() {
        if (this.isRunning) return;

        try {
            // Sync adminUsername from bots.json config to settings.json
            if (this.config.adminUsername) {
                this.db.setSetting('adminUsername', this.config.adminUsername);
            }

            this.registerHandlers();
            this.bot.launch({ dropPendingUpdates: true });
            await new Promise(r => setTimeout(r, 2000));

            const info = await this.bot.telegram.getMe();
            if (info) {
                this.isRunning = true;
                console.log(`[Bot ${this.botId}] @${info.username} started`);
            }
        } catch (error) {
            console.error(`[Bot ${this.botId}] Failed:`, error.message);
        }
    }

    async stop() {
        if (!this.isRunning) return;
        try {
            this.bot.stop('SIGTERM');
            this.isRunning = false;
        } catch (error) { }
    }

    async getInfo() {
        try {
            return await this.bot.telegram.getMe();
        } catch (error) {
            return null;
        }
    }
}

module.exports = BotInstance;
