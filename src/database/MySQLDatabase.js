const pool = require('./db');

class MySQLDatabase {
    constructor(botId) {
        this.botId = botId;
    }

    // ==================== SETTINGS ====================
    // Mapping dari key lama (camelCase) ke kolom baru (snake_case)
    _keyToColumn(key) {
        const map = {
            'adminUsername': 'admin_username',
            'welcomeText': 'welcome_text',
            'photo': 'photo',
            'video': 'video',
            'channelPayment': 'channel_payment',
            'autoBackup': 'auto_backup'
        };
        return map[key] || key;
    }

    _columnToKey(column) {
        const map = {
            'admin_username': 'adminUsername',
            'welcome_text': 'welcomeText',
            'photo': 'photo',
            'video': 'video',
            'channel_payment': 'channelPayment',
            'auto_backup': 'autoBackup'
        };
        return map[column] || column;
    }

    async getSettings() {
        const [rows] = await pool.query(
            'SELECT admin_username, welcome_text, photo, video, channel_payment, auto_backup FROM bot_settings WHERE bot_id = ?',
            [this.botId]
        );
        if (rows.length === 0) return {};

        const row = rows[0];
        const settings = {};
        if (row.admin_username) settings.adminUsername = row.admin_username;
        if (row.welcome_text) settings.welcomeText = row.welcome_text;
        if (row.photo) settings.photo = row.photo;
        if (row.video) settings.video = row.video;
        if (row.channel_payment) settings.channelPayment = row.channel_payment;
        if (row.auto_backup) settings.autoBackup = row.auto_backup;
        return settings;
    }

    async getSetting(key) {
        const column = this._keyToColumn(key);
        const validColumns = ['admin_username', 'welcome_text', 'photo', 'video', 'channel_payment', 'auto_backup'];
        if (!validColumns.includes(column)) return null;

        const [rows] = await pool.query(
            `SELECT ${column} FROM bot_settings WHERE bot_id = ?`,
            [this.botId]
        );
        if (rows.length === 0) return null;
        return rows[0][column];
    }

    async setSetting(key, value) {
        const column = this._keyToColumn(key);
        const validColumns = ['admin_username', 'welcome_text', 'photo', 'video', 'channel_payment', 'auto_backup'];
        if (!validColumns.includes(column)) {
            console.warn(`[MySQLDatabase] Unknown setting key: ${key}`);
            return;
        }

        // Ensure row exists first
        await pool.query(
            'INSERT IGNORE INTO bot_settings (bot_id) VALUES (?)',
            [this.botId]
        );

        // Update the specific column
        await pool.query(
            `UPDATE bot_settings SET ${column} = ? WHERE bot_id = ?`,
            [value, this.botId]
        );
    }

    // ==================== MEMBERS ====================
    async getMembers() {
        const [rows] = await pool.query(
            'SELECT user_id as userId, username, saldo, total_orders as totalOrders, joined_at as joinedAt, last_seen as lastSeen FROM members WHERE bot_id = ?',
            [this.botId]
        );
        return rows;
    }

    async addMember(userId, username) {
        await pool.query(
            `INSERT INTO members (bot_id, user_id, username, joined_at, last_seen) 
             VALUES (?, ?, ?, NOW(), NOW()) 
             ON DUPLICATE KEY UPDATE username = ?, last_seen = NOW()`,
            [this.botId, userId, username, username]
        );
    }

    async isMember(userId) {
        const [rows] = await pool.query(
            'SELECT 1 FROM members WHERE bot_id = ? AND user_id = ?',
            [this.botId, userId]
        );
        return rows.length > 0;
    }

    async getMemberSaldo(userId) {
        const [rows] = await pool.query(
            'SELECT saldo FROM members WHERE bot_id = ? AND user_id = ?',
            [this.botId, userId]
        );
        return rows.length > 0 ? rows[0].saldo : 0;
    }

    async updateMemberSaldo(userId, amount) {
        await pool.query(
            'UPDATE members SET saldo = saldo + ? WHERE bot_id = ? AND user_id = ?',
            [amount, this.botId, userId]
        );
        const [rows] = await pool.query(
            'SELECT saldo FROM members WHERE bot_id = ? AND user_id = ?',
            [this.botId, userId]
        );
        return rows.length > 0 ? rows[0].saldo : 0;
    }

    async incrementMemberOrder(userId) {
        await pool.query(
            'UPDATE members SET total_orders = total_orders + 1 WHERE bot_id = ? AND user_id = ?',
            [this.botId, userId]
        );
        const [rows] = await pool.query(
            'SELECT total_orders FROM members WHERE bot_id = ? AND user_id = ?',
            [this.botId, userId]
        );
        return rows.length > 0 ? rows[0].total_orders : 0;
    }

    async getMemberOrderCount(userId) {
        const [rows] = await pool.query(
            'SELECT total_orders FROM members WHERE bot_id = ? AND user_id = ?',
            [this.botId, userId]
        );
        return rows.length > 0 ? rows[0].total_orders : 0;
    }

    // ==================== STATS ====================
    async getStats() {
        const [rows] = await pool.query(
            'SELECT total_sales as totalSales, total_omzet as totalOmzet, rating_total, rating_count FROM stats WHERE bot_id = ?',
            [this.botId]
        );
        if (rows.length === 0) {
            return { totalSales: 0, totalOmzet: 0, rating: { total: 0, count: 0 } };
        }
        return {
            totalSales: rows[0].totalSales || 0,
            totalOmzet: rows[0].totalOmzet || 0,
            rating: {
                total: parseFloat(rows[0].rating_total) || 0,
                count: rows[0].rating_count || 0
            }
        };
    }

    async updateStats(salesCount, omzetAmount) {
        await pool.query(
            `INSERT INTO stats (bot_id, total_sales, total_omzet) 
             VALUES (?, ?, ?) 
             ON DUPLICATE KEY UPDATE total_sales = total_sales + ?, total_omzet = total_omzet + ?`,
            [this.botId, salesCount, omzetAmount, salesCount, omzetAmount]
        );
        return this.getStats();
    }

    async setRating(rating, count) {
        await pool.query(
            `INSERT INTO stats (bot_id, rating_total, rating_count) 
             VALUES (?, ?, ?) 
             ON DUPLICATE KEY UPDATE rating_total = ?, rating_count = ?`,
            [this.botId, rating, count, rating, count]
        );
        return this.getStats();
    }

    // ==================== CATEGORIES ====================
    async getCategories() {
        const [rows] = await pool.query(
            'SELECT id, name, created_at as createdAt FROM categories WHERE bot_id = ? ORDER BY id',
            [this.botId]
        );
        return rows.map(r => r.name);
    }

    async addCategory(name) {
        try {
            await pool.query(
                'INSERT INTO categories (bot_id, name) VALUES (?, ?)',
                [this.botId, name]
            );
            return true;
        } catch (e) {
            if (e.code === 'ER_DUP_ENTRY') return false;
            throw e;
        }
    }

    async removeCategory(name) {
        const [result] = await pool.query(
            'DELETE FROM categories WHERE bot_id = ? AND name = ?',
            [this.botId, name]
        );
        return result.affectedRows > 0;
    }

    async getCategoryId(name) {
        const [rows] = await pool.query(
            'SELECT id FROM categories WHERE bot_id = ? AND name = ?',
            [this.botId, name]
        );
        return rows.length > 0 ? rows[0].id : null;
    }

    // ==================== PRODUCTS ====================
    async getProducts() {
        const [rows] = await pool.query(
            `SELECT p.id, p.code, p.name, p.description, p.price, c.name as category,
             (SELECT COUNT(*) FROM product_stock ps WHERE ps.product_id = p.id AND ps.is_sold = FALSE) as stockCount
             FROM products p 
             LEFT JOIN categories c ON p.category_id = c.id
             WHERE p.bot_id = ?`,
            [this.botId]
        );

        // Get stock for each product
        const products = [];
        for (const row of rows) {
            const [stockRows] = await pool.query(
                'SELECT item FROM product_stock WHERE product_id = ? AND is_sold = FALSE',
                [row.id]
            );
            products.push({
                code: row.code,
                name: row.name,
                description: row.description,
                price: row.price,
                category: row.category,
                stock: stockRows.map(s => s.item)
            });
        }
        return products;
    }

    async getProduct(code) {
        const [rows] = await pool.query(
            `SELECT p.id, p.code, p.name, p.description, p.price, c.name as category
             FROM products p 
             LEFT JOIN categories c ON p.category_id = c.id
             WHERE p.bot_id = ? AND p.code = ?`,
            [this.botId, code]
        );
        if (rows.length === 0) return null;

        const [stockRows] = await pool.query(
            'SELECT item FROM product_stock WHERE product_id = ? AND is_sold = FALSE',
            [rows[0].id]
        );
        return {
            code: rows[0].code,
            name: rows[0].name,
            description: rows[0].description,
            price: rows[0].price,
            category: rows[0].category,
            stock: stockRows.map(s => s.item)
        };
    }

    async addProduct(product) {
        const categoryId = product.category ? await this.getCategoryId(product.category) : null;
        try {
            const [result] = await pool.query(
                'INSERT INTO products (bot_id, code, name, description, price, category_id) VALUES (?, ?, ?, ?, ?, ?)',
                [this.botId, product.code, product.name, product.description || '', product.price, categoryId]
            );

            // Add initial stock if provided
            if (product.stock && product.stock.length > 0) {
                for (const item of product.stock) {
                    await pool.query(
                        'INSERT INTO product_stock (product_id, item) VALUES (?, ?)',
                        [result.insertId, item]
                    );
                }
            }
            return true;
        } catch (e) {
            if (e.code === 'ER_DUP_ENTRY') return false;
            throw e;
        }
    }

    async removeProduct(code) {
        const [result] = await pool.query(
            'DELETE FROM products WHERE bot_id = ? AND code = ?',
            [this.botId, code]
        );
        return result.affectedRows > 0;
    }

    async getProductId(code) {
        const [rows] = await pool.query(
            'SELECT id FROM products WHERE bot_id = ? AND code = ?',
            [this.botId, code]
        );
        return rows.length > 0 ? rows[0].id : null;
    }

    async addStock(code, items) {
        const productId = await this.getProductId(code);
        if (!productId) return false;

        for (const item of items) {
            await pool.query(
                'INSERT INTO product_stock (product_id, item) VALUES (?, ?)',
                [productId, item]
            );
        }
        return true;
    }

    async removeStock(code, count = 1) {
        const productId = await this.getProductId(code);
        if (!productId) return [];

        const [rows] = await pool.query(
            'SELECT id, item FROM product_stock WHERE product_id = ? AND is_sold = FALSE LIMIT ?',
            [productId, count]
        );

        if (rows.length === 0) return [];

        const ids = rows.map(r => r.id);
        await pool.query(
            'UPDATE product_stock SET is_sold = TRUE, sold_at = NOW() WHERE id IN (?)',
            [ids]
        );

        return rows.map(r => r.item);
    }

    async getStockCount(code) {
        const productId = await this.getProductId(code);
        if (!productId) return 0;

        const [rows] = await pool.query(
            'SELECT COUNT(*) as count FROM product_stock WHERE product_id = ? AND is_sold = FALSE',
            [productId]
        );
        return rows[0].count;
    }

    async deleteStock(code, count = 1) {
        const productId = await this.getProductId(code);
        if (!productId) return 0;

        const [rows] = await pool.query(
            'SELECT id FROM product_stock WHERE product_id = ? AND is_sold = FALSE LIMIT ?',
            [productId, count]
        );

        if (rows.length === 0) return 0;

        const ids = rows.map(r => r.id);
        const [result] = await pool.query(
            'DELETE FROM product_stock WHERE id IN (?)',
            [ids]
        );

        return result.affectedRows;
    }

    // ==================== PENDING ORDERS ====================
    async getPendingOrders() {
        const [rows] = await pool.query(
            `SELECT ref_kode as refKode, ref_id as refId, user_id as userId, 
             order_type as type, product_code as productCode, qty, total, 
             message_id as messageId, created_at as createdAt
             FROM pending_orders WHERE bot_id = ?`,
            [this.botId]
        );
        return rows;
    }

    async addPendingOrder(order) {
        await pool.query(
            `INSERT INTO pending_orders (bot_id, ref_kode, ref_id, user_id, order_type, product_code, qty, total, message_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [this.botId, order.refKode, order.refId, order.userId, order.type, order.productCode || null, order.qty || 1, order.total, order.messageId || null]
        );
    }

    async getPendingOrder(refKode) {
        const [rows] = await pool.query(
            `SELECT ref_kode as refKode, ref_id as refId, user_id as userId, 
             order_type as type, product_code as productCode, qty, total, 
             message_id as messageId, created_at as createdAt
             FROM pending_orders WHERE bot_id = ? AND ref_kode = ?`,
            [this.botId, refKode]
        );
        return rows.length > 0 ? rows[0] : null;
    }

    async removePendingOrder(refKode) {
        const [result] = await pool.query(
            'DELETE FROM pending_orders WHERE bot_id = ? AND ref_kode = ?',
            [this.botId, refKode]
        );
        return result.affectedRows > 0;
    }

    // ==================== LEGACY COMPATIBILITY ====================
    // These methods provide backward compatibility with old JSON-based code

    read(fileName) {
        // Sync wrapper - returns empty array, should use async methods instead
        console.warn(`[MySQLDatabase] Sync read() called for ${fileName} - use async methods instead`);
        return [];
    }

    write(fileName, data) {
        // Sync wrapper - does nothing, should use async methods instead
        console.warn(`[MySQLDatabase] Sync write() called for ${fileName} - use async methods instead`);
    }

    // Sync versions for backward compatibility during migration
    getSettingsSync() {
        return {};
    }

    getSettingSync(key) {
        return null;
    }
}

module.exports = MySQLDatabase;
