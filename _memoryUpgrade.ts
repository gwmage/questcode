import * as fs from 'fs';
import * as path from 'path';

// ==================================================================
// 1. ai.service.ts 최종본
// ==================================================================
const aiServiceContent = `
import axios from 'axios';
import { config } from 'dotenv';
import { Action } from './cli'; // Import Action from cli.ts

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
You have already performed these actions. Learn from them. Do not repeat the same action if it is not producing results.
---\n\${actionHistory.map((a, i) => \`Step \${i+1}: \${a.description}\`).join('\n')}\n---
\`
    : '';

  const stuckPrompt = isStuck
    ? \`
[IMPORTANT]
You seem to be stuck in a loop repeating the same action. You MUST try a different action. For example, after typing in a search bar, you should probably click the search button.
\`
    : '';

  return \`
You are a superhuman QA agent. You think step-by-step.
\${stuckPrompt}
\${contextPrompt}
\${historyPrompt}

[Current State]
- URL: \${pageUrl}
- Title: \${pageTitle}
- IA Map: \${iaString}
- Interactive Elements: \${elementsString}

[Your Task]
1.  **Analyze Goal & History:** What is your main objective? What have you already tried?
2.  **Analyze State:** Where are you now? What can you interact with?
3.  **Reason Step-by-Step:** Based on all the information above, what is the single most logical next action?
4.  **Decide & Formulate:** Choose a decision ('act', 'crawl', 'finish') and create the corresponding action object.

[Output Format]
You MUST respond ONLY with a single JSON object in a markdown block. Provide all fields, including 'reasoning'.

**Example (Typing into search bar):**
\\\`\\\`\\\`json
{
  "decision": "act",
  "reasoning": "The goal is to search. I see a search input, so I will type into it first.",
  "action": { "type": "type", "locator": "textarea[aria-label='Search']", "value": "Playwright", "description": "Type 'Playwright' into the search bar." }
}
\\\`\\\`\\\`
**Example (Clicking search button AFTER typing):**
\\\`\\\`\\\`json
{
  "decision": "act",
  "reasoning": "I have already typed 'Playwright' into the search bar. Now I need to click the search button to proceed.",
  "action": { "type": "click", "locator": "input[aria-label='Google Search']", "description": "Click the Google Search button." }
}
\\\`\\\`\\\`
\`;
}

export function parseAiActionResponse(responseText: string): AiActionResponse {
  try {
    const jsonMatch = responseText.match(/\\\`\\\`\\\`json\\s*([\\s\\S]*?)\\s*\\\`\\\`\\\`/);
    if (!jsonMatch || !jsonMatch[1]) throw new Error('No JSON code block found in the AI response.');
    return JSON.parse(jsonMatch[1]) as AiActionResponse;
  } catch (e: any) {
    console.error("Failed to parse AI action response JSON. Error:", e, "Original Response:", responseText);
    throw new Error("Failed to parse AI action response.");
  }
}
`;

// ==================================================================
// 2. cli.ts 최종본
// ==================================================================
const cliContent = `
import { chromium, Page } from 'playwright';
import { config } from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { IANode, loadIA, saveIA, findNodeByUrl, addNodeToIA } from './ia';
import { nurieRequest, createAgentPrompt, parseAiActionResponse } from './ai.service';

config();

export interface Action {
  type: string;
  locator?: string;
  value?: string;
  description: string;
}

async function getInteractiveElements(page: Page) {
    const elements = await page.evaluate(() =>
        Array.from(document.querySelectorAll('a, button, input, textarea, select, [role="button"], [onclick]'))
        .map(el => {
            const element = el as HTMLElement;
            return {
                tag: element.tagName.toLowerCase(),
                'aria-label': element.getAttribute('aria-label'),
                text: element.innerText.trim().slice(0, 100),
                placeholder: element.getAttribute('placeholder'),
                locator: ''
            };
        })
    );
    for (const el of elements) {
        if (el['aria-label']) {
            el.locator = \`\${el.tag}[aria-label='\${el['aria-label']}']\`;
        } else if (el.text) {
            el.locator = \`\${el.tag}:has-text('\${el.text}')\`;
        } else if (el.placeholder) {
            el.locator = \`\${el.tag}[placeholder='\${el.placeholder}']\`;
        }
    }
    return elements;
}

async function crawlSite(page: Page, iaTree: IANode, baseUrl: string) {
    console.log(\`🗺️  Crawling page: \${page.url()}\`);
    const links = await page.evaluate(() => Array.from(document.querySelectorAll('a')).map(a => a.href));
    const origin = new URL(baseUrl).origin;
    for (const link of links) {
        if (!link || !link.startsWith(origin)) continue;
        const pageUrl = new URL(link).href;
        addNodeToIA(iaTree, page.url(), { url: pageUrl, title: '', status: 'unvisited' });
    }
}

function checkStuck(actionHistory: Action[]): boolean {
    if (actionHistory.length < 5) return false;
    const lastFiveActions = actionHistory.slice(-5);
    const firstActionDescription = lastFiveActions[0].description;
    return lastFiveActions.every(a => a.description === firstActionDescription);
}

async function main() {
    const startUrl = process.argv[2];
    if (!startUrl) {
        console.error('Please provide a starting URL.');
        process.exit(1);
    }

    const iaFilePath = path.join(process.cwd(), 'ia.json');
    const reportFilePath = path.join(process.cwd(), 'QA-Report.md');
    const contextFilePath = path.join(process.cwd(), 'test-context.md');

    let iaTree = await loadIA(iaFilePath, startUrl);
    let testContext = fs.existsSync(contextFilePath) ? fs.readFileSync(contextFilePath, 'utf-8') : '';
    if(testContext) console.log('✅ 테스트 컨텍스트 파일을 불러왔습니다.');

    const browser = await chromium.launch({ headless: false });
    const browserContext = await browser.newContext();
    const page = await browserContext.newPage();
    await page.goto(startUrl, { waitUntil: 'networkidle', timeout: 60000 });

    const actionHistory: Action[] = [];
    let step = 0;
    while (true) {
        step++;
        console.log(\`\n>>>>> [ 스텝 \${step} ] <<<<< \`);

        const pageUrl = page.url();
        let currentNode = findNodeByUrl(iaTree, pageUrl);
        if (!currentNode) {
            addNodeToIA(iaTree, iaTree.url, { url: pageUrl, title: '', status: 'in-progress'});
            currentNode = findNodeByUrl(iaTree, pageUrl);
        }
        if(currentNode) {
            currentNode.status = 'visited';
            currentNode.title = await page.title();
        }

        const interactiveElements = await getInteractiveElements(page);
        const elementsString = JSON.stringify(interactiveElements, null, 2);
        const iaString = JSON.stringify(iaTree, null, 2);
        
        const isStuck = checkStuck(actionHistory);
        if (isStuck) console.warn('🚨 에이전트가 루프에 빠진 것 같습니다. 새로운 지시를 추가합니다.');

        const prompt = createAgentPrompt(iaString, pageUrl, currentNode?.title ?? '', elementsString, testContext, actionHistory, isStuck);

        console.log('🤖 AI에게 현재 상황에서 최선의 행동을 묻습니다...');
        const aiRawResponse = await nurieRequest(prompt);
        if (!aiRawResponse || !aiRawResponse.text) {
            console.error('❌ AI로부터 유효한 응답을 받지 못했습니다.');
            continue;
        }

        let aiResponse;
        try {
            aiResponse = parseAiActionResponse(aiRawResponse.text);
        } catch (e: any) {
            console.error(e.message);
            continue;
        }
        
        console.log(\`🧠 AI의 판단: \${aiResponse.reasoning}\`);
        console.log(\`▶️  실행: \${aiResponse.action.description}\`);
        actionHistory.push(aiResponse.action);

        if (aiResponse.decision === 'finish') {
            console.log('✅ AI가 작업을 완료했습니다.');
            if (aiResponse.action.type === 'generate_report') {
                fs.writeFileSync(reportFilePath, aiResponse.action.description, 'utf-8');
                console.log(\`📝 QA 보고서가 \${reportFilePath}에 저장되었습니다.\`);
            }
            break;
        }

        if (aiResponse.decision === 'act') {
            const { type, locator, value, description } = aiResponse.action;
            try {
                if (type === 'click') {
                    if(!locator) throw new Error('Locator is required for click action.');
                    await page.locator(locator).first().click({ timeout: 10000 });
                } else if (type === 'type') {
                    if(!locator || value === undefined) throw new Error('Locator and value are required for type action.');
                    await page.locator(locator).first().fill(value, { timeout: 10000 });
                }
                await page.waitForTimeout(3000);
            } catch(e: any) {
                console.error(\`❌ 행동 '\${description}' 실패: \${e.message}\`);
                if(currentNode) currentNode.status = 'failed';
            }
        } else if (aiResponse.decision === 'crawl') {
            await crawlSite(page, iaTree, startUrl);
        }
        await saveIA(iaFilePath, iaTree);
    }

    await saveIA(iaFilePath, iaTree);
    await browser.close();
    console.log('✅ 모든 작업이 성공적으로 완료되었습니다.');
}

main().catch(err => {
    console.error('모든 작업 실패:', err);
    process.exit(1);
});
`;

try {
    const aiServicePath = path.join(__dirname, 'src', 'ai.service.ts');
    fs.writeFileSync(aiServicePath, aiServiceContent.trim(), 'utf8');
    console.log('Successfully upgraded src/ai.service.ts');

    const cliPath = path.join(__dirname, 'src', 'cli.ts');
    fs.writeFileSync(cliPath, cliContent.trim(), 'utf8');
    console.log('Successfully upgraded src/cli.ts');
} catch (err) {
    console.error('Error writing files:', err);
} 