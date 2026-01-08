/**
 * Script untuk menambahkan owner config ke database
 */
const mysql = require('mysql2/promise');
require('dotenv').config();

async function insertOwnerConfig() {
    const pool = await mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'violet',
        port: process.env.DB_PORT || 3306
    });

    try {
        await pool.query(
            `INSERT INTO owner_config (owner_id, rental_price, violetpay_api_key, violetpay_secret_key, violetpay_is_production) 
             VALUES (?, ?, ?, ?, ?) 
             ON DUPLICATE KEY UPDATE 
             owner_id = VALUES(owner_id), 
             rental_price = VALUES(rental_price), 
             violetpay_api_key = VALUES(violetpay_api_key), 
             violetpay_secret_key = VALUES(violetpay_secret_key), 
             violetpay_is_production = VALUES(violetpay_is_production)`,
            ['7174723483', 1000, 'tCgyfDHb4nZvms2apP83AALl17jzukB', 'LprBjbux9qA2aCovJfk7c8sl6A4HPZtgdyieh1wSD5n3L0zm', true]
        );

        console.log('✅ Owner config berhasil ditambahkan!');

        const [rows] = await pool.query('SELECT * FROM owner_config');
        console.log('\nData owner_config:');
        console.table(rows);
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await pool.end();
    }
}

insertOwnerConfig();
