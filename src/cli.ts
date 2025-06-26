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

interface ActionLogEntry {
  timestamp: string;
  pageUrl: string;
  pageTitle: string;
  scenario: string | null;
  action: AiResponse['action'];
  status: 'success' | 'failure';
  error?: string;
}

async function main() {
  let browser: any = null;
  const actionLog: ActionLogEntry[] = [];

  try {
    const url = process.argv[2];
    if (!url) {
      console.error('❌ 에러: 테스트할 URL을 입력해주세요. 예: npm run dev -- https://example.com');
      process.exit(1);
    }

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

    const testContext = await loadTestContext();
    if (testContext.instructions) {
      console.log('✅ 테스트 시나리오 로드 완료:\n', testContext.instructions);
    } else {
      console.log('ℹ️ 사용자 정의 테스트 시나리오가 없습니다.');
    }

    let sessionChatId: string | undefined = undefined;
    let currentScenario: string | null = null;
    let isLoggedIn = false;

    while (true) {
      const currentNode = findNextUnvisitedNode(ia);
      if (!currentNode) {
        console.log('\n\n✅ 모든 페이지 탐색 완료.');
        break;
      }

      console.log(`\n\n🕵️‍♂️ 페이지 탐색 시작: ${currentNode.url}`);
      currentNode.status = 'in-progress';

      try {
        await page.goto(currentNode.url, { waitUntil: 'networkidle', timeout: 30000 });
        currentNode.title = await page.title();
        console.log(`📄 페이지 제목: ${currentNode.title}`);
      } catch (e: any) {
        console.error(`❌ 페이지 이동 실패: ${currentNode.url}, 오류: ${e.message}`);
        currentNode.status = 'visited';
        currentNode.title = `GOTO_FAILED`;
        await saveIA(iaFilePath, ia);
        continue;
      }

      await discoverAndAddLinks(page, ia, currentNode);
      await saveIA(iaFilePath, ia);

      const pageActionHistory: AiResponse['action'][] = [];

      // --- Scenario Execution Loop ---
      for (let attempt = 0; attempt < 10; attempt++) { // Max 10 attempts per page to avoid infinite loops
          console.log(`\n🤖 AI에게 행동 요청 (시도 ${attempt + 1}/10, 현재 시나리오: ${currentScenario || '없음'})`);

          let interactiveElements = await getInteractiveElements(page);
          if (interactiveElements.length > MAX_ELEMENTS_FOR_PROMPT) {
              console.log(`⚠️ 요소가 너무 많습니다(${interactiveElements.length}개). AI에 전달할 요소를 ${MAX_ELEMENTS_FOR_PROMPT}개로 줄입니다.`);
              interactiveElements = interactiveElements.slice(0, MAX_ELEMENTS_FOR_PROMPT);
          }
          
          const agentPrompt = createAgentPrompt(currentNode, testContext, interactiveElements, currentScenario, pageActionHistory, isLoggedIn);
          const aiResponse = await robustNurieRequest(agentPrompt, { chatId: sessionChatId });
          sessionChatId = aiResponse.chatId;

          const result = parseAiResponse(aiResponse.text);

          if (result.action.type === 'finish_page') {
              console.log('💡 AI가 이 페이지의 모든 시나리오를 완료했다고 판단했습니다.');
              currentScenario = null;
              break; // Exit scenario loop for this page
          }

          currentScenario = result.scenario; // Update current scenario

          try {
              const originalUrl = page.url();
              console.log(`▶️  실행: ${result.action.type} on ${result.action.locator || 'N/A'} (${result.action.description})`);
              await executeAction(page, result.action, testContext);
              pageActionHistory.push(result.action);
              actionLog.push({
                timestamp: new Date().toISOString(),
                pageUrl: currentNode.url,
                pageTitle: currentNode.title || '',
                scenario: result.scenario,
                action: result.action,
                status: 'success'
              });

              if (!isLoggedIn && result.scenario?.toLowerCase().includes('login')) {
                  await page.waitForTimeout(3000); // Wait for navigation after login action
                  const newUrl = page.url();
                  if (originalUrl !== newUrl && !newUrl.includes('login')) {
                      isLoggedIn = true;
                      console.log('✅ 로그인 성공으로 판단되어 상태를 업데이트합니다.');
                  }
              }

              const newUrl = page.url();
              if (newUrl !== originalUrl && !newUrl.startsWith('chrome-error')) {
                  const newHostname = new URL(newUrl).hostname;
                  if (newHostname.endsWith(baseHostname)) {
                      console.log(`✨ URL 변경 감지! 현재 페이지 탐색을 중단하고 새 URL로 이동합니다.`);
                      if (!findNodeByUrl(ia, newUrl)) {
                          addNodeToIA(ia, currentNode.url, { url: newUrl, title: 'TBD', status: 'unvisited' });
                      }
                      currentScenario = null; // Reset scenario on URL change
                      break; 
                  } else {
                      console.log(`🛂 외부 URL(${newUrl})로의 이동을 감지하여 이전 페이지로 돌아갑니다.`);
                      await page.goBack();
                  }
              }
          } catch (e: any) {
              console.error(`❌ '${result.action.description}' 행동 실행 중 오류 발생: ${e.message}`);
              actionLog.push({
                timestamp: new Date().toISOString(),
                pageUrl: currentNode.url,
                pageTitle: currentNode.title || '',
                scenario: result.scenario,
                action: result.action,
                status: 'failure',
                error: e.message
              });
              console.log('🛑 현재 시나리오 실행을 중단합니다.');
              currentScenario = null; // Reset scenario on error
              break;
          }
      }
      // --- End Scenario Execution Loop ---
      
      currentNode.status = 'visited';
      console.log(`✅ 페이지 탐색 완료: ${currentNode.url}`);
      await saveIA(iaFilePath, ia);
    }

    console.log('\n\n===== 모든 테스트가 성공적으로 완료되었습니다. =====\n');
    await generateQAReport(ia, actionLog, testContext.instructions);
    console.log(JSON.stringify(ia, null, 2));
  } catch (error) {
    console.error('스크립트 실행 중 치명적인 오류가 발생했습니다.', error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

async function generateQAReport(ia: IANode, actionLog: ActionLogEntry[], instructions: string) {
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
  
  report += `## 🎯 테스트 목표 (사용자 지침)\n`;
  report += `\`\`\`\n${instructions}\n\`\`\`\n\n`;

  report += `## 📊 테스트 통계\n`;
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
      report += `### ❌ ${log.action.description}\n`;
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
    const reportPath = path.join(__dirname, '..', 'QA-Report.md');
    await fs.writeFile(reportPath, report);
    console.log(`✅ QA 보고서가 'QA-Report.md' 파일로 생성되었습니다.`);
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

function createAgentPrompt(
  currentNode: IANode,
  testContext: { instructions: string },
  elements: any[],
  currentScenario: string | null,
  pageActionHistory: AiResponse['action'][],
  isLoggedIn: boolean
): string {
  const scenarioStatus = currentScenario 
    ? `You are currently in the middle of this scenario: "${currentScenario}". Your task is to decide the next single action to continue it.`
    : `You are not currently working on a scenario. Your task is to look at the user's goals and the page, pick the most important scenario, and define the FIRST single action to start it.`;

  const historySection = pageActionHistory.length > 0
    ? `
**[Recent Actions on this Page]**
You have already performed these actions. Do not repeat them unless necessary.
\`\`\`json
${JSON.stringify(pageActionHistory, null, 2)}
\`\`\`
` : '';

  return `
You are a superhuman QA automation engineer. Your mission is to progress through user-given scenarios one step at a time.

**[Primary Scenarios from User]**
\`\`\`
${testContext.instructions}
\`\`\`

**[Your Current State]**
- Current Page URL: ${currentNode.url}
- Login Status: ${isLoggedIn ? 'You are considered logged in. Do not try to log in again.' : 'You are not logged in.'}
- Scenario Status: ${scenarioStatus}
${historySection}
**[Interactive Elements on Current Page]**
\`\`\`json
${JSON.stringify(elements, null, 2)}
\`\`\`

**[Your Task & Action Rules]**
1.  **Analyze your state:** Read the scenario status and recent actions.
2.  **Decide the next single action:** Based on the elements and your history, choose the one best action to progress the scenario.
3.  **Action Types:** Your action \`type\` MUST be one of: \`click\`, \`fill\`, \`finish_page\`.
    - Use \`click\` to click buttons, links, etc.
    - Use \`fill\` to type into input fields.
    - Use \`finish_page\` when all scenarios on the current page are complete.
4.  **Mandatory fields:** 
    - \`click\` and \`fill\` actions require a \`locator\`.
    - \`fill\` action requires a \`value\`.
    - \`description\` is required for all actions.

**[Output Format]**
Your entire output MUST be ONLY a single JSON object inside a \`\`\`json ... \`\`\` block. The JSON object must have two keys: "scenario" and "action".
- "scenario": A string describing the high-level scenario you are currently working on. If you are finishing, set this to null.
- "action": An object describing the single action to perform.

**Example: Starting a "Login" scenario**
\`\`\`json
{
  "scenario": "Log in with email and password.",
  "action": {
    "type": "click",
    "locator": "button:has-text(\\"Email Login\\")",
    "description": "Click the 'Email Login' button to reveal the input fields."
  }
}
\`\`\`

**Example: Continuing a "Login" scenario (after clicking the button)**
\`\`\`json
{
  "scenario": "Log in with email and password.",
  "action": {
    "type": "fill",
    "locator": "input[name='email']",
    "value": "%%TEST_USER_EMAIL%%",
    "description": "Enter the test user's email."
  }
}
\`\`\`

**Example: Finishing the page**
\`\`\`json
{
  "scenario": null,
  "action": {
    "type": "finish_page",
    "description": "All scenarios on this page are complete."
  }
}
\`\`\`
`;
}

interface AiResponse {
  scenario: string | null;
  action: {
    type: string;
    locator?: string;
    value?: string;
    description: string;
  };
}

function parseAiResponse(responseText: string): AiResponse {
  if (!responseText) {
    throw new Error("AI 응답이 비어있습니다.");
  }
  try {
    const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/);
    if (!jsonMatch) {
      throw new Error("AI 응답에서 JSON 블록을 찾지 못했습니다.");
    }
    return JSON.parse(jsonMatch[1]) as AiResponse;
  } catch (e: any) {
    console.error("AI 응답 JSON을 파싱하는 데 실패했습니다.", e, "\nOriginal response:", responseText);
    throw new Error("AI 응답 파싱 실패");
  }
}

async function executeAction(page: Page, action: { type: string, locator?: string, value?: string }, testContext: { email: string, password: string }) {
  const { type: actionType, locator, value } = action;

  if (actionType === 'finish_page') return;
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
