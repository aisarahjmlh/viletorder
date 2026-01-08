-- =====================================================
-- VIOLET MULTI-BOT TELEGRAM - DATABASE SETUP
-- Run this SQL in phpMyAdmin or MySQL CLI
-- =====================================================

-- Create database (run if database doesn't exist)
-- CREATE DATABASE violet CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- USE violet;

-- =====================================================
-- TABLE: owner_config
-- =====================================================
CREATE TABLE IF NOT EXISTS owner_config (
    id INT AUTO_INCREMENT PRIMARY KEY,
    owner_id VARCHAR(50) NOT NULL,
    rental_price INT DEFAULT 50000,
    violetpay_api_key VARCHAR(100),
    violetpay_secret_key VARCHAR(100),
    violetpay_is_production BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- TABLE: bots
-- =====================================================
CREATE TABLE IF NOT EXISTS bots (
    id VARCHAR(50) PRIMARY KEY,
    username VARCHAR(100),
    token TEXT NOT NULL,
    admin_username VARCHAR(255),
    violetpay_api_key VARCHAR(100),
    violetpay_secret_key VARCHAR(100),
    violetpay_is_production BOOLEAN DEFAULT TRUE,
    expires_at DATETIME,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- TABLE: bot_settings (Format Kolom)
-- =====================================================
CREATE TABLE IF NOT EXISTS bot_settings (
    bot_id VARCHAR(50) PRIMARY KEY,
    admin_username VARCHAR(100),
    welcome_text TEXT,
    photo VARCHAR(500),
    video VARCHAR(500),
    channel_payment VARCHAR(100) DEFAULT 'qris',
    auto_backup TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- =====================================================
-- TABLE: members
-- =====================================================
CREATE TABLE IF NOT EXISTS members (
    id INT AUTO_INCREMENT PRIMARY KEY,
    bot_id VARCHAR(50) NOT NULL,
    user_id BIGINT NOT NULL,
    username VARCHAR(100),
    saldo INT DEFAULT 0,
    total_orders INT DEFAULT 0,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_member (bot_id, user_id),
    INDEX idx_bot_id (bot_id)
);

-- =====================================================
-- TABLE: categories
-- =====================================================
CREATE TABLE IF NOT EXISTS categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    bot_id VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_category (bot_id, name),
    INDEX idx_bot_id (bot_id)
);

-- =====================================================
-- TABLE: products
-- =====================================================
CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    bot_id VARCHAR(50) NOT NULL,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price INT NOT NULL,
    category_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_product (bot_id, code),
    INDEX idx_bot_id (bot_id),
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

-- =====================================================
-- TABLE: product_stock
-- =====================================================
CREATE TABLE IF NOT EXISTS product_stock (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    item TEXT NOT NULL,
    is_sold BOOLEAN DEFAULT FALSE,
    sold_at TIMESTAMP NULL,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_product_id (product_id),
    INDEX idx_is_sold (is_sold),
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- =====================================================
-- TABLE: pending_orders
-- =====================================================
CREATE TABLE IF NOT EXISTS pending_orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    bot_id VARCHAR(50) NOT NULL,
    ref_kode VARCHAR(100) NOT NULL,
    ref_id VARCHAR(100),
    user_id BIGINT NOT NULL,
    order_type VARCHAR(20) DEFAULT 'purchase',
    product_code VARCHAR(50),
    qty INT DEFAULT 1,
    total INT NOT NULL,
    message_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_order (bot_id, ref_kode),
    INDEX idx_bot_id (bot_id)
);

-- =====================================================
-- TABLE: stats
-- =====================================================
CREATE TABLE IF NOT EXISTS stats (
    id INT AUTO_INCREMENT PRIMARY KEY,
    bot_id VARCHAR(50) NOT NULL UNIQUE,
    total_sales INT DEFAULT 0,
    total_omzet BIGINT DEFAULT 0,
    rating_total DECIMAL(3,2) DEFAULT 0,
    rating_count INT DEFAULT 0
);

-- =====================================================
-- INSERT OWNER CONFIG
-- =====================================================
INSERT INTO owner_config (owner_id, rental_price, violetpay_api_key, violetpay_secret_key, violetpay_is_production)
VALUES ('7174723483', 1000, 'tCgyfDHb4nZvms2apP83AALl17jzukB', 'LprBjbux9qA2aCovJfk7c8sl6A4HPZtgdyieh1wSD5n3L0zm', TRUE)
ON DUPLICATE KEY UPDATE 
    owner_id = VALUES(owner_id),
    rental_price = VALUES(rental_price),
    violetpay_api_key = VALUES(violetpay_api_key),
    violetpay_secret_key = VALUES(violetpay_secret_key),
    violetpay_is_production = VALUES(violetpay_is_production);
