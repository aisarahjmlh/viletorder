const { registerFoto } = require('./foto');
const { registerCategory } = require('./category');
const { registerProduct } = require('./product');
const { registerStock } = require('./stock');
const { registerBroadcast } = require('./broadcast');
const { registerWelcome } = require('./welcome');
const { registerPaymentGateway } = require('./paymentgateway');
const { registerUserList } = require('./userlist');
const { registerBackup } = require('./backup');
const { registerCheckBalance } = require('./checkBalance');

const registerAdminHandlers = (bot, db, botConfig = {}) => {
    registerFoto(bot, db);
    registerCategory(bot, db);
    registerProduct(bot, db);
    registerStock(bot, db);
    registerBroadcast(bot, db);
    registerWelcome(bot, db);
    registerPaymentGateway(bot, db);
    registerUserList(bot, db);
    registerBackup(bot, db);
    registerCheckBalance(bot, db, botConfig);
};

module.exports = { registerAdminHandlers };
