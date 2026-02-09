import axios from 'axios';
import { config } from '../config.js';

// Helper to parse proxy URL for Axios
function getAxiosProxy(proxyUrl) {
    if (!proxyUrl) return false;
    try {
        // Handle "host:port" format by adding protocol
        if (!proxyUrl.includes('://')) {
            proxyUrl = `http://${proxyUrl}`;
        }

        const url = new URL(proxyUrl);
        // Axios proxy config: host, port, auth. 
        // We omit protocol to let Axios handle defaults (usually http) unless strictly needed.
        const proxyConfig = {
            host: url.hostname,
            port: parseInt(url.port, 10) || 80, // Default to 80 if implicit
            auth: (url.username && url.password) ? { username: url.username, password: url.password } : undefined
        };

        if (url.protocol === 'https:') {
            proxyConfig.protocol = 'https';
            proxyConfig.port = parseInt(url.port, 10) || 443;
        }

        return proxyConfig;
    } catch (e) {
        console.error('Invalid proxy URL:', proxyUrl);
        return false;
    }
}

export async function checkSecurity(content) {
    if (!config.isGuardEnabled) return { action: 'allow' };

    try {
        const headers = {
            'Authorization': `Bearer ${config.v1ApiKey}`,
            'Content-Type': 'application/json', // Let Axios handle charset, or keep simple
            'TMV1-Application-Name': config.appName,
            'User-Agent': 'Trend-AI-Guard-Demo/1.0'
        };

        const url = `${config.v1BaseUrl}/v3.0/aiSecurity/applyGuardrails`;
        const proxyConfig = getAxiosProxy(config.v1Proxy);

        console.log('--- Trend Guard URL ---');
        console.log(url);

        if (proxyConfig) {
            console.log(`Using proxy for Trend Guard: ${proxyConfig.host}:${proxyConfig.port}`);
        }

        const response = await axios.post(url, { prompt: content }, {
            headers,
            proxy: proxyConfig
        });

        return {
            request: { prompt: content },
            response: response.data
        };

    } catch (error) {
        const status = error.response ? error.response.status : 'Unknown';
        const errorData = error.response ? error.response.data : error.message;

        console.error(`Trend Vision One AI Guard Error (Status: ${status}):`, typeof errorData === 'object' ? JSON.stringify(errorData) : errorData);

        // Fail-Open approach as per requirements
        return {
            request: { prompt: content },
            response: { action: 'allow', error: `Status ${status}: ${typeof errorData === 'object' ? JSON.stringify(errorData) : errorData}` }
        };
    }
}
