const BotManager = require('./src/bot/BotManager');

const MAIN_BOT_TOKEN = '8311880007:AAFFcyzKig_3AvmSmeoOd7VaeXzyYZN-k7M';

const botManager = new BotManager();

async function main() {
    console.log('🚀MEMULAI MULTI BOT - VIOLET MEDIA \n');

    try {
        await botManager.startAllBots();
        console.log(`✅ MEMUAT ${botManager.runningBots.size} BOT YANG TERDAFTAR\n`);

        await new Promise(resolve => setTimeout(resolve, 2000));

        const mainBot = botManager.createMainBot(MAIN_BOT_TOKEN);
        mainBot.launch({ dropPendingUpdates: true });

        await new Promise(r => setTimeout(r, 2000));
        const info = await mainBot.telegram.getMe();
        console.log(`✅ BOT UTAMA @${info.username} BERHASIL DI JALANKAN BOS\n`);

        botManager.startExpirationMonitor();
        console.log(`🔄 MENGECEK BOT EXPIRED SETIAP 30 DETIK\n`);

        process.once('SIGINT', async () => {
            console.log('\n🛑 Shutting down...');
            mainBot.stop('SIGINT');
            await botManager.stopAllBots();
            process.exit(0);
        });

        process.once('SIGTERM', async () => {
            console.log('\n🛑 Shutting down...');
            mainBot.stop('SIGTERM');
            await botManager.stopAllBots();
            process.exit(0);
        });

    } catch (error) {
        console.error('❌ Failed to start:', error.message);
        process.exit(1);
    }
}

main();
