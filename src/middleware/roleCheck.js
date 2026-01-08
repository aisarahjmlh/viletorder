const pool = require('../database/db');

// Get owner ID from MySQL
const getOwnerId = async () => {
    const [rows] = await pool.query('SELECT owner_id FROM owner_config LIMIT 1');
    return rows.length > 0 ? rows[0].owner_id : 0;
};

// Cached owner ID for sync operations
let cachedOwnerId = null;

// Initialize cached owner ID
(async () => {
    try {
        cachedOwnerId = await getOwnerId();
    } catch (e) {
        console.error('[RoleCheck] Failed to cache owner ID:', e.message);
    }
})();

const isOwner = () => async (ctx, next) => {
    const ownerId = cachedOwnerId || await getOwnerId();
    if (ctx.from.id === ownerId) {
        return next();
    }
    return ctx.reply('⛔ Akses ditolak. Hanya owner.');
};

const isAdmin = (db) => async (ctx, next) => {
    const ownerId = cachedOwnerId || await getOwnerId();
    if (ctx.from.id === ownerId) {
        return next();
    }

    const adminUsername = await db.getSetting('adminUsername');
    const userUsername = ctx.from.username;

    if (adminUsername && userUsername) {
        const adminList = adminUsername.split(',').map(a => a.trim().toLowerCase());
        if (adminList.includes(userUsername.toLowerCase())) {
            return next();
        }
    }

    return ctx.reply('⛔ Akses ditolak. Hanya admin.');
};

const isMember = (db) => async (ctx, next) => {
    await db.addMember(ctx.from.id, ctx.from.username || ctx.from.first_name);
    return next();
};

const getRole = async (db, userId, username) => {
    const ownerId = cachedOwnerId || await getOwnerId();

    if (userId === ownerId) {
        return 'owner';
    }

    const adminUsername = await db.getSetting('adminUsername');
    if (adminUsername && username) {
        const adminList = adminUsername.split(',').map(a => a.trim().toLowerCase());
        if (adminList.includes(username.toLowerCase())) {
            return 'admin';
        }
    }

    return 'member';
};

module.exports = { isOwner, isAdmin, isMember, getRole, getOwnerId };
