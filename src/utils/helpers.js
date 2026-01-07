const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('id-ID');
};

const escapeHtml = (text) => {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
};

const extractBotId = (token) => {
    return token.split(':')[0];
};

module.exports = { formatDate, escapeHtml, extractBotId };
