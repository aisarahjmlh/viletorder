const fs = require('fs');
const path = require('path');

const ownerConfig = require('../../config/owner.json');

const isOwner = () => (ctx, next) => {
    if (ctx.from.id === ownerConfig.ownerId) {
        return next();
    }
    return ctx.reply('⛔ Akses ditolak. Hanya owner.');
};

const isAdmin = (db) => (ctx, next) => {
    if (ctx.from.id === ownerConfig.ownerId) {
        return next();
    }

    const adminUsername = db.getSetting('adminUsername');
    const userUsername = ctx.from.username;

    if (adminUsername && userUsername) {
        // Support multiple admins separated by comma
        const adminList = adminUsername.split(',').map(a => a.trim().toLowerCase());
        if (adminList.includes(userUsername.toLowerCase())) {
            return next();
        }
    }

    return ctx.reply('⛔ Akses ditolak. Hanya admin.');
};

const isMember = (db) => (ctx, next) => {
    db.addMember(ctx.from.id, ctx.from.username || ctx.from.first_name);
    return next();
};

const getRole = (db, userId, username) => {
    if (userId === ownerConfig.ownerId) return 'owner';

    const adminUsername = db.getSetting('adminUsername');
    if (adminUsername && username) {
        // Support multiple admins separated by comma
        const adminList = adminUsername.split(',').map(a => a.trim().toLowerCase());
        if (adminList.includes(username.toLowerCase())) {
            return 'admin';
        }
    }

    return 'member';
};

module.exports = { isOwner, isAdmin, isMember, getRole };
