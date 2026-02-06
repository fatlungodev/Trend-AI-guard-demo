import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';

const client = new GoogleGenAI({ apiKey: config.geminiApiKey });

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
