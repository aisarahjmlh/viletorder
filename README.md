# 🤖 Violet Multi-Bot Telegram

Bot Telegram multi-instance dengan fitur store, rental, dan integrasi VioletPay.

---

## 📋 Daftar Isi
- [Persyaratan](#-persyaratan)
- [Setup di XAMPP (Windows)](#-setup-di-xampp-windows)
- [Setup di VPS (Ubuntu/Debian)](#-setup-di-vps-ubuntudebian)
- [Konfigurasi](#-konfigurasi)
- [Menjalankan Bot](#-menjalankan-bot)
- [Command Bot](#-command-bot)

---

## 📦 Persyaratan

| Software | Versi |
|----------|-------|
| Node.js | >= 18.x |
| MySQL/MariaDB | >= 5.7 / 10.x |
| npm | >= 9.x |

---

## 🖥️ Setup di XAMPP (Windows)

### 1. Install Node.js
1. Download dari [nodejs.org](https://nodejs.org/)
2. Install dengan setting default
3. Buka Command Prompt, cek dengan: `node -v` dan `npm -v`

### 2. Persiapan XAMPP
1. Buka **XAMPP Control Panel**
2. Start **Apache** dan **MySQL**
3. Buka **phpMyAdmin** di `http://localhost/phpmyadmin`

### 3. Buat Database
```sql
CREATE DATABASE violet CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 4. Import Struktur Tabel
1. Di phpMyAdmin, pilih database `violet`
2. Klik tab **SQL**
3. Jalankan query berikut:

```sql
-- Owner Config
CREATE TABLE owner_config (
    id INT AUTO_INCREMENT PRIMARY KEY,
    owner_id VARCHAR(50) NOT NULL,
    rental_price INT DEFAULT 50000,
    violetpay_api_key VARCHAR(100),
    violetpay_secret_key VARCHAR(100),
    violetpay_is_production BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bots
CREATE TABLE bots (
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

-- Bot Settings
CREATE TABLE bot_settings (
    bot_id VARCHAR(50) PRIMARY KEY,
    admin_username VARCHAR(100),
    welcome_text TEXT,
    photo VARCHAR(500),
    video VARCHAR(500),
    channel_payment VARCHAR(100),
    auto_backup TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Members
CREATE TABLE members (
    id INT AUTO_INCREMENT PRIMARY KEY,
    bot_id VARCHAR(50) NOT NULL,
    user_id BIGINT NOT NULL,
    username VARCHAR(100),
    saldo INT DEFAULT 0,
    total_orders INT DEFAULT 0,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_member (bot_id, user_id)
);

-- Categories
CREATE TABLE categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    bot_id VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_category (bot_id, name)
);

-- Products
CREATE TABLE products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    bot_id VARCHAR(50) NOT NULL,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price INT NOT NULL,
    category_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_product (bot_id, code),
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

-- Product Stock
CREATE TABLE product_stock (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    item TEXT NOT NULL,
    is_sold BOOLEAN DEFAULT FALSE,
    sold_at TIMESTAMP NULL,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- Pending Orders
CREATE TABLE pending_orders (
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
    UNIQUE KEY unique_order (bot_id, ref_kode)
);

-- Stats
CREATE TABLE stats (
    id INT AUTO_INCREMENT PRIMARY KEY,
    bot_id VARCHAR(50) NOT NULL UNIQUE,
    total_sales INT DEFAULT 0,
    total_omzet BIGINT DEFAULT 0,
    rating_total DECIMAL(3,2) DEFAULT 0,
    rating_count INT DEFAULT 0
);
```

### 5. Konfigurasi Environment
1. Buat file `.env` di folder project:

```env
# Bot Token (dari @BotFather)
BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz

# MySQL Configuration
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=violet
DB_PORT=3306
```

### 6. Install Dependencies & Jalankan
```bash
cd C:\path\to\violet1
npm install
npm start
```

---

## 🐧 Setup di VPS (Ubuntu/Debian)

### 1. Update Sistem
```bash
sudo apt update && sudo apt upgrade -y
```

### 2. Install Node.js
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

Verifikasi:
```bash
node -v
npm -v
```

### 3. Install MySQL/MariaDB
```bash
sudo apt install -y mariadb-server
sudo systemctl start mariadb
sudo systemctl enable mariadb
sudo mysql_secure_installation
```

### 4. Buat Database & User
```bash
sudo mysql -u root -p
```

```sql
CREATE DATABASE violet CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'violet_user'@'localhost' IDENTIFIED BY 'password_kuat_123';
GRANT ALL PRIVILEGES ON violet.* TO 'violet_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### 5. Import Tabel
```bash
mysql -u violet_user -p violet < scripts/setup-db.sql
```

Atau jalankan SQL dari bagian XAMPP di atas melalui mysql CLI.

### 6. Upload & Setup Project
```bash
# Upload menggunakan SCP/SFTP ke /home/user/violet1
cd /home/user/violet1

# Buat file .env
nano .env
```

Isi `.env`:
```env
BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
DB_HOST=localhost
DB_USER=violet_user
DB_PASSWORD=password_kuat_123
DB_NAME=violet
DB_PORT=3306
```

### 7. Install Dependencies
```bash
npm install
```

### 8. Jalankan dengan PM2 (Recommended)
```bash
# Install PM2
sudo npm install -g pm2

# Start bot
pm2 start index.js --name "violet-bot"

# Auto-start saat reboot
pm2 startup
pm2 save

# Cek status
pm2 status
pm2 logs violet-bot
```

### 9. (Optional) Setup Firewall
```bash
sudo ufw allow ssh
sudo ufw enable
```

---

## ⚙️ Konfigurasi

### Insert Owner Config
Jalankan di folder project:
```bash
node scripts/insert-owner-config.js
```

Atau edit manual di phpMyAdmin/MySQL:
```sql
INSERT INTO owner_config (owner_id, rental_price, violetpay_api_key, violetpay_secret_key, violetpay_is_production)
VALUES ('YOUR_TELEGRAM_ID', 50000, 'YOUR_API_KEY', 'YOUR_SECRET_KEY', TRUE);
```

---

## 🚀 Menjalankan Bot

### Windows (Development)
```bash
npm start
```

### VPS dengan PM2 (Production)
```bash
pm2 start index.js --name "violet-bot"
pm2 restart violet-bot   # Restart
pm2 stop violet-bot      # Stop
pm2 logs violet-bot      # Lihat log
```

---

## 📝 Command Bot

### Owner Commands
| Command | Deskripsi |
|---------|-----------|
| `/addbot` | Tambah bot baru |
| `/delbot` | Hapus bot |
| `/listbot` | Daftar bot |
| `/foto <url>` | Set foto bot |
| `/setprice <nominal>` | Set harga sewa |
| `/addactive <botid> <durasi>` | Perpanjang aktif bot |
| `/checkbalance` | Cek saldo VioletPay |

### Admin Commands
| Command | Deskripsi |
|---------|-----------|
| `/addc <nama>` | Tambah kategori |
| `/delc <nama>` | Hapus kategori |
| `/addprd` | Tambah produk |
| `/delprd <code>` | Hapus produk |
| `/addst <code>` | Tambah stok |
| `/delst <code>` | Hapus stok |
| `/setwelc <teks>` | Set welcome text |
| `/setrating <rating> <jumlah>` | Set rating |
| `/setpg qris/qrisc` | Set payment method |
| `/broadcast <teks>` | Broadcast ke member |
| `/backup` | Backup database |
| `/listuser` | Daftar member |

---

## 🔧 Troubleshooting

### Error: ECONNREFUSED (MySQL)
- Pastikan MySQL sudah running
- Cek kredensial di `.env`

### Error: 409 Conflict (Telegram)
- Bot sudah berjalan di tempat lain
- Stop proses lain yang menjalankan bot

### Error: ETELEGRAM 401 Unauthorized
- Token bot salah
- Buat token baru di @BotFather

---

## 📄 License
MIT License - Violet Media 2026
