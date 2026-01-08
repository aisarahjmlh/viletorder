/**
 * Migrasi bot_settings dari format key-value ke format kolom
 */
const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrate() {
    const pool = await mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'violet',
        port: process.env.DB_PORT || 3306,
        multipleStatements: true
    });

    try {
        console.log('='.repeat(50));
        console.log('   MIGRASI: bot_settings ke format kolom');
        console.log('='.repeat(50));

        // 1. Buat tabel baru
        console.log('\n[1/4] Membuat tabel baru...');
        await pool.query(`
            DROP TABLE IF EXISTS bot_settings_new;
            CREATE TABLE bot_settings_new (
                bot_id VARCHAR(50) PRIMARY KEY,
                admin_username VARCHAR(100) DEFAULT NULL,
                welcome_text TEXT DEFAULT NULL,
                photo VARCHAR(500) DEFAULT NULL,
                video VARCHAR(500) DEFAULT NULL,
                channel_payment VARCHAR(100) DEFAULT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            );
        `);
        console.log('      ✓ Tabel bot_settings_new dibuat');

        // 2. Ambil data lama
        console.log('[2/4] Mengambil data lama...');
        const [oldData] = await pool.query('SELECT * FROM bot_settings');
        console.log(`      ✓ Ditemukan ${oldData.length} records`);

        // 3. Grup data per bot_id
        console.log('[3/4] Migrasi data...');
        const grouped = {};
        for (const row of oldData) {
            if (!grouped[row.bot_id]) grouped[row.bot_id] = {};
            grouped[row.bot_id][row.setting_key] = row.setting_value;
        }

        for (const [botId, settings] of Object.entries(grouped)) {
            await pool.query(
                `INSERT INTO bot_settings_new (bot_id, admin_username, welcome_text, photo, channel_payment) 
                 VALUES (?, ?, ?, ?, ?)`,
                [
                    botId,
                    settings.adminUsername || null,
                    settings.welcomeText || null,
                    settings.photo || null,
                    settings.channelPayment || null
                ]
            );
            console.log(`      ✓ Bot ${botId} migrated`);
        }

        // 4. Ganti tabel
        console.log('[4/4] Mengganti tabel...');
        await pool.query(`
            DROP TABLE bot_settings;
            ALTER TABLE bot_settings_new RENAME TO bot_settings;
        `);
        console.log('      ✓ Tabel diganti');

        // Tampilkan hasil
        console.log('\n' + '='.repeat(50));
        console.log('   HASIL MIGRASI');
        console.log('='.repeat(50));
        const [result] = await pool.query('SELECT * FROM bot_settings');
        console.table(result);

        console.log('\n✅ Migrasi selesai!');

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await pool.end();
    }
}

migrate();
