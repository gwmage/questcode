"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.nurieRequest = nurieRequest;
exports.requestAiModel = requestAiModel;
exports.createAgentPrompt = createAgentPrompt;
exports.createReport = createReport;
exports.parseAiActionResponse = parseAiActionResponse;
const axios_1 = __importDefault(require("axios"));
const dotenv_1 = require("dotenv");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const openai_1 = __importDefault(require("openai"));
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const generative_ai_1 = require("@google/generative-ai");
(0, dotenv_1.config)();
const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new sdk_1.default({ apiKey: process.env.ANTHROPIC_API_KEY });
let genAI = null;
if (process.env.GOOGLE_API_KEY) {
    genAI = new generative_ai_1.GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
}
let geminiModel = null;
if (genAI) {
    geminiModel = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });
}
async function gpt4oRequest(prompt, chatId) {
    console.log(`Using model: gpt-4o (Chat ID: ${chatId})`);
    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
    });
    console.log('Full AI Response Data:', JSON.stringify(response, null, 2));
    return { text: response.choices[0].message.content };
}
async function claude3OpusRequest(prompt, chatId) {
    console.log(`Using model: claude-3-opus (Chat ID: ${chatId})`);
    const response = await anthropic.messages.create({
        model: 'claude-3-opus-20240229',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
    });
    console.log('Full AI Response Data:', JSON.stringify(response, null, 2));
    const allText = response.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('');
    return { text: allText };
}
async function gemini2_5ProRequest(prompt, chatId) {
    console.log(`Using model: gemini-2.5-pro (Chat ID: ${chatId})`);
    if (!geminiModel) {
        throw new Error("Gemini model is not initialized. Check GOOGLE_API_KEY.");
    }
    const result = await geminiModel.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    console.log('Full AI Response Data:', JSON.stringify(response, null, 2));
    return { text };
}
async function nurieRequest(prompt, chatId) {
    console.log(`Using model: nurie (Chat ID: ${chatId})`);
    const apiKey = process.env.NURIE_API_KEY;
    if (!apiKey) {
        throw new Error('NURIE_API_KEY is not set in the environment variables.');
    }
    const requestBody = { question: prompt, chatId };
    const requestConfig = {
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            Authorization: `Bearer ${apiKey}`,
        },
    };
    try {
        const response = await axios_1.default.post(process.env.NURIE_API, requestBody, requestConfig);
        console.log('Full AI Response Data:', JSON.stringify(response.data, null, 2));
        return response.data;
    }
    catch (error) {
        console.error('AI 요청 실패:', error.response?.status, error.response?.data);
        throw new Error(`Request failed with status code ${error.response?.status}`);
    }
}
async function requestAiModel(prompt, model, chatId) {
    switch (model) {
        case 'gpt-4o':
            if (!process.env.OPENAI_API_KEY)
                throw new Error('OPENAI_API_KEY is not set.');
            return gpt4oRequest(prompt, chatId);
        case 'claude-3-opus':
            if (!process.env.ANTHROPIC_API_KEY)
                throw new Error('ANTHROPIC_API_KEY is not set.');
            return claude3OpusRequest(prompt, chatId);
        case 'gemini-2.5-pro':
            if (!process.env.GOOGLE_API_KEY)
                throw new Error('GOOGLE_API_KEY is not set.');
            return gemini2_5ProRequest(prompt, chatId);
        case 'nurie':
            return nurieRequest(prompt, chatId);
        default:
            console.log(`모델을 찾을 수 없습니다: ${model}. 기본 모델인 gpt-4o를 사용합니다.`);
            if (!process.env.OPENAI_API_KEY)
                throw new Error('OPENAI_API_KEY is not set.');
            return gpt4oRequest(prompt, chatId);
    }
}
let promptTemplate = null;
function createAgentPrompt(iaString, pageUrl, pageTitle, pageContext, testContext, actionHistory, isStuck) {
    if (!promptTemplate) {
        promptTemplate = fs.readFileSync(path.join(__dirname, 'prompt.txt'), 'utf-8');
    }
    const historyString = actionHistory.length > 0
        ? actionHistory.map((a, i) => `Step ${i + 1}: ${a.description}${a.error ? ` (Failed: ${a.error})` : ''}`).join('\n')
        : "No actions taken yet.";
    let prompt = promptTemplate;
    prompt = prompt.replace('{goal}', testContext);
    prompt = prompt.replace('{url}', pageUrl);
    prompt = prompt.replace('{title}', pageTitle);
    prompt = prompt.replace('{pageContext}', pageContext);
    prompt = prompt.replace('{actionHistory}', historyString);
    return prompt;
}
let reportPromptTemplate = null;
function createReport(testContext, actionHistory) {
    if (!reportPromptTemplate) {
        reportPromptTemplate = fs.readFileSync(path.join(__dirname, 'report_prompt.txt'), 'utf-8');
    }
    const historyString = actionHistory
        .map((a, i) => {
        let log = `Step ${i + 1}: ${a.description}`;
        if (a.error) {
            log += `\n  - Error: ${a.error}`;
        }
        return log;
    })
        .join('\n');
    let prompt = reportPromptTemplate;
    prompt = prompt.replace('{testContext}', testContext);
    prompt = prompt.replace('{actionHistory}', historyString);
    return prompt;
}
function parseAiActionResponse(responseText) {
    try {
        if (!responseText) {
            throw new Error('AI response text is empty or undefined.');
        }
        const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
        if (!jsonMatch || !jsonMatch[1]) {
            return JSON.parse(responseText);
        }
        ;
        return JSON.parse(jsonMatch[1]);
    }
    catch (e) {
        console.error("Failed to parse AI action response JSON. Error:", e, "Original Response:", responseText);
        throw new Error("Failed to parse AI action response.");
    }
}
