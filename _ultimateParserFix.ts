import * as fs from 'fs';
import * as path from 'path';

const finalAiServiceContent = `
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
      Authorization: \`Bearer \${apiKey}\`,
    },
  };
  try {
    const response = await axios.post(process.env.NURIE_API as string, requestBody, requestConfig);
    return response.data;
  } catch (error: any) {
    console.error('AI 요청 실패:', error.response?.status, error.response?.data);
    throw new Error(\`Request failed with status code \${error.response?.status}\`);
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
    ? \`
[Your Goal]
You have a specific mission. Analyze the user's request and the current screen to achieve the goal.
---
\${testContext}
---
\`
    : \`[Your Goal]
Your primary goal is to explore the given website URL, understand its structure, and test its functionalities.\`;

  const historyPrompt = actionHistory.length > 0
    ? \`
[Action History]
You have already performed these actions. Pay close attention to actions that FAILED.
If an action failed, analyze the error message, and try a different approach. Do NOT repeat the failed action.
---
\${actionHistory.map((a, i) => \`Step \${i + 1}: \${a.description}\`).join('\\n')}
---
\`
    : '';

  const stuckPrompt = isStuck
    ? \`
[IMPORTANT]
You seem to be stuck in a loop repeating the same action. You MUST try a different action.
\`
    : '';

  return \`
You are a superhuman QA agent. You think step-by-step. You are relentless.
\${stuckPrompt}
\${contextPrompt}
\${historyPrompt}

[Current State]
- URL: \${pageUrl}
- Title: \${pageTitle}
- IA Map: \${iaString}
- Interactive Elements: \${elementsString}

[Your Task]
1.  **Analyze Goal & History:** What is your main objective? What have you already tried? Pay close attention to FAILED actions.
2.  **Analyze State:** Where are you now? What can you interact with on the screen?
3.  **Reason Step-by-Step:** Based on all info, what is the single most logical next action? If you fail, DO NOT GIVE UP. Analyze the failure and devise a creative new approach to achieve your goal.
4.  **Decide & Formulate:** Choose a decision ('act', 'crawl', 'finish'). When finishing (either by success or by total failure), you MUST generate a report.

[Output Format]
You MUST respond ONLY with a single JSON object in a markdown block. For the report description, you MUST use \\\\n for newlines to create a valid JSON string.

**Example (Finishing with a Report after getting stuck):**
\\\`\\\`\\\`json
{
  "decision": "finish",
  "reasoning": "I have exhausted all possible options and will now conclude the test by generating a report.",
  "action": {
    "type": "generate_report",
    "description": "# QA Report: eposo.ai Login Test\\\\n\\\\n## Summary\\\\n**Test Failed.** The agent was unable to log in after multiple attempts.\\\\n\\\\n## Steps Taken\\\\n1. Navigated to eposo.ai (Success)\\\\n2. Clicked 'Login/Sign Up' (Success)\\\\n3. Typed email (Success)\\\\n4. Attempted to type password. (FAILED: Timeout)\\\\n\\\\n## Final Conclusion\\\\nThe agent could not reliably interact with the password field. Recommend manual review."
  }
}
\\\`\\\`\\\`
\`;
}

/**
 * A robust function to parse potentially malformed JSON from an AI response.
 * It specifically handles unescaped newlines within JSON string values.
 * @param responseText The raw text from the AI, expected to contain a JSON block.
 * @returns The parsed AiActionResponse object.
 */
export function parseAiActionResponse(responseText: string): AiActionResponse {
  const jsonMatch = responseText.match(/\\\`\\\`\\\`json\\s*([\\s\\S]*?)\\s*\\\`\\\`\\\`/);
  if (!jsonMatch || !jsonMatch[1]) {
    throw new Error('No JSON code block found in the AI response.');
  }

  let jsonString = jsonMatch[1];

  // The AI might forget to escape newlines in the multi-line 'description' field.
  // This robustly fixes that before parsing.
  try {
    // A simple parse first, for well-formed JSON
    return JSON.parse(jsonString);
  } catch (e) {
    // If it fails, try to fix common errors, like unescaped newlines in descriptions
    const fixedJsonString = jsonString.replace(/"description"\s*:\s*"([\s\S]*?)"/g, (match, descContent) => {
        const escapedContent = descContent.replace(/\\n/g, "\\\\n").replace(/\\r/g, "\\\\r").replace(/"/g, '\\\\"');
        return \`"description": "\${escapedContent}"\`;
    });
    
    try {
        return JSON.parse(fixedJsonString);
    } catch (finalError) {
        console.error("Failed to parse AI action response JSON even after fixing. Error:", finalError, "Original Response:", responseText);
        throw new Error("Failed to parse AI action response.");
    }
  }
}
`;

try {
    const aiServicePath = path.join(__dirname, 'src', 'ai.service.ts');
    fs.writeFileSync(finalAiServiceContent.trim(), 'utf8');
    console.log('Successfully applied the ultimate parser fix to src/ai.service.ts.');
} catch (err) {
    console.error('Error writing the ultimate parser fix script:', err);
} 