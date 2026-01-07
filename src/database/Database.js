const fs = require('fs');
const path = require('path');

class Database {
    constructor(botId) {
        this.botId = botId;
        this.dataDir = path.join(__dirname, '../../data', `bot_${botId}`);
        this.ensureDir();
    }

    ensureDir() {
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
    }

    getFilePath(fileName) {
        return path.join(this.dataDir, fileName);
    }

    read(fileName) {
        const filePath = this.getFilePath(fileName);
        if (!fs.existsSync(filePath)) {
            return [];
        }
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }

    write(fileName, data) {
        fs.writeFileSync(this.getFilePath(fileName), JSON.stringify(data, null, 2));
    }

    getSettings() {
        const filePath = this.getFilePath('settings.json');
        if (!fs.existsSync(filePath)) {
            return {};
        }
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }

    getSetting(key) {
        const settings = this.getSettings();
        return settings[key] || null;
    }

    setSetting(key, value) {
        const settings = this.getSettings();
        if (value === null) {
            delete settings[key];
        } else {
            settings[key] = value;
        }
        this.write('settings.json', settings);
    }

    getAdmins() {
        return this.read('admins.json');
    }

    addAdmin(userId, addedBy) {
        const admins = this.getAdmins();
        if (admins.find(a => a.userId === userId)) return false;
        admins.push({ userId, addedBy, addedAt: new Date().toISOString() });
        this.write('admins.json', admins);
        return true;
    }

    removeAdmin(userId) {
        const admins = this.getAdmins();
        const filtered = admins.filter(a => a.userId !== userId);
        if (filtered.length === admins.length) return false;
        this.write('admins.json', filtered);
        return true;
    }

    isAdmin(userId) {
        return this.getAdmins().some(a => a.userId === userId);
    }

    getMembers() {
        return this.read('members.json');
    }

    addMember(userId, username) {
        const members = this.getMembers();
        const existing = members.find(m => m.userId === userId);
        if (existing) {
            existing.username = username;
            existing.lastSeen = new Date().toISOString();
        } else {
            members.push({ userId, username, joinedAt: new Date().toISOString(), lastSeen: new Date().toISOString() });
        }
        this.write('members.json', members);
    }

    isMember(userId) {
        return this.getMembers().some(m => m.userId === userId);
    }

    // Stats Management
    getStats() {
        const filePath = this.getFilePath('stats.json');
        if (!require('fs').existsSync(filePath)) {
            return { totalSales: 0, totalOmzet: 0, rating: { total: 0, count: 0 } };
        }
        return JSON.parse(require('fs').readFileSync(filePath, 'utf8'));
    }

    updateStats(salesCount, omzetAmount) {
        const stats = this.getStats();
        stats.totalSales = (stats.totalSales || 0) + salesCount;
        stats.totalOmzet = (stats.totalOmzet || 0) + omzetAmount;
        this.write('stats.json', stats);
        return stats;
    }

    setRating(rating, count) {
        const stats = this.getStats();
        stats.rating = { total: rating, count: count };
        this.write('stats.json', stats);
        return stats;
    }

    incrementMemberOrder(userId) {
        const members = this.getMembers();
        const member = members.find(m => m.userId === userId);
        if (member) {
            member.totalOrders = (member.totalOrders || 0) + 1;
            this.write('members.json', members);
            return member.totalOrders;
        }
        return 0;
    }

    getMemberOrderCount(userId) {
        const members = this.getMembers();
        const member = members.find(m => m.userId === userId);
        return member ? (member.totalOrders || 0) : 0;
    }
}

module.exports = Database;
