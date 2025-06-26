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

interface AiPlanResponse {
  reasoning: string;
  plan: Action[];
}

interface AiVerificationResponse {
  decision: 'continue' | 'replan' | 'fail';
  reasoning: string;
  new_plan?: Action[]; // only for 'replan'
}

interface AiActionResponse {
  decision: 'act' | 'finish';
  reasoning: string;
  action?: Action;
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
      
      for (let step = 0; step < 20; step++) { // Max 20 steps per scenario
        console.log(`\n[시나리오: "${currentScenario.instruction}" | 스텝 ${step + 1}/20]`);

        try {
          const currentUrl = page.url();
          const interactiveElements = await getInteractiveElements(page);
          const agentPrompt = createReactiveAgentPrompt(
            currentUrl,
            interactiveElements,
            actionLog,
            testContext,
            currentScenario.instruction
          );

          console.log('🤖 AI에게 현재 상황에서 최선의 행동을 묻습니다...');
          const aiResponse = await robustNurieRequest(agentPrompt, { chatId: sessionChatId });
          sessionChatId = aiResponse.chatId;
          const result = parseAiActionResponse(aiResponse.text);

          console.log(`🧠 AI의 판단: ${result.reasoning}`);

          if (result.decision === 'finish') {
            console.log('🎉 AI가 시나리오 완료를 선언했습니다.');
            currentScenario.status = 'completed';
            const instruction = currentScenario.instruction.toLowerCase();
            if (instruction.includes('로그인') || instruction.includes('login')) isLoggedIn = true;
            if (instruction.includes('로그아웃') || instruction.includes('logout')) isLoggedIn = false;
            break; // Exit step loop
          }

          if (!result.action) {
            throw new Error("AI가 행동을 결정했지만, 실제 행동이 제공되지 않았습니다.");
          }

          const action = result.action;
          console.log(`▶️  실행: ${action.description}`);
          await executeAction(page, action, testContext);
          actionLog.push({
            timestamp: new Date().toISOString(),
            pageUrl: currentUrl,
            pageTitle: await page.title(),
            scenario: currentScenario.instruction,
            action: action,
            status: 'success'
          });

          await page.waitForTimeout(1500); // Wait for UI to settle

        } catch (e: any) {
          console.error(`❌ 스텝 실행 중 치명적인 오류 발생: ${e.message}`);
          actionLog.push({
            timestamp: new Date().toISOString(),
            pageUrl: page.url(),
            pageTitle: await page.title(),
            scenario: currentScenario.instruction,
            action: { type: 'error', description: `Scenario failed at step ${step + 1}` },
            status: 'failure',
            error: e.message
          });
          currentScenario.status = 'failed';
          break; // Exit step loop
        }
      }
      
      if (currentScenario.status === 'in-progress') {
          console.log('⚠️ 시나리오가 최대 스텝에 도달했지만 완료되지 않았습니다. 실패로 처리합니다.');
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
  const elements = await page.evaluate(() => {
    const selectors = [
      'button',
      'a',
      'input:not([type="hidden"])',
      '[role="button"]',
      '[role="link"]',
      'select',
      'textarea',
      '[onclick]',
    ];

    const interactiveElements: any[] = [];
    document.querySelectorAll(selectors.join(', ')).forEach(el => {
      const element = el as HTMLElement;
      const isVisible = !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
      const isDisabled = (el as HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).disabled;

      if (isVisible && !isDisabled) {
        let labelText = '';
        // 1. Find explicit label using `for` attribute
        if (element.id) {
            const labelFor = document.querySelector(`label[for="${element.id}"]`) as HTMLLabelElement;
            if (labelFor) {
                labelText = labelFor.innerText.trim();
            }
        }
        // 2. Find parent label
        if (!labelText) {
            const parentLabel = element.closest('label');
            if (parentLabel) {
                labelText = parentLabel.innerText.trim();
            }
        }
        // 3. Find label by aria-labelledby
        if (!labelText && element.getAttribute('aria-labelledby')) {
            const labelEl = document.getElementById(element.getAttribute('aria-labelledby') || '');
            if(labelEl) labelText = labelEl.innerText.trim();
        }

        interactiveElements.push({
          tag: element.tagName.toLowerCase(),
          'aria-label': element.getAttribute('aria-label'),
          'placeholder': element.getAttribute('placeholder'),
          'text': element.innerText.trim().slice(0, 100),
          'value': (el as HTMLInputElement).value,
          'type': element.getAttribute('type'),
          'label': labelText, // Add the associated label text
        });
      }
    });
    return interactiveElements;
  });

  // Use Playwright's locator to generate robust selectors
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    let locator = '';
    
    // Normalize text for use in locators
    const normalizedText = el.text ? el.text.replace(/\s+/g, ' ').trim() : '';

    if (el.label && el.tag === 'input') {
        locator = `input[id="${el.id}"]`; // Prefer ID for labeled inputs
    } else if (normalizedText) {
      locator = `${el.tag}:has-text("${normalizedText.replace(/"/g, '\\"')}")`;
    } else if (el['aria-label']) {
      locator = `${el.tag}[aria-label="${el['aria-label'].replace(/"/g, '\\"')}"]`;
    } else if (el.placeholder) {
      locator = `${el.tag}[placeholder="${el.placeholder.replace(/"/g, '\\"')}"]`;
    } else if (el.type) {
        locator = `${el.tag}[type="${el.type}"]`;
    } else {
        // Fallback for elements without clear identifiers
        locator = `${el.tag}`;
    }

    const matchingLocators = await page.locator(locator).all();
    if (matchingLocators.length > 1) {
       // Find the specific index of the element
        const allPageElements = await page.locator(locator).all();
        let finalLocator = locator;
        for(let j=0; j < allPageElements.length; j++){
            const text = (await allPageElements[j].innerText()).replace(/\s+/g, ' ').trim();
            const value = await allPageElements[j].inputValue().catch(()=>'');
             if(text.slice(0, 100) === normalizedText && value === el.value){
                finalLocator = `${locator} >> nth=${j}`;
                break;
            }
        }
       elements[i].locator = finalLocator;
    } else {
      elements[i].locator = locator;
    }
  }

  return elements;
}

function createReactiveAgentPrompt(
  currentUrl: string,
  pageElements: any[],
  previousActions: any[],
  testContext: { email: string, password: string },
  currentScenario: string
) {
  const simplifiedElements = pageElements.map(el => ({
    tag: el.tag,
    text: el.text,
    label: el.label,
    placeholder: el.placeholder,
    'aria-label': el['aria-label'],
    locator: el.locator,
  }));

  return `
You are an autonomous QA agent. Your job is to look at the current state of a webpage and decide the single best action to take to progress towards a high-level goal.

**[Your High-Level Goal]**
"${currentScenario}"

**[Your Current State]**
- You are on page: ${currentUrl}
- Test credentials you must use:
  - Email: "${testContext.email}"
  - Password: "${testContext.password}"

**[Previous Actions in this Scenario]**
This is what you have done so far to achieve the goal. Use this to avoid repeating actions.

**[Available Interactive Elements on Current Screen]**
Here are all the things you can click or fill on the current screen.
\`\`\`json
${JSON.stringify(simplifiedElements.slice(0, 150), null, 2)}
\`\`\`

**[Your Task]**
1.  **Analyze Goal and Reality:** Compare your goal with the current page elements.
2.  **Decide One Action:** What is the single most logical action to take *right now* to get closer to your goal?
3.  **Check for Completion:** If the goal is already clearly met by looking at the current page, decide to 'finish'.

**[Output Format]**
You MUST output ONLY a single JSON object in a \`\`\`json ... \`\`\` block.
- "decision": Must be 'act' or 'finish'.
- "reasoning": A brief explanation of why you chose this action.
- "action": If your decision is 'act', provide the single action object. The action object MUST have "type", "description", and potentially "locator" and "value".

**Example: Goal is "Login". Page has a "Login/Sign Up" button.**
\`\`\`json
{
  "decision": "act",
  "reasoning": "I am not logged in and the goal is to log in. The first logical step is to click the 'Login/Sign Up' button to open the login form.",
  "action": { "type": "click", "locator": "button:has-text(\\"Login/Sign Up\\")", "description": "Click the 'Login/Sign Up' button" }
}
\`\`\`

**Example: Goal is "Login". After clicking, page now has an "Email Login" button.**
\`\`\`json
{
  "decision": "act",
  "reasoning": "I need to log in with email. The 'Email Login' button is the next step.",
  "action": { "type": "click", "locator": "button:has-text(\\"Email Login\\")", "description": "Click the 'Email Login' button" }
}
\`\`\`

**Example: Goal is "Login". Page has email/password fields.**
\`\`\`json
{
  "decision": "act",
  "reasoning": "The login form is now visible. I will fill the credentials and submit.",
  "action": { "type": "fill", "locator": "input[placeholder=\\"example@eposo.ai\\"]", "value": "%%TEST_USER_EMAIL%%", "description": "Enter the test user's email" }
}
\`\`\`

**Example: Goal is "Login", and you are now on the dashboard.**
\`\`\`json
{
  "decision": "finish",
  "reasoning": "I have successfully logged in and am now on the dashboard. The goal is complete."
}
\`\`\`
`;
}

function parseAiActionResponse(responseText: string): AiActionResponse {
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

    return JSON.parse(jsonString) as AiActionResponse;
  } catch (e: any) {
    console.error("AI 응답 JSON을 파싱하는 데 실패했습니다.", e, "\nOriginal response:", responseText);
    throw new Error("AI 응답 파싱 실패");
  }
}

async function executeAction(page: Page, action: Action, testContext: { email: string, password: string }) {
  const { type: actionType, locator, value } = action;
  const actionTimeout = 15000; // 15 seconds timeout

  if (!locator) {
    if(actionType === 'click' || actionType === 'fill') {
      throw new Error(`Action type ${actionType} requires a locator, but it is missing.`);
    }
  }

  let finalValue = value;
  if (value === '%%TEST_USER_EMAIL%%') finalValue = testContext.email;
  if (value === '%%TEST_USER_PASSWORD%%') finalValue = testContext.password;

  const targetLocator = page.locator(locator!).first();

  if (actionType === 'click') {
    if(!locator) throw new Error("Click action is missing a locator.");
    await targetLocator.waitFor({ state: 'visible', timeout: actionTimeout });
    await targetLocator.click({timeout: 10000});
  } else if (actionType === 'fill') {
    if(!locator) throw new Error("Fill action is missing a locator.");
    if(finalValue === undefined) throw new Error("Fill action is missing a value.");
    await targetLocator.waitFor({ state: 'visible', timeout: actionTimeout });
    await targetLocator.fill(finalValue);
  } else {
    throw new Error(`Unsupported action type: ${actionType}`);
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