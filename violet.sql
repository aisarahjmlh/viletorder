-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Waktu pembuatan: 08 Jan 2026 pada 08.14
-- Versi server: 10.4.32-MariaDB
-- Versi PHP: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `violet`
--

-- --------------------------------------------------------

--
-- Struktur dari tabel `bots`
--

CREATE TABLE `bots` (
  `id` varchar(50) NOT NULL,
  `username` varchar(100) DEFAULT NULL,
  `token` varchar(100) NOT NULL,
  `admin_username` varchar(255) DEFAULT NULL,
  `violetpay_api_key` varchar(255) DEFAULT NULL,
  `violetpay_secret_key` varchar(255) DEFAULT NULL,
  `violetpay_is_production` tinyint(1) DEFAULT 1,
  `expires_at` datetime DEFAULT NULL,
  `added_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data untuk tabel `bots`
--

INSERT INTO `bots` (`id`, `username`, `token`, `admin_username`, `violetpay_api_key`, `violetpay_secret_key`, `violetpay_is_production`, `expires_at`, `added_at`) VALUES
('7836316994', 'igehbot', '7836316994:AAEfVLPPk-lBgcyZJN5QzMwchiKfV7hfoVE\n', 'nuroela', 'tCgyfDHb4nZvms2apP83AALl17jzukB', 'LprBjbux9qA2aCovJfk7c8sl6A4HPZtgdyieh1wSD5n3L0zm', 1, '2026-02-07 11:25:57', '2026-01-08 04:25:57'),
('main', 'MainBot', 'main_token', NULL, NULL, NULL, 1, NULL, '2026-01-08 04:18:10');

-- --------------------------------------------------------

--
-- Struktur dari tabel `bot_settings`
--

CREATE TABLE `bot_settings` (
  `bot_id` varchar(50) NOT NULL,
  `admin_username` varchar(100) DEFAULT NULL,
  `welcome_text` text DEFAULT NULL,
  `photo` varchar(500) DEFAULT NULL,
  `video` varchar(500) DEFAULT NULL,
  `channel_payment` varchar(100) DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `auto_backup` text DEFAULT NULL,
  `tutor_link` varchar(255) DEFAULT NULL,
  `kontak_link` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data untuk tabel `bot_settings`
--

INSERT INTO `bot_settings` (`bot_id`, `admin_username`, `welcome_text`, `photo`, `video`, `channel_payment`, `updated_at`, `auto_backup`, `tutor_link`, `kontak_link`) VALUES
('7836316994', 'nuroela', 'test admin {saldo}', 'https://files.catbox.moe/3uglnl.jpg', NULL, 'qrisc', '2026-01-08 04:48:21', NULL, NULL, NULL);

-- --------------------------------------------------------

--
-- Struktur dari tabel `categories`
--

CREATE TABLE `categories` (
  `id` int(11) NOT NULL,
  `bot_id` varchar(50) NOT NULL,
  `name` varchar(100) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `code` varchar(50) DEFAULT NULL,
  `price` int(11) DEFAULT 0,
  `group_id` varchar(50) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data untuk tabel `categories`
--

INSERT INTO `categories` (`id`, `bot_id`, `name`, `created_at`, `code`, `price`, `group_id`) VALUES
(1, '7836316994', 'NETFLIX', '2026-01-08 04:35:06', NULL, 0, NULL);

-- --------------------------------------------------------

--
-- Struktur dari tabel `members`
--

CREATE TABLE `members` (
  `id` int(11) NOT NULL,
  `bot_id` varchar(50) NOT NULL,
  `user_id` bigint(20) NOT NULL,
  `username` varchar(100) DEFAULT NULL,
  `saldo` int(11) DEFAULT 0,
  `total_orders` int(11) DEFAULT 0,
  `joined_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `last_seen` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data untuk tabel `members`
--

INSERT INTO `members` (`id`, `bot_id`, `user_id`, `username`, `saldo`, `total_orders`, `joined_at`, `last_seen`) VALUES
(1, 'main', 6511470350, 'pejabatnegeriRI', 0, 0, '2026-01-08 04:19:22', '2026-01-08 07:03:01'),
(3, '7836316994', 8005821151, 'nuroela', 0, 0, '2026-01-08 04:28:10', '2026-01-08 05:28:28'),
(4, '7836316994', 6501087981, 'csfastcell', 0, 1, '2026-01-08 04:28:18', '2026-01-08 05:29:02'),
(55, 'main', 6501087981, 'csfastcell', 0, 0, '2026-01-08 04:47:12', '2026-01-08 04:48:00');

-- --------------------------------------------------------

--
-- Struktur dari tabel `member_subscriptions`
--

CREATE TABLE `member_subscriptions` (
  `id` int(11) NOT NULL,
  `bot_id` varchar(50) NOT NULL,
  `user_id` bigint(20) NOT NULL,
  `category_code` varchar(50) NOT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Struktur dari tabel `owner_config`
--

CREATE TABLE `owner_config` (
  `id` int(11) NOT NULL,
  `owner_id` bigint(20) NOT NULL,
  `rental_price` int(11) DEFAULT 50000,
  `violetpay_api_key` varchar(255) DEFAULT NULL,
  `violetpay_secret_key` varchar(255) DEFAULT NULL,
  `violetpay_is_production` tinyint(1) DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data untuk tabel `owner_config`
--

INSERT INTO `owner_config` (`id`, `owner_id`, `rental_price`, `violetpay_api_key`, `violetpay_secret_key`, `violetpay_is_production`, `created_at`) VALUES
(2, 6511470350, 1000, 'tCgyfDHb4nZvms2apP83AALl17jzukB', 'LprBjbux9qA2aCovJfk7c8sl6A4HPZtgdyieh1wSD5n3L0zm', 1, '2026-01-08 04:55:45');

-- --------------------------------------------------------

--
-- Struktur dari tabel `pending_orders`
--

CREATE TABLE `pending_orders` (
  `id` int(11) NOT NULL,
  `bot_id` varchar(50) NOT NULL,
  `ref_kode` varchar(100) NOT NULL,
  `ref_id` varchar(100) DEFAULT NULL,
  `user_id` bigint(20) NOT NULL,
  `order_type` enum('purchase','deposit','rental') DEFAULT 'purchase',
  `product_code` varchar(50) DEFAULT NULL,
  `qty` int(11) DEFAULT 1,
  `total` int(11) NOT NULL,
  `message_id` bigint(20) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data untuk tabel `pending_orders`
--

INSERT INTO `pending_orders` (`id`, `bot_id`, `ref_kode`, `ref_id`, `user_id`, `order_type`, `product_code`, `qty`, `total`, `message_id`, `created_at`) VALUES
(1, '7836316994', '1767847447192650', 'D1866726DE6ASZY6DRYWUJC', 8005821151, 'purchase', 'net', 1, 1000, 1028, '2026-01-08 04:44:42'),
(3, '7836316994', '1767847619093333', 'D186672664S8SUR4U4ATWAT', 6501087981, 'deposit', NULL, 1, 1000, 1038, '2026-01-08 04:47:01');

-- --------------------------------------------------------

--
-- Struktur dari tabel `products`
--

CREATE TABLE `products` (
  `id` int(11) NOT NULL,
  `bot_id` varchar(50) NOT NULL,
  `category_id` int(11) DEFAULT NULL,
  `code` varchar(50) NOT NULL,
  `name` varchar(200) NOT NULL,
  `description` text DEFAULT NULL,
  `price` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data untuk tabel `products`
--

INSERT INTO `products` (`id`, `bot_id`, `category_id`, `code`, `name`, `description`, `price`, `created_at`) VALUES
(1, '7836316994', 1, 'net', 'NETFLIX UHD', 'FULL 1 BULAN', 1000, '2026-01-08 04:35:06');

-- --------------------------------------------------------

--
-- Struktur dari tabel `product_stock`
--

CREATE TABLE `product_stock` (
  `id` int(11) NOT NULL,
  `product_id` int(11) NOT NULL,
  `item` text NOT NULL,
  `added_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `is_sold` tinyint(1) DEFAULT 0,
  `sold_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data untuk tabel `product_stock`
--

INSERT INTO `product_stock` (`id`, `product_id`, `item`, `added_at`, `is_sold`, `sold_at`) VALUES
(2, 1, 'd', '2026-01-08 04:38:28', 1, '2026-01-08 04:45:35'),
(3, 1, 'c', '2026-01-08 04:38:28', 0, NULL),
(4, 1, 'c', '2026-01-08 04:38:28', 0, NULL),
(5, 1, 'r', '2026-01-08 04:38:28', 0, NULL),
(6, 1, 'a', '2026-01-08 04:38:28', 0, NULL),
(7, 1, 'a', '2026-01-08 04:38:28', 0, NULL),
(8, 1, 'd', '2026-01-08 04:38:28', 0, NULL),
(9, 1, 'f', '2026-01-08 04:38:28', 0, NULL),
(10, 1, 's', '2026-01-08 04:38:28', 0, NULL),
(11, 1, 'a', '2026-01-08 04:38:28', 0, NULL),
(12, 1, 's', '2026-01-08 04:38:28', 0, NULL);

-- --------------------------------------------------------

--
-- Struktur dari tabel `stats`
--

CREATE TABLE `stats` (
  `id` int(11) NOT NULL,
  `bot_id` varchar(50) NOT NULL,
  `total_sales` int(11) DEFAULT 0,
  `total_omzet` bigint(20) DEFAULT 0,
  `rating_total` decimal(3,1) DEFAULT 0.0,
  `rating_count` int(11) DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data untuk tabel `stats`
--

INSERT INTO `stats` (`id`, `bot_id`, `total_sales`, `total_omzet`, `rating_total`, `rating_count`) VALUES
(1, 'main', 0, 0, 0.0, 0),
(2, '7836316994', 1, 1000, 5.0, 129);

--
-- Indexes for dumped tables
--

--
-- Indeks untuk tabel `bots`
--
ALTER TABLE `bots`
  ADD PRIMARY KEY (`id`);

--
-- Indeks untuk tabel `bot_settings`
--
ALTER TABLE `bot_settings`
  ADD PRIMARY KEY (`bot_id`);

--
-- Indeks untuk tabel `categories`
--
ALTER TABLE `categories`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `bot_id` (`bot_id`,`name`);

--
-- Indeks untuk tabel `members`
--
ALTER TABLE `members`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `bot_id` (`bot_id`,`user_id`);

--
-- Indeks untuk tabel `member_subscriptions`
--
ALTER TABLE `member_subscriptions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_sub` (`bot_id`,`user_id`,`category_code`),
  ADD KEY `idx_expires` (`expires_at`),
  ADD KEY `idx_bot_user` (`bot_id`,`user_id`);

--
-- Indeks untuk tabel `owner_config`
--
ALTER TABLE `owner_config`
  ADD PRIMARY KEY (`id`);

--
-- Indeks untuk tabel `pending_orders`
--
ALTER TABLE `pending_orders`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `ref_kode` (`ref_kode`),
  ADD KEY `bot_id` (`bot_id`);

--
-- Indeks untuk tabel `products`
--
ALTER TABLE `products`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `bot_id` (`bot_id`,`code`),
  ADD KEY `category_id` (`category_id`);

--
-- Indeks untuk tabel `product_stock`
--
ALTER TABLE `product_stock`
  ADD PRIMARY KEY (`id`),
  ADD KEY `product_id` (`product_id`);

--
-- Indeks untuk tabel `stats`
--
ALTER TABLE `stats`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `bot_id` (`bot_id`);

--
-- AUTO_INCREMENT untuk tabel yang dibuang
--

--
-- AUTO_INCREMENT untuk tabel `categories`
--
ALTER TABLE `categories`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT untuk tabel `members`
--
ALTER TABLE `members`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=77;

--
-- AUTO_INCREMENT untuk tabel `member_subscriptions`
--
ALTER TABLE `member_subscriptions`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT untuk tabel `owner_config`
--
ALTER TABLE `owner_config`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT untuk tabel `pending_orders`
--
ALTER TABLE `pending_orders`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT untuk tabel `products`
--
ALTER TABLE `products`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT untuk tabel `product_stock`
--
ALTER TABLE `product_stock`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=13;

--
-- AUTO_INCREMENT untuk tabel `stats`
--
ALTER TABLE `stats`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- Ketidakleluasaan untuk tabel pelimpahan (Dumped Tables)
--

--
-- Ketidakleluasaan untuk tabel `categories`
--
ALTER TABLE `categories`
  ADD CONSTRAINT `categories_ibfk_1` FOREIGN KEY (`bot_id`) REFERENCES `bots` (`id`) ON DELETE CASCADE;

--
-- Ketidakleluasaan untuk tabel `members`
--
ALTER TABLE `members`
  ADD CONSTRAINT `members_ibfk_1` FOREIGN KEY (`bot_id`) REFERENCES `bots` (`id`) ON DELETE CASCADE;

--
-- Ketidakleluasaan untuk tabel `pending_orders`
--
ALTER TABLE `pending_orders`
  ADD CONSTRAINT `pending_orders_ibfk_1` FOREIGN KEY (`bot_id`) REFERENCES `bots` (`id`) ON DELETE CASCADE;

--
-- Ketidakleluasaan untuk tabel `products`
--
ALTER TABLE `products`
  ADD CONSTRAINT `products_ibfk_1` FOREIGN KEY (`bot_id`) REFERENCES `bots` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `products_ibfk_2` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL;

--
-- Ketidakleluasaan untuk tabel `product_stock`
--
ALTER TABLE `product_stock`
  ADD CONSTRAINT `product_stock_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE;

--
-- Ketidakleluasaan untuk tabel `stats`
--
ALTER TABLE `stats`
  ADD CONSTRAINT `stats_ibfk_1` FOREIGN KEY (`bot_id`) REFERENCES `bots` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
