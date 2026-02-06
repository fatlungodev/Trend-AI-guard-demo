import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';
import { ProxyAgent } from 'undici';
import { setGlobalDispatcher } from 'undici';

// Configure proxy if available
const httpOptions = {};
const proxyUrl = config.httpsProxy || config.httpProxy;
if (proxyUrl) {
    const proxyAgent = new ProxyAgent(proxyUrl);
    httpOptions.fetch = (url, opts) => fetch(url, { ...opts, dispatcher: proxyAgent });
    console.log(`Using proxy: ${proxyUrl}`);
    setGlobalDispatcher(proxyAgent);
}

const client = new GoogleGenAI({
    apiKey: config.geminiApiKey,
    httpOptions
});

export async function getChatCompletion(content) {
    try {
        console.log('--- LLM URL ---');
        console.log(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`);

        const response = await client.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: content
        });

        return response.candidates[0].content.parts[0].text;
    } catch (error) {
        console.error('Gemini Error:', error.message);
        throw error;
    }
}
