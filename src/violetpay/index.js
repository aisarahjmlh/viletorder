const crypto = require('crypto');
const axios = require('axios');

const SANDBOX_BASE_URL = 'https://violetmediapay.com/api/sandbox';
const PRODUCTION_BASE_URL = 'https://violetmediapay.com/api/live';

const pendingTransactions = {};

const getBaseUrl = (isProduction = false) => {
    return isProduction ? PRODUCTION_BASE_URL : SANDBOX_BASE_URL;
};

// Create axios instance with better defaults
const apiClient = axios.create({
    timeout: 30000,
    headers: {
        'User-Agent': 'VioletBot/1.0',
        'Content-Type': 'application/x-www-form-urlencoded'
    }
});

// Helper for retry logic
async function requestWithRetry(url, params, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await apiClient.post(url, params);
            return response.data;
        } catch (error) {
            const isLastAttempt = i === retries - 1;
            if (isLastAttempt) throw error;

            // Wait before retrying (1s, 2s, 3s)
            const delay = (i + 1) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

function generateSignature(refKode, apiKey, amount, secretKey) {
    const data = `${refKode}${apiKey}${amount}`;
    return crypto.createHmac('sha256', secretKey).update(data).digest('hex');
}

function generateRefKode() {
    return Date.now().toString() + Math.floor(Math.random() * 1000).toString();
}

async function getChannelPayment(apiKey, secretKey, isProduction = false) {
    const url = `${getBaseUrl(isProduction)}/channel-payment`;

    const params = new URLSearchParams();
    params.append('api_key', apiKey);
    params.append('secret_key', secretKey);
    params.append('channel_payment', 'list');

    try {
        return await requestWithRetry(url, params);
    } catch (error) {
        console.error('VioletPay API Error:', error.message);
        if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
            return { success: false, error: 'Koneksi ke server pembayaran tidak stabil (timeout). Silakan coba lagi.' };
        }
        return { success: false, error: error.message };
    }
}

async function calculateFee(apiKey, secretKey, code, amount, isProduction = false) {
    const url = `${getBaseUrl(isProduction)}/fee-calculator`;

    const params = new URLSearchParams();
    params.append('api_key', apiKey);
    params.append('secret_key', secretKey);
    params.append('code', code);
    params.append('amount', amount.toString());

    try {
        return await requestWithRetry(url, params);
    } catch (error) {
        console.error('VioletPay API Error:', error.message);
        return { success: false, error: error.message };
    }
}

async function checkBalance(apiKey, secretKey, isProduction = false) {
    const url = `${getBaseUrl(isProduction)}/balance`;

    const params = new URLSearchParams();
    params.append('api_key', apiKey);
    params.append('secret_key', secretKey);
    params.append('method', 'balance');

    try {
        const response = await axios.post(url, params, {
            timeout: 10000,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        return response.data || { success: false, error: 'Empty response' };
    } catch (error) {
        console.error('VioletPay Balance Error:', error?.message || error);
        return { success: false, error: error?.message || 'Connection error' };
    }
}

async function checkTransaction(apiKey, secretKey, ref, refId, isProduction = false) {
    const url = `${getBaseUrl(isProduction)}/transactions`;

    const params = new URLSearchParams();
    params.append('api_key', apiKey);
    params.append('secret_key', secretKey);
    params.append('ref', ref);
    if (refId) params.append('ref_id', refId);

    try {
        return await requestWithRetry(url, params);
    } catch (error) {
        console.error('VioletPay API Error:', error.message);
        return { success: false, error: error.message };
    }
}

async function createQrisPayment(apiKey, secretKey, amount, customer, productName, isProduction = false, channelPayment = 'QRIS') {
    const url = `${getBaseUrl(isProduction)}/create`;
    const refKode = generateRefKode();
    const signature = generateSignature(refKode, apiKey, amount.toString(), secretKey);
    const expiredTime = Math.floor(Date.now() / 1000) + (24 * 60 * 60);

    const params = new URLSearchParams();
    params.append('api_key', apiKey);
    params.append('secret_key', secretKey);
    params.append('channel_payment', channelPayment.toUpperCase());
    params.append('ref_kode', refKode);
    params.append('nominal', amount.toString());
    params.append('cus_nama', customer.nama || 'Customer');
    params.append('cus_email', customer.email || 'customer@email.com');
    params.append('cus_phone', customer.phone || '08123456789');
    params.append('produk', productName);
    params.append('url_redirect', 'https://t.me/violetmakerbot');
    params.append('url_callback', 'https://t.me/violetmakerbot');
    params.append('expired_time', expiredTime.toString());
    params.append('signature', signature);

    try {
        const result = await requestWithRetry(url, params);

        if (result.success || result.status) {
            const resultData = result.data || result;

            const mappedResult = {
                ...result,
                ...resultData,
                refKode: refKode,
                amount: amount,
                productName: productName,
                createdAt: Date.now(),
                qris_url: resultData.target || resultData.qris_url || resultData.qr_url,
                checkout_url: resultData.checkout_url
            };

            pendingTransactions[refKode] = mappedResult;

            return mappedResult;
        }

        return { ...result, refKode: refKode };
    } catch (error) {
        console.error('VioletPay API Error:', error.message);
        if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
            return { success: false, error: 'Koneksi ke server pembayaran tidak stabil (timeout). Silakan coba lagi.' };
        }
        return { success: false, error: error.message };
    }
}

function getPendingTransaction(refKode) {
    return pendingTransactions[refKode] || null;
}

function removePendingTransaction(refKode) {
    delete pendingTransactions[refKode];
}

function verifyCallbackSignature(refId, apiKey, receivedSignature) {
    const expectedSignature = crypto.createHmac('sha256', apiKey).update(refId).digest('hex');
    return expectedSignature === receivedSignature;
}

module.exports = {
    getChannelPayment,
    calculateFee,
    checkBalance,
    checkTransaction,
    createQrisPayment,
    generateSignature,
    generateRefKode,
    getPendingTransaction,
    removePendingTransaction,
    verifyCallbackSignature,
    getBaseUrl
};
