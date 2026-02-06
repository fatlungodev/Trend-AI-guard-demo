import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config.js';

const genAI = new GoogleGenerativeAI(config.googleApiKey);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

export async function getChatCompletion(content) {
    try {
        console.log('--- LLM URL ---');
        console.log(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`);

        const result = await model.generateContent(content);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error('Gemini Error:', error.message);
        throw error;
    }
}
