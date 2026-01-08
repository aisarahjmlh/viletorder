/**
 * Migration Script: JSON to MySQL
 * Run: node scripts/migrate.js
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

const DATA_DIR = path.join(__dirname, '../data');
const CONFIG_DIR = path.join(__dirname, '../config');

async function migrate() {
    console.log('='.repeat(50));
    console.log('   MIGRATION: JSON to MySQL');
    console.log('='.repeat(50));

    // Create connection
    const pool = await mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'violet',
        port: process.env.DB_PORT || 3306,
        multipleStatements: true
    });

    console.log('\n[1/7] Connected to MySQL');

    try {
        // Run setup SQL
        console.log('[2/7] Creating tables...');
        const setupSql = fs.readFileSync(path.join(__dirname, 'setup-db.sql'), 'utf8');
        await pool.query(setupSql);
        console.log('      ✓ Tables created');

        // Migrate owner config
        console.log('[3/7] Migrating owner config...');
        const ownerConfigPath = path.join(CONFIG_DIR, 'owner.json');
        if (fs.existsSync(ownerConfigPath)) {
            const ownerConfig = JSON.parse(fs.readFileSync(ownerConfigPath, 'utf8'));
            await pool.query(
                `INSERT INTO owner_config (owner_id, rental_price, violetpay_api_key, violetpay_secret_key, violetpay_is_production)
                 VALUES (?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE 
                 rental_price = VALUES(rental_price),
                 violetpay_api_key = VALUES(violetpay_api_key),
                 violetpay_secret_key = VALUES(violetpay_secret_key),
                 violetpay_is_production = VALUES(violetpay_is_production)`,
                [
                    ownerConfig.ownerId,
                    ownerConfig.rentalPrice || 50000,
                    ownerConfig.ownerVioletpay?.apiKey || null,
                    ownerConfig.ownerVioletpay?.secretKey || null,
                    ownerConfig.ownerVioletpay?.isProduction ?? true
                ]
            );
            console.log('      ✓ Owner config migrated');
        } else {
            console.log('      ⚠ No owner.json found');
        }

        // Migrate bots
        console.log('[4/7] Migrating bots...');
        const botsPath = path.join(DATA_DIR, 'bots.json');
        if (fs.existsSync(botsPath)) {
            const botsData = JSON.parse(fs.readFileSync(botsPath, 'utf8'));
            for (const bot of botsData.bots || []) {
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
                        bot.id,
                        bot.username,
                        bot.token,
                        bot.adminUsername || null,
                        bot.violetpay?.apiKey || null,
                        bot.violetpay?.secretKey || null,
                        bot.violetpay?.isProduction ?? true,
                        bot.expiresAt ? new Date(bot.expiresAt) : null,
                        bot.addedAt ? new Date(bot.addedAt) : new Date()
                    ]
                );
                console.log(`      ✓ Bot ${bot.id} (@${bot.username}) migrated`);
            }
        }
        console.log('      ✓ Bots migration complete');

        // Migrate bot data folders
        console.log('[5/7] Migrating bot data...');
        const botFolders = fs.readdirSync(DATA_DIR).filter(f => f.startsWith('bot_'));

        for (const folder of botFolders) {
            const botId = folder.replace('bot_', '');
            const botDir = path.join(DATA_DIR, folder);
            console.log(`      Processing ${folder}...`);

            // Ensure bot exists in bots table
            await pool.query(
                `INSERT IGNORE INTO bots (id, username, token, added_at) VALUES (?, ?, ?, NOW())`,
                [botId, botId === 'main' ? 'MainBot' : `Bot_${botId}`, botId === 'main' ? 'main_token' : 'unknown']
            );

            // Migrate settings
            const settingsPath = path.join(botDir, 'settings.json');
            if (fs.existsSync(settingsPath)) {
                const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
                for (const [key, value] of Object.entries(settings)) {
                    const strValue = typeof value === 'string' ? value : JSON.stringify(value);
                    await pool.query(
                        `INSERT INTO bot_settings (bot_id, setting_key, setting_value)
                         VALUES (?, ?, ?)
                         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
                        [botId, key, strValue]
                    );
                }
                console.log(`         ✓ Settings migrated`);
            }

            // Migrate members
            const membersPath = path.join(botDir, 'members.json');
            if (fs.existsSync(membersPath)) {
                const members = JSON.parse(fs.readFileSync(membersPath, 'utf8'));
                for (const member of members) {
                    await pool.query(
                        `INSERT INTO members (bot_id, user_id, username, saldo, total_orders, joined_at, last_seen)
                         VALUES (?, ?, ?, ?, ?, ?, ?)
                         ON DUPLICATE KEY UPDATE
                         username = VALUES(username),
                         saldo = VALUES(saldo),
                         total_orders = VALUES(total_orders),
                         last_seen = VALUES(last_seen)`,
                        [
                            botId,
                            member.userId,
                            member.username || null,
                            member.saldo || 0,
                            member.totalOrders || 0,
                            member.joinedAt ? new Date(member.joinedAt) : new Date(),
                            member.lastSeen ? new Date(member.lastSeen) : new Date()
                        ]
                    );
                }
                console.log(`         ✓ ${members.length} members migrated`);
            }

            // Migrate stats
            const statsPath = path.join(botDir, 'stats.json');
            if (fs.existsSync(statsPath)) {
                const stats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
                await pool.query(
                    `INSERT INTO stats (bot_id, total_sales, total_omzet, rating_total, rating_count)
                     VALUES (?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE
                     total_sales = VALUES(total_sales),
                     total_omzet = VALUES(total_omzet),
                     rating_total = VALUES(rating_total),
                     rating_count = VALUES(rating_count)`,
                    [
                        botId,
                        stats.totalSales || 0,
                        stats.totalOmzet || 0,
                        stats.rating?.total || 0,
                        stats.rating?.count || 0
                    ]
                );
                console.log(`         ✓ Stats migrated`);
            }

            // Migrate categories
            const categoriesPath = path.join(botDir, 'categories.json');
            if (fs.existsSync(categoriesPath)) {
                const categories = JSON.parse(fs.readFileSync(categoriesPath, 'utf8'));
                for (const cat of categories) {
                    await pool.query(
                        `INSERT IGNORE INTO categories (bot_id, name) VALUES (?, ?)`,
                        [botId, cat]
                    );
                }
                console.log(`         ✓ ${categories.length} categories migrated`);
            }

            // Migrate products
            const productsPath = path.join(botDir, 'products.json');
            if (fs.existsSync(productsPath)) {
                const products = JSON.parse(fs.readFileSync(productsPath, 'utf8'));
                for (const product of products) {
                    // Get category ID
                    let categoryId = null;
                    if (product.category) {
                        const [cats] = await pool.query(
                            'SELECT id FROM categories WHERE bot_id = ? AND name = ?',
                            [botId, product.category]
                        );
                        if (cats.length > 0) categoryId = cats[0].id;
                    }

                    // Insert product
                    const [result] = await pool.query(
                        `INSERT INTO products (bot_id, code, name, description, price, category_id)
                         VALUES (?, ?, ?, ?, ?, ?)
                         ON DUPLICATE KEY UPDATE
                         name = VALUES(name),
                         description = VALUES(description),
                         price = VALUES(price),
                         category_id = VALUES(category_id)`,
                        [botId, product.code, product.name, product.description || '', product.price, categoryId]
                    );

                    // Get product ID for stock
                    const [prods] = await pool.query(
                        'SELECT id FROM products WHERE bot_id = ? AND code = ?',
                        [botId, product.code]
                    );

                    if (prods.length > 0 && product.stock && product.stock.length > 0) {
                        const productId = prods[0].id;
                        // Clear old stock first on migration
                        await pool.query('DELETE FROM product_stock WHERE product_id = ?', [productId]);

                        for (const item of product.stock) {
                            await pool.query(
                                'INSERT INTO product_stock (product_id, item) VALUES (?, ?)',
                                [productId, item]
                            );
                        }
                    }
                }
                console.log(`         ✓ ${products.length} products migrated`);
            }

            // Migrate pending orders
            const ordersPath = path.join(botDir, 'pending_orders.json');
            if (fs.existsSync(ordersPath)) {
                const orders = JSON.parse(fs.readFileSync(ordersPath, 'utf8'));
                for (const order of orders) {
                    await pool.query(
                        `INSERT IGNORE INTO pending_orders (bot_id, ref_kode, ref_id, user_id, order_type, product_code, qty, total, message_id, created_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            botId,
                            order.refKode,
                            order.refId || null,
                            order.userId,
                            order.type || 'purchase',
                            order.productCode || null,
                            order.qty || 1,
                            order.total,
                            order.messageId || null,
                            order.createdAt ? new Date(order.createdAt) : new Date()
                        ]
                    );
                }
                console.log(`         ✓ ${orders.length} pending orders migrated`);
            }
        }

        console.log('[6/7] Verifying migration...');
        const [botCount] = await pool.query('SELECT COUNT(*) as count FROM bots');
        const [memberCount] = await pool.query('SELECT COUNT(*) as count FROM members');
        const [productCount] = await pool.query('SELECT COUNT(*) as count FROM products');
        const [stockCount] = await pool.query('SELECT COUNT(*) as count FROM product_stock');

        console.log(`      Bots: ${botCount[0].count}`);
        console.log(`      Members: ${memberCount[0].count}`);
        console.log(`      Products: ${productCount[0].count}`);
        console.log(`      Stock Items: ${stockCount[0].count}`);

        console.log('[7/7] Migration complete!');
        console.log('\n' + '='.repeat(50));
        console.log('   SUCCESS! All data migrated to MySQL');
        console.log('='.repeat(50));

    } catch (error) {
        console.error('\n❌ Migration failed:', error.message);
        console.error(error.stack);
    } finally {
        await pool.end();
    }
}

migrate();
