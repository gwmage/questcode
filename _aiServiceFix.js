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
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const targetPath = path.join(__dirname, 'src', 'ai.service.ts');
const newContent = `
import axios from 'axios';
import { config } from 'dotenv';
import { Action } from './types';
import * as fs from 'fs';
import * as path from 'path';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

let genAI: GoogleGenerativeAI | null = null;
if (process.env.GOOGLE_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
}

let geminiModel: any = null;
if (genAI) {
    geminiModel = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest"});
}

export type AiModel = 'gpt-4o' | 'claude-3-opus' | 'gemini-2.5-pro' | 'nurie';

export interface AiActionResponse {
  decision: 'act' | 'crawl' | 'finish';
  reasoning: string;
  action: Action | null;
}

async function gpt4oRequest(prompt: string, chatId?: string): Promise<any> {
  console.log(\`Using model: gpt-4o (Chat ID: \${chatId})\`);
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0,
  });
  console.log('Full AI Response Data:', JSON.stringify(response, null, 2));
  return { text: response.choices[0].message.content };
}

async function claude3OpusRequest(prompt: string, chatId?: string): Promise<any> {
    console.log(\`Using model: claude-3-opus (Chat ID: \${chatId})\`);
    const response = await anthropic.messages.create({
        model: 'claude-3-opus-20240229',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
    });
    console.log('Full AI Response Data:', JSON.stringify(response, null, 2));

    const allText = response.content
        .filter(block => block.type === 'text')
        .map(block => (block as Anthropic.TextBlock).text)
        .join('');

    return { text: allText };
}

async function gemini2_5ProRequest(prompt: string, chatId?: string): Promise<any> {
    console.log(\`Using model: gemini-2.5-pro (Chat ID: \${chatId})\`);
    if (!geminiModel) {
        throw new Error("Gemini model is not initialized. Check GOOGLE_API_KEY.");
    }
    const result = await geminiModel.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    console.log('Full AI Response Data:', JSON.stringify(response, null, 2));
    return { text };
}

export async function nurieRequest(prompt: string, chatId?: string): Promise<any> {
  console.log(\`Using model: nurie (Chat ID: \${chatId})\`);
  const apiKey = process.env.NURIE_API_KEY;
  if (!apiKey) {
    throw new Error('NURIE_API_KEY is not set in the environment variables.');
  }
  const requestBody = { question: prompt, chatId };
  const requestConfig = {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: \`Bearer \${apiKey}\`,
    },
  };
  try {
    const response = await axios.post(process.env.NURIE_API as string, requestBody, requestConfig);
    console.log('Full AI Response Data:', JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error: any) {
    console.error('AI 요청 실패:', error.response?.status, error.response?.data);
    throw new Error(\`Request failed with status code \${error.response?.status}\`);
  }
}

export async function requestAiModel(
    prompt: string, 
    model: AiModel, 
    chatId: string
): Promise<any> {
    switch (model) {
        case 'gpt-4o':
            if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set for gpt-4o.');
            return gpt4oRequest(prompt, chatId);
        case 'claude-3-opus':
            if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set for claude-3-opus.');
            return claude3OpusRequest(prompt, chatId);
        case 'gemini-2.5-pro':
            if (!process.env.GOOGLE_API_KEY) throw new Error('GOOGLE_API_KEY is not set for gemini-2.5-pro.');
            return gemini2_5ProRequest(prompt, chatId);
        case 'nurie':
            if (!process.env.NURIE_API_KEY || !process.env.NURIE_API) {
                throw new Error('NURIE_API_KEY or NURIE_API is not set for nurie model.');
            }
            return nurieRequest(prompt, chatId);
        default:
            console.warn(\`Unknown model: \${model}. Defaulting to gpt-4o.\`);
            if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set for default model gpt-4o.');
            return gpt4oRequest(prompt, chatId);
    }
}

let promptTemplate: string | null = null;

export function createAgentPrompt(
  iaString: string,
  pageUrl: string,
  pageTitle: string,
  pageContext: string,
  testContext: string,
  actionHistory: Action[],
  isStuck: boolean,
): string {

  if (!promptTemplate) {
    promptTemplate = fs.readFileSync(path.join(__dirname, 'prompt.txt'), 'utf-8');
  }

  const recentHistory = actionHistory.slice(-10); // Keep only the last 10 actions

  const historyString = recentHistory.length > 0 
    ? recentHistory.map((a, i) => {
        const stepNumber = actionHistory.length - recentHistory.length + i + 1;
        return \`Step \${stepNumber}: \${a.description}\${a.error ? \` (Failed: \${a.error})\` : ''}\`;
      }).join('\\n')
    : "No actions taken yet.";

  let prompt = promptTemplate!;
  prompt = prompt.replace('{goal}', testContext);
  prompt = prompt.replace('{url}', pageUrl);
  prompt = prompt.replace('{title}', pageTitle);
  prompt = prompt.replace('{pageContext}', pageContext);
  prompt = prompt.replace('{actionHistory}', historyString);

  return prompt;
}

let reportPromptTemplate: string | null = null;

export function createReport(testContext: string, actionHistory: Action[]): string {
  if (!reportPromptTemplate) {
    reportPromptTemplate = fs.readFileSync(path.join(__dirname, 'report_prompt.txt'), 'utf-8');
  }

  const historyString = actionHistory
    .map((a, i) => {
      let log = \`Step \${i + 1}: \${a.description}\`;
      if (a.error) {
        log += \`\\n  - Error: \${a.error}\`;
      }
      return log;
    })
    .join('\\n');

  let prompt = reportPromptTemplate!;
  prompt = prompt.replace('{testContext}', testContext);
  prompt = prompt.replace('{actionHistory}', historyString);
  return prompt;
}

export function parseAiActionResponse(responseText: string): AiActionResponse {
  try {
    if (!responseText) {
      throw new Error('AI response text is empty or undefined.');
    }
    const jsonMatch = responseText.match(/\\\`\\\`\\\`json\\s*([\\s\\S]*?)\\s*\\\`\\\`\\\`/);
    if (!jsonMatch || !jsonMatch[1]) {
      return JSON.parse(responseText) as AiActionResponse;
    };
    return JSON.parse(jsonMatch[1]) as AiActionResponse;
  } catch (e: any) {
    console.error("Failed to parse AI action response JSON. Error:", e, "Original Response:", responseText);
    throw new Error("Failed to parse AI action response.");
  }
}
`;
fs.writeFileSync(targetPath, newContent);
console.log(`Successfully updated \${targetPath} via _aiServiceFix.ts\`);
`);
const scriptFilePath = path.join(__dirname, '_aiServiceFix.ts');
const scriptContent = `
import * as fs from 'fs';
import * as path from 'path';

const targetPath = path.join(__dirname, '..', 'src', 'ai.service.ts');

try {
    let content = fs.readFileSync(targetPath, 'utf8');

    content = content.replace(
      'createAgentPrompt(iaString, pageUrl, pageTitle, elementsString,',
      'createAgentPrompt(iaString, pageUrl, pageTitle, pageContext,'
    );
    
    content = content.replace(
      'prompt = prompt.replace(\'{elementsString}\', elementsString);',
      'prompt = prompt.replace(\'{pageContext}\', pageContext);'
    );

    fs.writeFileSync(targetPath, content, 'utf8');
    console.log('src/ai.service.ts was successfully updated by _aiServiceFix.ts');

} catch (error) {
    console.error('Failed to update src/ai.service.ts:', error);
}
`;
try {
    fs.writeFileSync(scriptFilePath, scriptContent.trim());
    console.log(`Successfully created the fix script: ${scriptFilePath}`);
}
catch (error) {
    console.error(`Failed to create the fix script: ${error}`);
}
