import { chromium } from 'playwright-extra';
import { Page, Route } from 'playwright';
import stealth from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs/promises';
import * as path from 'path';
import { nurieRequest } from './ai.service';
import { IANode, loadIA, saveIA, findNextUnvisitedNode, addNodeToIA, findNodeByUrl } from './ia';
import dotenv from 'dotenv';

dotenv.config();
chromium.use(stealth());

const iaFilePath = path.join(__dirname, '..', 'ia.json');
const MAX_ELEMENTS_FOR_PROMPT = 150;

interface Scenario {
  id: number;
  instruction: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  attemptsOnPage: number;
}

interface Action {
  type: string;
  locator?: string;
  value?: string;
  description: string;
}

interface ActionLogEntry {
  timestamp: string;
  pageUrl: string;
  pageTitle: string;
  scenario: string | null;
  action: Action;
  status: 'success' | 'failure';
  error?: string;
}

interface AiNavigationResponse {
  decision: 'navigate' | 'execute_plan' | 'scenario_complete';
  reasoning: string;
  url?: string; // For 'navigate'
  plan?: { // For 'execute_plan'
    description: string;
    actions: Action[];
  }
}

async function main() {
  let browser: any = null;
  const actionLog: ActionLogEntry[] = [];
  let scenarios: Scenario[] = [];

  try {
    const url = process.argv[2];
    if (!url) {
      console.error('❌ 에러: 테스트할 URL을 입력해주세요. 예: npm run dev -- https://example.com');
      process.exit(1);
    }

    const testContext = await loadTestContext();
    scenarios = testContext.instructions
      .split('\n')
      .filter(line => line.trim().startsWith('- '))
      .map((line, index) => ({
        id: index,
        instruction: line.trim().substring(2).trim(),
        status: 'pending',
        attemptsOnPage: 0,
      }));

    let ia = await loadIA(iaFilePath, url);
    console.log('✅ IA 파일 로드/생성 완료.');

    browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({ locale: 'en-US' });
    const page: Page = await context.newPage();
    const baseHostname = new URL(url).hostname;

    await page.route('**/*', (route: Route) => {
      const requestUrl = route.request().url();
      if (new URL(requestUrl).hostname.endsWith(baseHostname)) {
        route.continue();
      } else {
        route.abort();
      }
    });

    if (testContext.instructions) {
      console.log('✅ 테스트 시나리오 로드 완료:\n', testContext.instructions);
    } else {
      console.log('ℹ️ 사용자 정의 테스트 시나리오가 없습니다.');
    }

    let sessionChatId: string | undefined = undefined;
    let currentScenario: Scenario | null = null;
    let isLoggedIn = false;
  
    console.log(`🚀 테스트를 시작합니다. 초기 URL로 이동: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle' });
  
    for (const scenario of scenarios) {
      currentScenario = scenario;
      currentScenario.status = 'in-progress';
      console.log(`\n\n🎯 새로운 시나리오 시작: "${currentScenario.instruction}"`);
      
      let attemptsForScenario = 0;
      let maxAttemptsForScenario = 20; // Max 20 steps (pages or plans) per scenario
  
      while(attemptsForScenario < maxAttemptsForScenario && currentScenario.status === 'in-progress') {
        attemptsForScenario++;
        console.log(`\n[시나리오: "${currentScenario.instruction}" | 스텝 ${attemptsForScenario}/${maxAttemptsForScenario}]`);
  
        const currentUrl = page.url();
        console.log(`📍 현재 위치: ${currentUrl}`);
        
        await discoverAndAddLinks(page, ia, findNodeByUrl(ia, currentUrl) || ia);
        await saveIA(iaFilePath, ia);
  
        const interactiveElements = await getInteractiveElements(page);
        const links = findNodeByUrl(ia, currentUrl)?.children.map(c => c.url) || [];
  
        const agentPrompt = createNavigationAgentPrompt(currentUrl, currentScenario, isLoggedIn, interactiveElements, links);
        const aiResponse = await robustNurieRequest(agentPrompt, { chatId: sessionChatId });
        sessionChatId = aiResponse.chatId;
        const result = parseAiNavigationResponse(aiResponse.text);
  
        console.log(`🤖 AI의 판단: ${result.reasoning}`);
  
        try {
          switch (result.decision) {
            case 'navigate':
              if (!result.url || !links.includes(result.url)) {
                throw new Error(`AI가 유효하지 않은 URL(${result.url})로 이동하려고 시도했습니다.`);
              }
              console.log(`🔀 탐색: ${result.url} 로 이동합니다.`);
              await page.goto(result.url, { waitUntil: 'networkidle' });
              break;
            
            case 'execute_plan':
              if (!result.plan) throw new Error("AI가 계획을 제공하지 않았습니다.");
              console.log(`▶️  실행: "${result.plan.description}" 계획을 시작합니다.`);
              for (const action of result.plan.actions) {
                console.log(`  - ${action.description}`);
                await executeAction(page, action, testContext);
                 actionLog.push({
                   timestamp: new Date().toISOString(),
                   pageUrl: currentUrl,
                   pageTitle: await page.title(),
                   scenario: currentScenario.instruction,
                   action: action,
                   status: 'success'
                 });
              }
              console.log(`✅ 계획 실행 완료.`);
              break;
            
            case 'scenario_complete':
              console.log(`🎉 시나리오 완료!`);
              currentScenario.status = 'completed';
              const instruction = currentScenario.instruction.toLowerCase();
              if (instruction.includes('로그인') || instruction.includes('login')) isLoggedIn = true;
              if (instruction.includes('로그아웃') || instruction.includes('logout')) isLoggedIn = false;
              break;
          }
        } catch (e: any) {
           console.error(`❌ 행동 실행 중 오류 발생: ${e.message}`);
           actionLog.push({
             timestamp: new Date().toISOString(),
             pageUrl: currentUrl,
             pageTitle: await page.title(),
             scenario: currentScenario.instruction,
             action: { type: 'error', description: 'Scenario failed' },
             status: 'failure',
             error: e.message
           });
           currentScenario.status = 'failed';
        }
      }
  
      if (currentScenario.status === 'in-progress') {
        console.log(`⚠️ 시나리오가 최대 스텝(${maxAttemptsForScenario})에 도달했지만 완료되지 않았습니다. 실패로 처리합니다.`);
        currentScenario.status = 'failed';
      }
    }
  
    console.log('\n\n===== 모든 테스트가 성공적으로 완료되었습니다. =====\n');
    await generateQAReport(ia, actionLog, scenarios);
  } catch (error) {
    console.error('스크립트 실행 중 치명적인 오류가 발생했습니다.', error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

async function generateQAReport(ia: IANode, actionLog: ActionLogEntry[], scenarios: Scenario[]) {
  const startTime = actionLog.length > 0 ? new Date(actionLog[0].timestamp) : new Date();
  const endTime = new Date();
  const duration = (endTime.getTime() - startTime.getTime()) / 1000 / 60; // in minutes

  const totalActions = actionLog.length;
  const failedActions = actionLog.filter(a => a.status === 'failure');
  const successRate = totalActions > 0 ? ((totalActions - failedActions.length) / totalActions) * 100 : 100;
  
  const visitedNodes: IANode[] = [];
  function collectVisitedNodes(node: IANode) {
    if (node.status === 'visited' || node.status === 'in-progress' || node.title === 'GOTO_FAILED') {
      visitedNodes.push(node);
    }
    node.children.forEach(collectVisitedNodes);
  }
  collectVisitedNodes(ia);

  let report = `# QA 테스트 자동화 보고서\n\n`;
  report += `**테스트 시작:** ${startTime.toLocaleString()}\n`;
  report += `**테스트 종료:** ${endTime.toLocaleString()} (${duration.toFixed(2)}분 소요)\n`;
  report += `**테스트 대상:** ${ia.url}\n\n`;
  
  report += `## 🎯 시나리오 기반 테스트 결과\n\n`;
  report += `| Status | Instruction |\n`;
  report += `| :--- | :--- |\n`;
  scenarios.forEach(s => {
    let statusIcon = '⏳';
    if(s.status === 'completed') statusIcon = '✅';
    if(s.status === 'failed') statusIcon = '❌';
    report += `| ${statusIcon} ${s.status} | ${s.instruction} |\n`;
  })
  report += '\n';

  report += `## 📊 액션 통계\n`;
  report += `| 항목 | 수치 |\n`;
  report += `| :--- | :--- |\n`;
  report += `| 방문한 페이지 수 | ${visitedNodes.length} |\n`;
  report += `| 수행한 총 액션 수 | ${totalActions} |\n`;
  report += `| 성공한 액션 | ${totalActions - failedActions.length} |\n`;
  report += `| **실패한 액션 (버그)** | **${failedActions.length}** |\n`;
  report += `| 성공률 | ${successRate.toFixed(2)}% |\n\n`;

  if (failedActions.length > 0) {
    report += `## 🐞 발견된 버그 및 오류\n\n`;
    failedActions.forEach(log => {
      report += `### ❌ ${log.action?.description || '오류'}\n`;
      report += `- **페이지:** [${log.pageTitle}](${log.pageUrl})\n`;
      report += `- **시나리오:** ${log.scenario}\n`;
      report += `- **오류 메시지:** \`${log.error}\`\n\n`;
    });
  }

  report += `## 📋 페이지별 상세 실행 로그\n\n`;
  const actionsByPage = new Map<string, ActionLogEntry[]>();
  actionLog.forEach(log => {
    const pageKey = `${log.pageUrl} (${log.pageTitle})`;
    if (!actionsByPage.has(pageKey)) {
      actionsByPage.set(pageKey, []);
    }
    actionsByPage.get(pageKey)?.push(log);
  });

  for (const [pageKey, logs] of actionsByPage.entries()) {
    report += `### 📄 ${pageKey}\n\n`;
    logs.forEach(log => {
      const statusIcon = log.status === 'success' ? '✅' : '❌';
      report += `- **[${log.status.toUpperCase()}]** ${statusIcon} ${log.action.description}\n`;
      if(log.status === 'failure') {
        report += `  - **에러:** ${log.error}\n`;
      }
    });
    report += `\n`;
  }
  
  try {
    await fs.writeFile('QA-Report.md', report, 'utf-8');
    console.log('✅ QA 보고서가 \'QA-Report.md\' 파일로 생성되었습니다.');
  } catch (error) {
    console.error('❌ QA 보고서 파일 생성에 실패했습니다.', error);
  }
}

async function discoverAndAddLinks(page: Page, ia: IANode, currentNode: IANode) {
  try {
    const newLinks = await page.evaluate((baseUrl: string) => {
      const baseHostname = new URL(baseUrl).hostname;
      return Array.from(document.querySelectorAll('a[href]')).map(el => (el as HTMLAnchorElement).href)
        .filter(href => {
          try {
            if (!href || href.startsWith('javascript:') || href.endsWith('#')) return false;
            const url = new URL(href);
            return url.hostname.endsWith(baseHostname);
          } catch (e) {
            return false;
          }
        });
    }, currentNode.url);

    let linksAdded = 0;
    for (const link of newLinks) {
      if (addNodeToIA(ia, currentNode.url, { url: link, title: 'TBD', status: 'unvisited' })) {
        linksAdded++;
      }
    }
    if (linksAdded > 0) {
      console.log(`🗺️  ${linksAdded}개의 새로운 링크를 발견하여 IA에 추가했습니다.`);
    }
  } catch(e: any) {
    console.warn(`링크 발견 중 오류 발생: ${e.message}`);
  }
}

async function loadTestContext(): Promise<{ email: string; password: string; instructions: string }> {
  try {
    const contextFilePath = path.join(__dirname, '..', 'test-context.md');
    const fileContent = await fs.readFile(contextFilePath, 'utf-8');
    const emailMatch = fileContent.match(/Email:\s*(.*)/);
    const passwordMatch = fileContent.match(/Password:\s*(.*)/);
    const instructionsMatch = fileContent.match(/Instructions:\s*([\s\S]*)/);
    return {
      email: emailMatch ? emailMatch[1].trim() : '',
      password: passwordMatch ? passwordMatch[1].trim() : '',
      instructions: instructionsMatch ? (instructionsMatch[1].trim() || 'Explore and test all features comprehensively.') : 'Explore and test all features comprehensively.'
    };
  } catch (error) {
    console.warn('⚠️ 경고: test-context.md 파일을 찾을 수 없습니다.');
    return { email: '', password: '', instructions: 'Explore and test all features comprehensively.' };
  }
}

async function getInteractiveElements(page: Page): Promise<any[]> {
  const selectors = [
    'a[href]', 'button:not([disabled])', 'input:not([type="hidden"]):not([disabled])',
    'select:not([disabled])', 'textarea:not([disabled])', '[role="button"]:not([disabled])',
    '[role="link"]:not([disabled])', '[tabindex]:not([tabindex="-1"])'
  ].join(', ');

  const allLocators = await page.locator(selectors).all();

  const elementsData = [];

  for (const locator of allLocators) {
      try {
          const isVisible = await locator.isVisible({ timeout: 100 });
          if (!isVisible) continue;

          const tagName = await locator.evaluate(el => el.tagName.toLowerCase());
          const role = (await locator.getAttribute('role')) || tagName;
          
          let value = '';
          if (['input', 'textarea', 'select'].includes(tagName)) {
              value = await locator.inputValue();
          }

          const name = (
              await locator.getAttribute('aria-label') ||
              await locator.innerText() ||
              value ||
              await locator.getAttribute('placeholder') ||
              ''
          ).trim().replace(/\s+/g, ' ');

          let genLocator = '';
          const id = await locator.getAttribute('id');
          const dataTestId = await locator.getAttribute('data-testid');
          const type = await locator.getAttribute('type');
          const placeholder = await locator.getAttribute('placeholder');

          if (id) {
              genLocator = `#${id}`;
          } else if (dataTestId) {
              genLocator = `[data-testid="${dataTestId}"]`;
          } else if (type === 'password') {
              genLocator = 'input[type="password"]';
          } else if (placeholder) {
              genLocator = `${role}[placeholder="${placeholder.replace(/"/g, '\\"')}"]`;
          } else {
              genLocator = `${role}:has-text("${name.substring(0, 50).replace(/"/g, '\\"')}")`;
          }

          elementsData.push({ role, name, locator: genLocator });
      } catch (e) {
          // Ignore elements that cause errors during inspection
          // console.warn(`Could not inspect element: ${e.message}`);
      }
  }

  const locatorCounts = new Map<string, number>();
  elementsData.forEach(el => {
    locatorCounts.set(el.locator, (locatorCounts.get(el.locator) || 0) + 1);
  });

  const processedElements: any[] = [];
  const locatorIndices = new Map<string, number>();
  for (const element of elementsData) {
    const count = locatorCounts.get(element.locator);
    if (count && count > 1) {
      const currentIndex = locatorIndices.get(element.locator) || 0;
      const newLocator = `${element.locator} >> nth=${currentIndex}`;
      processedElements.push({ ...element, locator: newLocator });
      locatorIndices.set(element.locator, currentIndex + 1);
    } else {
      processedElements.push(element);
    }
  }

  for (let i = processedElements.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [processedElements[i], processedElements[j]] = [processedElements[j], processedElements[i]];
  }
  return processedElements;
}

function createNavigationAgentPrompt(
  currentUrl: string,
  currentScenario: Scenario,
  isLoggedIn: boolean,
  elements: any[],
  links: string[]
): string {
  return `
You are a top-tier QA agent with a talent for strategic navigation.
Your mission is to achieve a single high-level goal. To do this, you must navigate a website, analyze pages, and execute actions.

**[Your High-Level Goal]**
"${currentScenario.instruction}"

**[Your Current State]**
- You are on page: ${currentUrl}
- Login Status: ${isLoggedIn ? 'You are logged in.' : 'You are NOT logged in.'}

**[Test Data Available]**
- When you need to enter an email, use the special value: "%%TEST_USER_EMAIL%%"
- When you need to enter a password, use the special value: "%%TEST_USER_PASSWORD%%"
- The system will replace these with the correct test credentials. Do NOT use any other email or password.

**[Analysis]**
1.  **Goal Check:** Is your High-Level Goal already complete, looking at the current page? If so, decide 'scenario_complete'.
2.  **Page Assessment:** Is this the right page to make progress on your goal?
    - If YES: Decide to 'execute_plan' and create a plan of actions.
    - If NO: Decide to 'navigate' to a better page.
3.  **Navigation Choice:** If navigating, which of the available links is the MOST promising to get you closer to your goal?

**[Available Interactive Elements on this Page]**
\`\`\`json
${JSON.stringify(elements.slice(0, 80), null, 2)}
\`\`\`

**[Available Links to Navigate To]**
\`\`\`json
${JSON.stringify(links, null, 2)}
\`\`\`

**[Your Decision & Output Format]**
You MUST output ONLY a single JSON object in a \`\`\`json ... \`\`\` block. Your decision MUST be one of three types:

1.  **If the goal is already met on this page:**
    \`\`\`json
    {
      "decision": "scenario_complete",
      "reasoning": "I have confirmed that the user is successfully logged in and on the dashboard."
    }
    \`\`\`

2.  **If you can make progress on THIS page:**
    \`\`\`json
    {
      "decision": "execute_plan",
      "reasoning": "This is the login page, so I will fill the form and click the login button.",
      "plan": {
        "description": "Fill and submit login form.",
        "actions": [
          { "type": "fill", "locator": "input[type=\\"email\\"]", "value": "%%TEST_USER_EMAIL%%", "description": "Enter email" },
          { "type": "fill", "locator": "input[type=\\"password\\"]", "value": "%%TEST_USER_PASSWORD%%", "description": "Enter password" },
          { "type": "click", "locator": "button:has-text(\\"Login\\")", "description": "Click login button" }
        ]
      }
    }
    \`\`\`

3.  **If this is the WRONG page and you need to navigate:**
    \`\`\`json
    {
      "decision": "navigate",
      "reasoning": "I am on the homepage, but I need to go to the settings page to change notifications. The '/settings' link is the most direct path.",
      "url": "https://example.com/settings"
    }
    \`\`\`
`;
}

function parseAiNavigationResponse(responseText: string): AiNavigationResponse {
  if (!responseText) {
    throw new Error("AI 응답이 비어있습니다.");
  }
  try {
    const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/);
    if (!jsonMatch) {
      throw new Error("AI 응답에서 JSON 블록을 찾지 못했습니다.");
    }
    // Pre-process the JSON string to remove trailing commas
    let jsonString = jsonMatch[1];
    jsonString = jsonString.replace(/,\s*([}\]])/g, '$1');
    
    return JSON.parse(jsonString) as AiNavigationResponse;
  } catch (e: any) {
    console.error("AI 응답 JSON을 파싱하는 데 실패했습니다.", e, "\nOriginal response:", responseText);
    throw new Error("AI 응답 파싱 실패");
  }
}

async function executeAction(page: Page, action: Action, testContext: { email: string, password: string }) {
  const { type: actionType, locator, value } = action;

  if (!locator) throw new Error("Action requires a locator, but it is missing.");

  let finalValue = value;
  if (value === '%%TEST_USER_EMAIL%%') finalValue = testContext.email;
  else if (value === '%%TEST_USER_PASSWORD%%') finalValue = testContext.password;

  const target = page.locator(locator).first();

  switch (actionType) {
    case 'click':
      await target.click({ timeout: 5000 });
      break;
    case 'fill':
      if (finalValue === undefined) throw new Error('fill action requires a value.');
      await target.fill(finalValue, { timeout: 5000 });
      break;
    default:
      console.error(`알 수 없는 액션 타입: ${actionType}`);
  }
}

async function robustNurieRequest(prompt: string, options: { retries?: number, chatId?: string } = {}): Promise<any> {
  const { retries = 3, chatId } = options;
  for (let i = 0; i < retries; i++) {
    try {
      return await nurieRequest(prompt, chatId);
    } catch (error: any) {
      console.warn(`AI 요청 실패, ${i + 1}/${retries}번째 재시도 중...`);
      if (i === retries - 1) {
        console.error("AI 요청에 최종적으로 실패했습니다.", error.message);
        throw error;
      }
      await new Promise(res => setTimeout(res, 2000 * (i + 1)));
    }
  }
  throw new Error("AI 요청에 실패했습니다.");
}

main();
