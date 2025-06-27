import axios from 'axios';
import { config } from 'dotenv';
import { Action } from './cli';

config();

export interface AiActionResponse {
  decision: 'act' | 'crawl' | 'finish';
  reasoning: string;
  action: Action;
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
    return response.data;
  } catch (error: any) {
    console.error('AI 요청 실패:', error.response?.status, error.response?.data);
    throw new Error(`Request failed with status code ${error.response?.status}`);
  }
}

export function createAgentPrompt(
  iaString: string,
  pageUrl: string,
  pageTitle: string,
  elementsString: string,
  testContext: string,
  actionHistory: Action[],
  isStuck: boolean,
): string {
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

  const historyPrompt = actionHistory.length > 0
    ? `
[Action History]
You have already performed these actions. Learn from them. Do not repeat the same action if it is not producing results.
---
${actionHistory.map((a, i) => `Step ${i+1}: ${a.description}`).join('\n')}
---
`
    : '';

  const stuckPrompt = isStuck
    ? `
[IMPORTANT]
You seem to be stuck in a loop repeating the same action. You MUST try a different action. For example, after typing in a search bar, you should probably click the search button.
`
    : '';

  return `
You are a superhuman QA agent. You think step-by-step.
${stuckPrompt}
${contextPrompt}
${historyPrompt}

[Current State]
- URL: ${pageUrl}
- Title: ${pageTitle}
- IA Map: ${iaString}
- Interactive Elements: ${elementsString}

[Your Task]
1.  **Analyze Goal & History:** What is your main objective? What have you already tried?
2.  **Analyze State:** Where are you now? What can you interact with?
3.  **Reason Step-by-Step:** Based on all the information above, what is the single most logical next action?
4.  **Decide & Formulate:** Choose a decision ('act', 'crawl', 'finish') and create the corresponding action object.

[Output Format]
You MUST respond ONLY with a single JSON object in a markdown block. Provide all fields, including 'reasoning'.

**Example (Typing into search bar):**
\`\`\`json
{
  "decision": "act",
  "reasoning": "The goal is to search. I see a search input, so I will type into it first.",
  "action": { "type": "type", "locator": "textarea[aria-label='Search']", "value": "Playwright", "description": "Type 'Playwright' into the search bar." }
}
\`\`\`
**Example (Clicking search button AFTER typing):**
\`\`\`json
{
  "decision": "act",
  "reasoning": "I have already typed 'Playwright' into the search bar. Now I need to click the search button to proceed.",
  "action": { "type": "click", "locator": "input[aria-label='Google Search']", "description": "Click the Google Search button." }
}
\`\`\`
`;
}

export function parseAiActionResponse(responseText: string): AiActionResponse {
  try {
    const jsonMatch = responseText.match(/\`\`\`json\s*([\s\S]*?)\s*\`\`\`/);
    if (!jsonMatch || !jsonMatch[1]) throw new Error('No JSON code block found in the AI response.');
    return JSON.parse(jsonMatch[1]) as AiActionResponse;
  } catch (e: any) {
    console.error("Failed to parse AI action response JSON. Error:", e, "Original Response:", responseText);
    throw new Error("Failed to parse AI action response.");
  }
}