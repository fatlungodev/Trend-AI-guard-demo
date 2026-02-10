import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';
import { ProxyAgent, setGlobalDispatcher } from 'undici';

// Configure proxy if available
const proxyUrl = config.geminiProxy;
if (proxyUrl) {
    const proxyAgent = new ProxyAgent(proxyUrl);
    setGlobalDispatcher(proxyAgent);
    console.log(`Using proxy for Gemini: ${proxyUrl}`);
}

const client = new GoogleGenAI({
    apiKey: config.geminiApiKey
});

/**
 * Get chat completion with optional image input/output support
 * @param {string} textPrompt - The text prompt
 * @param {Object|null} imageData - Optional image data { mimeType: string, data: string (base64) }
 * @returns {Promise<{text: string, image?: {mimeType: string, data: string}}>}
 */
export async function getChatCompletion(textPrompt, imageData = null) {
    try {
        // Build multimodal content parts
        const parts = [];
        
        if (textPrompt) {
            parts.push({ text: textPrompt });
        }
        
        if (imageData) {
            parts.push({
                inlineData: {
                    mimeType: imageData.mimeType,
                    data: imageData.data
                }
            });
        }

        // Use gemini-2.0-flash-exp for image generation support
        const modelName = 'gemini-2.5-flash';
        console.log('--- LLM URL ---');
        console.log(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`);

        const response = await client.models.generateContent({
            model: modelName,
            contents: [{ parts }]
        });

        // Parse response parts
        const result = { text: '' };
        const responseParts = response.candidates?.[0]?.content?.parts || [];
        
        for (const part of responseParts) {
            if (part.text) {
                result.text += part.text;
            } else if (part.inlineData) {
                result.image = {
                    mimeType: part.inlineData.mimeType,
                    data: part.inlineData.data
                };
            }
        }

        return result;
    } catch (error) {
        console.error('Gemini Error:', error.message);
        throw error;
    }
}
