import dotenv from 'dotenv';
dotenv.config();

export const config = {
    geminiApiKey: process.env.GEMINI_API_KEY,
    v1ApiKey: process.env.V1_API_KEY,
    v1BaseUrl: process.env.V1_BASE_URL || 'https://api.xdr.trendmicro.com',
    appName: process.env.APP_NAME || 'whatsapp-internal-bot',
    isGuardEnabled: true, // Default state
    whatsappAllowList: (process.env.WHATSAPP_ALLOW_LIST || '').split(',').map(n => n.trim()).filter(n => n),
    httpProxy: process.env.HTTP_PROXY,
    httpsProxy: process.env.HTTPS_PROXY
};
