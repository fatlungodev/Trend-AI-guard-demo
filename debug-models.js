import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

async function testModels() {
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    const models = ['gemini-1.5-flash', 'gemini-1.5-flash-latest', 'gemini-1.5-pro', 'gemini-pro'];

    for (const m of models) {
        try {
            console.log(`Testing ${m}...`);
            const model = genAI.getGenerativeModel({ model: m });
            const result = await model.generateContent('hi');
            console.log(`✅ Success with ${m}:`, (await result.response.text()).substring(0, 20));
        } catch (error) {
            console.error(`❌ Error with ${m}:`, error.message);
        }
    }
}

testModels();
