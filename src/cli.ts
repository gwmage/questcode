import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { nurieRequest } from './ai.service';
import dotenv from 'dotenv';

dotenv.config();

chromium.use(stealth());

// Main Function
async function main() {
  let browser: any = null;
  let sessionChatId: string | undefined = undefined;
  const iaFilePath = path.join(__dirname, '..', 'ia.json');
  let ia: any = {};

  try {
    const url = process.argv[2];
    if (!url) {
      console.error('❌ 에러: 테스트할 URL을 입력해주세요. 예: npm run dev -- https://example.com');
      process.exit(1);
    }
    
    ia = await loadIA(iaFilePath);
    console.log('✅ IA 파일 로드 완료.');

    browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({ locale: 'en-US' });
    const page = await context.newPage();

    const testContext = await loadTestContext();

    if (testContext.email && testContext.password) {
       console.log('✅ 로그인 정보가 로드되었습니다. AI가 필요 시 사용할 것입니다.');
    } else {
       console.log('ℹ️ 로그인 정보가 없습니다. 로그인 없이 탐색을 시작합니다.');
    }

    const visitedUrls = new Set<string>();
    const taskQueue: string[] = [url];

    while (taskQueue.length > 0) {
      const currentUrl = taskQueue.shift()!;
      if (visitedUrls.has(currentUrl)) {
        continue;
      }
      visitedUrls.add(currentUrl);

      console.log(`\n\n🕵️‍♂️ 페이지 탐색 시작: ${currentUrl}`);
      await page.goto(currentUrl, { waitUntil: 'domcontentloaded' });
      
      const allElementsFirstPass = await getInteractiveElements(page);
      const allLinks = allElementsFirstPass.filter(el => el.role === 'a' && el.href).map(el => el.href);
      const newIaData: any = {};
      let updated = false;
      for (const link of allLinks) {
        if (!ia[link]) {
          newIaData[link] = { status: 'unvisited' };
          updated = true;
        }
      }
      if (updated) {
        console.log('✅ 페이지에서 새로운 링크를 발견하여 IA를 자동으로 업데이트합니다.');
        ia = { ...ia, ...newIaData };
        await saveIA(iaFilePath, ia);
      }

      const attemptedLocatorsOnPage = new Set<string>();
      const MAX_ACTIONS_PER_PAGE = 10; 

      for (let i = 0; i < MAX_ACTIONS_PER_PAGE; i++) { 
        const allElements = await getInteractiveElements(page);

        const MAX_ELEMENTS_FOR_PROMPT = 200;
        let elements = allElements;
        if (allElements.length > MAX_ELEMENTS_FOR_PROMPT) {
          console.log(`⚠️ 요소가 너무 많습니다(${allElements.length}개). AI에 전달할 요소를 ${MAX_ELEMENTS_FOR_PROMPT}개로 줄입니다.`);
          elements = allElements.slice(0, MAX_ELEMENTS_FOR_PROMPT);
        }

        if (elements.length > 0 && attemptedLocatorsOnPage.size >= elements.length) {
           console.log('✅ 현재 페이지의 모든 요소를 시도했습니다. 다음 페이지로 넘어갑니다.');
           break;
        }
        if (elements.length === 0) {
            console.log('페이지에 상호작용할 요소가 없습니다.');
            break;
        }

        console.log(`\n🤖 AI에게 현재 페이지의 최적 행동을 요청합니다... (시도 ${i + 1}/${MAX_ACTIONS_PER_PAGE})`);

        const nextActionPrompt = createNextActionPrompt(page.url(), testContext, elements, Array.from(attemptedLocatorsOnPage), ia, visitedUrls);
        
        // console.log("==================== PROMPT START ====================");
        // console.log(nextActionPrompt);
        // console.log("==================== PROMPT END ======================");

        const aiResponse = await robustNurieRequest(nextActionPrompt, { chatId: sessionChatId });
        
        // console.log("==================== AI RESPONSE START ====================");
        // console.log(JSON.stringify(aiResponse, null, 2));
        // console.log("==================== AI RESPONSE END ======================");

        sessionChatId = aiResponse.chatId;
        const nextAction = parseNextAction(aiResponse.text);

        if (!nextAction || nextAction.action === 'stop') {
          console.log('💡 AI가 이 페이지의 탐색을 중지할 것을 권장했습니다.');
          break;
        }

        if (attemptedLocatorsOnPage.has(nextAction.locator)) {
           console.log(`🟡 AI가 이미 시도한 행동을 다시 제안했습니다. 현재 페이지 탐색을 종료합니다.`);
           break;
        }

        console.log(`📋 AI 제안: ${nextAction.description} (Action: ${nextAction.action})`);
        attemptedLocatorsOnPage.add(nextAction.locator);
        
        const originalUrlBeforeStep = page.url();
        console.log(`▶️ 행동 실행: ${nextAction.action} on ${nextAction.locator}`);

        try {
          const { ia: updatedIA } = await executeAction(page, nextAction, testContext, ia);
          ia = updatedIA; 
          
          await saveIA(iaFilePath, ia);

          const newUrl = page.url();
          if (newUrl !== originalUrlBeforeStep && !visitedUrls.has(newUrl)) {
            console.log(`✨ 새로운 URL 발견! 탐색 큐에 추가합니다: ${newUrl}`);
            taskQueue.unshift(newUrl);
            break;
          }
        } catch (e: any) {
           if (e.message.includes('strict mode violation')) {
            console.warn('🟡 엄격 모드 위반! AI에게 해결 방법을 물어봅니다...');
            const result = await handleStrictModeError(page, e, testContext, ia, sessionChatId);
            if(result) {
              ia = result.ia;
              sessionChatId = result.chatId;
              await saveIA(iaFilePath, ia);
            }
          } else {
            console.error(`❌ 행동 실행 중 다른 오류 발생: ${e.message}`);
          }
        }

        if (page.url() !== originalUrlBeforeStep) {
          break;
        }
      }
    }

    console.log('\n\n===== 모든 탐험 완료. =====\n');

  } catch (error) {
    if (error instanceof Error) {
      console.error('스크립트 실행 중 치명적인 오류가 발생했습니다.', error.message);
      console.error(error.stack);
    } else {
      console.error('알 수 없는 오류가 발생했습니다.', error);
    }
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Helper Functions
async function loadTestContext(): Promise<{ email: string; password: string; instructions: string }> {
  try {
    const contextFilePath = path.join(__dirname, '..', 'test-context.md');
    const fileContent = await fs.readFile(contextFilePath, 'utf-8');

    const emailMatch = fileContent.match(/Email:\\s*(.*)/);
    const passwordMatch = fileContent.match(/Password:\\s*(.*)/);
    const instructionsMatch = fileContent.match(/Instructions:\\s*([\\s\\S]*)/);

    const email = emailMatch ? emailMatch[1].trim() : '';
    const password = passwordMatch ? passwordMatch[1].trim() : '';
    const instructions = instructionsMatch ? instructionsMatch[1].trim() : '';

    return { email, password, instructions };
  } catch (error) {
    console.warn('⚠️ 경고: test-context.md 파일을 찾을 수 없거나 읽는 데 실패했습니다. 로그인 없이 테스트를 진행합니다.');
    return { email: '', password: '', instructions: '' };
  }
}

async function getInteractiveElements(page: any): Promise<any[]> {
  console.log("✅ getInteractiveElements 함수를 안정적인 버전으로 복원했습니다.");
  const elements = await page.evaluate((currentUrl: string) => {
    const selectors = [
      'a[href]',
      'button:not([disabled])',
      'input:not([type="hidden"]):not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[role="button"]:not([disabled])',
      '[role="link"]:not([disabled])',
      '[tabindex]:not([tabindex=\"-1\"])'
    ].join(', ');

    return Array.from(document.querySelectorAll(selectors))
      .map(el => {
        const element = el as HTMLElement;
        const role = element.getAttribute('role') || element.tagName.toLowerCase();
        const name = (element.getAttribute('aria-label') || element.innerText || (el as HTMLInputElement).value || '').trim().replace(/\\s+/g, ' ');
        const href = (el as HTMLAnchorElement).href;

        return { role, name, href };
      })
      .filter(el => {
        if (el.role === 'a') {
            return el.href && !el.href.startsWith('javascript:') && !el.href.startsWith(currentUrl + '#');
        }
        return true;
      });
  }, page.url());

  return elements;
}

async function robustNurieRequest(prompt: string, options: { retries?: number, chatId?: string } = {}): Promise<any> {
  const { retries = 3, chatId } = options;
  for (let i = 0; i < retries; i++) {
    try {
      return await nurieRequest(prompt, chatId);
    } catch (error: any) {
      if (i === retries - 1) throw error;
      console.warn(`AI 요청 실패, ${i + 1}번째 재시도 중... (에러: ${error.message})`);
      await new Promise(res => setTimeout(res, 1000 * (i + 1)));
    }
  }
}

function createNextActionPrompt(currentUrl: string, testContext: { instructions: string }, elements: any, attemptedLocators: string[], ia: any, visitedUrls: Set<string>): string {
  return `
You are a superhuman QA automation engineer and a meticulous cartographer of web applications.
Your dual mission is:
1.  **Map the Application (Cartographer):** Systematically explore the application to build a comprehensive Information Architecture (IA) map. The IA shows how pages are linked together.
2.  **Test the Application (QA Engineer):** Thoroughly test the features on each page based on the IA you've built.

**[Primary Objective]**
- User's Instructions: "${testContext.instructions || 'Explore and test all features comprehensively.'}"

**[Your Current IA Map]**
This is the IA you have mapped so far. \`status: "unvisited"\` means you haven't explored that page yet.
\`\`\`json
${JSON.stringify(ia, null, 2)}
\`\`\`

**[URLs You Have Already Visited]**
Avoid navigating to these URLs again.
\`\`\`json
${JSON.stringify(Array.from(visitedUrls), null, 2)}
\`\`\`

**[Your Current Location]**
- Current Page URL: ${currentUrl}
- Locators You Have Already Interacted With on this page: ${JSON.stringify(attemptedLocators, null, 2)}

**[Interactive Elements on Current Page]**
Here are the elements you can interact with.
\`\`\`json
${JSON.stringify(elements, null, 2)}
\`\`\`

**[Your Task & Action Rules]**
Decide the single best next action based on this strict priority order:

**Priority 1: Map the Unknown (Action: \`update_ia\`)**
- **IF** the current page's structure is not yet in your IA map, or seems incomplete, your primary goal is to map it.
- **Action:** \`update_ia\`
- **\`data\`:** Provide a JSON object representing the newly discovered page structure (links, menus). The keys should be URLs, and the value should be an object with \`{ "status": "unvisited" }\`.
- **Example:** \`{ "action": "update_ia", "description": "Found main navigation menu.", "data": { "/products": { "status": "unvisited" }, "/about": { "status": "unvisited" } } }\`

**Priority 2: Explore the Known (Action: \`click\`)**
- **IF** the current page is fully mapped in the IA, look for an unvisited page (\`status: "unvisited"\`) in your IA map and navigate to it. Make sure the target URL is not in the "Already Visited" list.
- **Action:** \`click\`
- **\`locator\`:** Use the \`href\` for the link that leads to the unvisited page.

**Priority 3: Test Current Page Features (Action: \`click\` or \`fill\`)**
- **IF** the page is mapped and there are no unvisited links to explore from here, test other interactive elements (buttons, forms, etc.) on the current page.
- - **Locator Strategy:** For the locator, use a Playwright locator string that you'd use to find the element. For links (\`<a>\` tags with \`href\`), you MUST use the \`href\` value as the locator. For other elements, use a \`getByRole\` locator.
- Do not re-test elements in the "Already Interacted With" list.

**[Output Format]**
Your entire output MUST be ONLY the single JSON object inside a \`\`\`json ... \`\`\` block.
`;
}

function parseNextAction(responseText: string): { action: string, locator: string, value?: string, description: string, data?: any } | null {
    if (!responseText) {
        console.error("AI 응답이 비어있습니다.");
        return null;
    }
    try {
        const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/);
        const jsonString = jsonMatch ? jsonMatch[1] : responseText;
        return JSON.parse(jsonString);
    } catch (e) {
        console.error("AI 응답 JSON을 파싱하는 데 실패했습니다.", e, "\nOriginal response:", responseText);
        return null;
    }
}

async function executeAction(page: any, action: { action: string, locator: string, value?: string, data?: any }, testContext: { email: string, password: string }, currentIA: any): Promise<{ia: any}> {
    const { action: actionType, locator, value, data } = action;
    let newIA = currentIA;

    let finalValue = value;
    if (value === '%%TEST_USER_EMAIL%%') {
        finalValue = testContext.email;
    } else if (value === '%%TEST_USER_PASSWORD%%') {
        finalValue = testContext.password;
    }

    const executeWithEval = async (code: string) => {
        try {
            return await eval(code);
        } catch(e) {
            console.error(`eval 실행 중 오류 발생: ${code}`);
            throw e;
        }
    };

    if (actionType === 'update_ia') {
        console.log('✅ IA를 업데이트합니다...');
        newIA = { ...currentIA, ...data };
        console.log('... IA 업데이트 완료.');
    } else if (actionType === 'click') {
        if (locator.startsWith('page.')) {
            await executeWithEval(`${locator}.click({ timeout: 5000 })`);
        } else if (locator.startsWith('http')) {
            await page.goto(locator, { timeout: 5000, waitUntil: 'domcontentloaded' });
        } else {
            await page.click(locator, { timeout: 5000 });
        }
    } else if (actionType === 'fill') {
        if (finalValue === undefined) {
            throw new Error('fill 액션에 value가 필요합니다.');
        }
        if (locator.startsWith('page.')) {
            await executeWithEval(`${locator}.fill("${finalValue}", { timeout: 5000 })`);
        } else {
            await page.locator(locator).fill(finalValue, { timeout: 5000 });
        }
    } else if (actionType === 'stop') {
        console.log('Stop action received.');
    } else {
        console.error(`알 수 없는 액션 타입: ${actionType}`);
    }

    return { ia: newIA };
}

async function handleStrictModeError(page: any, error: any, testContext: {email: string, password: string}, ia: any, chatId?: string): Promise<{ia: any, chatId?: string} | null> {
    console.log("AI에게 엄격 모드 오류 해결을 요청합니다...");
    const disambiguationPrompt = createDisambiguationPrompt(error.failedAction, error.message);
    
    // console.log("==================== PROMPT START (Strict Mode Error) ====================");
    // console.log(disambiguationPrompt);
    // console.log("==================== PROMPT END (Strict Mode Error) ======================");

    const aiResponse = await robustNurieRequest(disambiguationPrompt, { chatId });
    
    // console.log("==================== AI RESPONSE START (Strict Mode Error) ====================");
    // console.log(JSON.stringify(aiResponse, null, 2));
    // console.log("==================== AI RESPONSE END (Strict Mode Error) ======================");
    
    const newChatId = aiResponse.chatId;
    const nextAction = parseNextAction(aiResponse.text);

    if (nextAction && nextAction.action !== 'stop') {
        const { ia: newIA } = await executeAction(page, nextAction, testContext, ia);
        return { ia: newIA, chatId: newChatId };
    }
    
    return { ia, chatId: newChatId };
}

// Function to create a disambiguation prompt for the AI
function createDisambiguationPrompt(failedAction: any, errorMessage: string): string {
  return `
You are a QA automation expert. You tried to execute an action but it failed due to a "strict mode violation". 
This means the locator you generated matched multiple elements on the page.

**[The Failing Action]**
\`\`\`json
${JSON.stringify(failedAction, null, 2)}
\`\`\`

**[The Error Message]**
\`\`\`
${errorMessage}
\`\`\`

**[Your Task]**
Analyze the error message which contains the list of elements that were matched.
Then, regenerate the JSON for the *single* most appropriate action. 
Your new locator must be more specific to only match one element.

**[Action Rules]**
1.  **Action:** "click", "fill", or "stop".
2.  **Locator Strategy:** Use \`page.locator()\` with a more specific selector. You can chain selectors like \`page.locator(...).first()\` or use CSS features like \`:nth-child(...)\`.
3.  **Value:** Required for "fill".
4.  **Description:** Explain why you chose the new locator.
5.  **Output:** Your entire output MUST be ONLY the single JSON object.
`;
}

async function loadIA(filePath: string): Promise<any> {
    try {
        const fileContent = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(fileContent);
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            console.log('ℹ️  ia.json 파일이 없어 새로 생성합니다.');
            await fs.writeFile(filePath, JSON.stringify({}, null, 2), 'utf-8');
            return {};
        }
        throw error;
    }
}

async function saveIA(filePath: string, data: any): Promise<void> {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

main();
