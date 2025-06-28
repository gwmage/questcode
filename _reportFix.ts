import * as fs from 'fs';
import * as path from 'path';

const finalAiServiceContent = \`
import axios from 'axios';
import { config } from 'dotenv';
import { Action } from './cli';

config();

export interface AiActionResponse {
  decision: 'plan' | 'act' | 'objective_complete' | 'finish';
  reasoning: string;
  action: Action | { type: 'set_plan'; plan: string[] } | { type: 'no_op' } | { type: 'generate_report'; description: string };
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
      Authorization: \\\`Bearer \\\${apiKey}\\\`,
    },
  };
  try {
    const response = await axios.post(process.env.NURIE_API as string, requestBody, requestConfig);
    return response.data;
  } catch (error: any) {
    console.error('AI 요청 실패:', error.response?.status, error.response?.data);
    throw new Error(\\\`Request failed with status code \\\${error.response?.status}\\\`);
  }
}

export function createInitialPlannerPrompt(testContext: string): string {
  return \\\`
You are a master QA planner. Your task is to create a high-level, step-by-step test plan based on the user's request.
The plan should be a list of simple, achievable objectives.

[User's Request]
---
\\\${testContext}
---

[Your Task]
Based on the user's request, generate a test plan as a JSON array of strings.

[Output Format]
You MUST respond ONLY with a single JSON object in a markdown block.

**Example:**
\\\\\\\`\\\\\\\`\\\\\\\`json
{
  "decision": "plan",
  "reasoning": "I will create a test plan based on the user's request to log in, create a project, and then log out.",
  "action": {
    "type": "set_plan",
    "plan": [
      "Navigate to the eposo.ai website.",
      "Log in to the application using the provided credentials.",
      "Create a new project with the name 'Automated QA Project'.",
      "Verify the project has been created successfully.",
      "Log out from the application."
    ]
  }
}
\\\\\\\`\\\\\\\`\\\\\\\`
\\\`;
}

export function createAgentPrompt(
  pageUrl: string,
  elementsString: string,
  testPlan: string[],
  completedSteps: any[],
  actionHistory: Action[],
): string {
  
  const nextObjective = testPlan[completedSteps.length];
  const recentHistory = actionHistory.slice(-15);

  return \\\`
You are a superhuman, relentless QA agent. Your mission is to execute the test plan perfectly.

[The Overall Plan]
You are executing the following plan.
---
\\\${testPlan.map((step, i) => \`\\\${i + 1}. \\\${step} \\\${completedSteps.find(cs => cs.objective === step) ? '(Success)' : ''}\`).join('\\\\n')}
---

[Your Current Objective]
**\\\${nextObjective}**

[Recent Action & Failure History]
---
\\\${recentHistory.map((a, i) => \`Step \\\${actionHistory.length - recentHistory.length + i + 1}: \\\${a.description}\`).join('\\\\n')}
---

[Current Screen State]
- URL: \\\${pageUrl}
- Interactive Elements (Top 50): \\\${elementsString}

[Your Task]
1.  **Analyze Objective & State:** Is the current objective already complete based on the current state?
2.  **Decide & Formulate:**
    -   If the current objective is **ALREADY COMPLETE**, you MUST choose the \`objective_complete\` decision.
    -   If the current objective is **NOT YET COMPLETE**, you MUST choose the \`act\` decision and formulate the single most logical action to achieve it.
    -   If ALL objectives are done, or if you are completely stuck after many attempts, you MUST choose the \`finish\` decision. When you do, you MUST ALSO include the \`generate_report\` action, providing a detailed summary of what was accomplished and what failed.

[Output Format]
You MUST respond ONLY with a single JSON object in a markdown block.

**Example (Objective is already complete):**
\\\\\\\`\\\\\\\`\\\\\\\`json
{
  "decision": "objective_complete",
  "reasoning": "My current objective is to navigate to the eposo.ai website. The current URL shows I am already on this page, so this objective is complete. I will proceed to the next objective.",
  "action": { "type": "no_op" }
}
\\\\\\\`\\\\\\\`\\\\\\\`

**Example (Action needed):**
\\\\\\\`\\\\\\\`\\\\\\\`json
{
  "decision": "act",
  "reasoning": "My objective is to log in. I see a 'Login' button, so I will click it.",
  "action": { "type": "click", "locator": "button:has-text('Login')", "description": "Click the Login button." }
}
\\\\\\\`\\\\\\\`\\\\\\\`

**Example (Finishing with a report):**
\\\\\\\`\\\\\\\`\\\\\\\`json
{
  "decision": "finish",
  "reasoning": "I have attempted to log in and create a project multiple times, but the website is not responding as expected, and I am stuck. I will now generate a final report.",
  "action": {
    "type": "generate_report",
    "description": "# QA Report for eposo.ai\\\\n\\\\n## Summary\\\\n**Test Failed.** The agent successfully logged in but was unable to create a project due to unresponsive UI elements. All attempts to click buttons on the settings page resulted in timeouts.\\\\n\\\\n## Details\\\\n- **Objective 1: Log in.** - Success\\\\n- **Objective 2: Create a new project.** - Failure\\\\n- **Objective 3: Log out.** - Skipped"
  }
}
\\\\\\\`\\\\\\\`\\\\\\\`
\\\`;
}

export function parseAiActionResponse(responseText: string): AiActionResponse {
  const jsonMatch = responseText.match(/\\\\\\\`\\\\\\\`\\\\\\\`json\\\\s*([\\\\s\\\\S]*?)\\\\s*\\\\\\\`\\\\\\\`\\\\\\\`/);
  if (!jsonMatch || !jsonMatch[1]) {
    throw new Error('No JSON code block found in the AI response.');
  }
  const jsonString = jsonMatch[1];
  try {
    return JSON.parse(jsonString);
  } catch (e: any) {
    console.error("Failed to parse AI action response JSON. Error:", e, "Original Response:", responseText);
    throw new Error("Failed to parse AI action response.");
  }
}
\`;

try {
    const aiServicePath = path.join(__dirname, 'src', 'ai.service.ts');
    fs.writeFileSync(aiServicePath, finalAiServiceContent.trim(), 'utf8');
    console.log('✅ Successfully wrote final report-aware brain to src/ai.service.ts');
} catch (err) {
    console.error('❌ Error writing final report-aware brain:', err);
} 