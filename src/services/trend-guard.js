import axios from 'axios';
import { config } from '../config.js';

export async function checkSecurity(content) {
    if (!config.isGuardEnabled) return { action: 'allow' };

    try {
        const headers = {
            'Authorization': `Bearer ${config.v1ApiKey}`,
            'Content-Type': 'application/json;charset=utf-8',
            'TMV1-Application-Name': config.appName
        };

        const url = `${config.v1BaseUrl}/v3.0/aiSecurity/applyGuardrails`;

        console.log('--- Trend Guard URL ---');
        console.log(url);

        console.log('--- Trend Guard HTTP Headers ---');
        console.log(JSON.stringify(headers, null, 2));

        const response = await axios.post(
            url,
            {
                prompt: content
            },
            { headers }
        );

        return {
            request: { prompt: content },
            response: response.data
        };
    } catch (error) {
        console.error('Trend Vision One AI Guard Error:', error.response?.data || error.message);
        // Fail-Open approach as per requirements
        return {
            request: { prompt: content },
            response: { action: 'allow', error: error.message }
        };
    }
}
