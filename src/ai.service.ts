import axios from 'axios';
import { config } from 'dotenv';
import { Action } from './cli';
import * as fs from 'fs';
import * as path from 'path';

config();

export interface AiActionResponse {
  decision: 'act' | 'crawl' | 'finish';
  reasoning: string;
  action: Action | null; // Can be null for 'finish'
}

export async function nurieRequest(prompt: string, chatId?: string): Promise<any> {
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
    const response = await axios.post(process.env.NURIE_API as string, requestBody, requestConfig);
    console.log('Full AI Response Data:', JSON.stringify(response.data, null, 2)); // Added for debugging
    return response.data;
  } catch (error: any) {
    console.error('AI 요청 실패:', error.response?.status, error.response?.data);
    throw new Error(`Request failed with status code ${error.response?.status}`);
  }
}

let promptTemplate: string | null = null;

export function createAgentPrompt(
  iaString: string,
  pageUrl: string,
  pageTitle: string,
  elementsString: string,
  testContext: string,
  actionHistory: Action[],
  isStuck: boolean,
): string {

  if (!promptTemplate) {
    promptTemplate = fs.readFileSync(path.join(__dirname, 'prompt.txt'), 'utf-8');
  }

  const recentHistory = actionHistory.slice(-15);

  const contextPrompt = testContext
    ? `
[Your Goal]
You have a specific mission. Analyze the user's request and the current screen to achieve the goal.
---
${testContext}
---
`
    : `[Your Goal]
Your primary goal is to explore the given website URL, understand its structure, and test its functionalities.`;

  const historyPrompt = recentHistory.length > 0
    ? `
[Action History]
You have already performed these actions. Learn from them. Do not repeat the same action if it is not producing results.
---
${recentHistory.map((a, i) => `Step ${actionHistory.length - recentHistory.length + i + 1}: ${a.description}`).join('\n')}
---
`
    : '';

  const stuckPrompt = isStuck
    ? `
[IMPORTANT]
You seem to be stuck in a loop repeating the same action. You MUST try a different action.
`
    : '';
  
  let prompt = promptTemplate;
  prompt = prompt.replace('{stuckPrompt}', stuckPrompt);
  prompt = prompt.replace('{contextPrompt}', contextPrompt);
  prompt = prompt.replace('{historyPrompt}', historyPrompt);
  prompt = prompt.replace('{pageUrl}', pageUrl);
  prompt = prompt.replace('{pageTitle}', pageTitle);
  prompt = prompt.replace('{iaString}', iaString);
  prompt = prompt.replace('{elementsString}', elementsString);

  return prompt;
}

let reportPromptTemplate: string | null = null;

export function createReport(testContext: string, actionHistory: Action[]): string {
  if (!reportPromptTemplate) {
    reportPromptTemplate = fs.readFileSync(path.join(__dirname, 'report_prompt.txt'), 'utf-8');
  }

  const historyString = actionHistory
    .map((a, i) => {
      let log = `Step ${i + 1}: ${a.description}`;
      if (a.error) {
        log += `\n  - Error: ${a.error}`;
      }
    //   return log;
    })
    .join('\n');

  let prompt = reportPromptTemplate;
  prompt = prompt.replace('{testContext}', testContext);
  prompt = prompt.replace('{actionHistory}', historyString);
  return prompt;
}


export function parseAiActionResponse(responseText: string): AiActionResponse {
  try {
    if (!responseText) {
      throw new Error('AI response text is empty or undefined.');
    }
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
    if (!jsonMatch || !jsonMatch[1]) {
      return JSON.parse(responseText) as AiActionResponse;
    };
    return JSON.parse(jsonMatch[1]) as AiActionResponse;
  } catch (e: any) {
    console.error("Failed to parse AI action response JSON. Error:", e, "Original Response:", responseText);
    throw new Error("Failed to parse AI action response.");
  }
}