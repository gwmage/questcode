import { chromium as baseChromium } from 'playwright';
import { expect } from '@playwright/test';
import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import { spawn } from 'child_process';
import * as fs from 'fs';
import { readFile } from 'fs/promises';
import * as path from 'path';
import { nurieRequest } from './ai.service';
import dotenv from 'dotenv';

dotenv.config();

const testsDir = path.join(__dirname, '..', 'tests', 'generated');

chromium.use(stealth());

// Main Function
async function main() {
  let browser: any = null;
  let sessionChatId: string | undefined = undefined;

  try {
    const url = process.argv[2];
    if (!url) {
      console.error('❌ 에러: 테스트할 URL을 입력해주세요. 예: npm run dev -- https://example.com');
      process.exit(1);
    }
    process.env.TEST_URL = url;

    await cleanUp();
    
    // 사용자의 모니터링을 위해 headless: false로 유지합니다.
    browser = await chromium.launch({ headless: false });
    // 언어 불일치 문제를 해결하기 위해, 브라우저 언어를 'en-US'로 명시적으로 설정합니다.
    const context = await browser.newContext({ locale: 'en-US' });
    const page = await context.newPage();

    const testContext = await loadTestContext();

    // 자율 탐험 에이전트의 상태 관리
    const taskQueue: string[] = [url]; // 시작 URL로 큐 초기화
    const visitedUrls = new Set<string>(); // 방문한 URL 기록

    if (testContext.email && testContext.password) {
      // 컨텍스트 파일에 정보가 있으면, 로그인부터 실행합니다.
      process.env.TEST_USER_EMAIL = testContext.email;
      process.env.TEST_USER_PASSWORD = testContext.password;
      console.log('✅ 로그인 정보를 환경 변수에 설정했습니다.');

      const loginResult = await login(page, expect, url, sessionChatId);

      if (loginResult.success) {
        sessionChatId = loginResult.chatId; // 로그인 과정에서 사용된 chatId를 저장
        // 로그인 '시도' 후, 탐색 큐의 시작점을 현재 URL로 업데이트합니다.
        // 로그인 성공 여부의 최종 판단은 탐색 AI가 내립니다.
        const afterLoginUrl = page.url();
        if (!visitedUrls.has(afterLoginUrl)) {
          taskQueue.unshift(afterLoginUrl); 
        }
        visitedUrls.add(url); // 초기 로그인 페이지는 방문한 것으로 처리
      } else {
        console.error('❌ 로그인 시나리오 생성/실행 중 오류가 발생했습니다. 프로그램을 종료합니다.');
        return; // 로그인 스텝 자체에서 오류 발생 시 종료
      }
    }
    
    // 자율 탐험 루프 시작
    while (taskQueue.length > 0) {
      const currentUrl = taskQueue.shift()!;
      if (visitedUrls.has(currentUrl)) {
        continue;
      }
      visitedUrls.add(currentUrl);

      if (page.url() !== currentUrl) {
        console.log(`🕵️‍♂️ 페이지 이동: ${currentUrl}`);
        await page.goto(currentUrl, { waitUntil: 'domcontentloaded' });
      }

      console.log(`\n\n🕵️‍♂️ 페이지 탐색 시작: ${page.url()}`);

      // 페이지 단위의 자율 행동 루프
      const actionsTakenOnPage: any[] = [];
      for (let i = 0; i < 10; i++) { // 한 페이지에서 최대 10개의 행동을 수행하여 무한 루프 방지
        const elements = await getInteractiveElements(page);
        console.log(`\n🤖 AI에게 현재 페이지의 최적 행동을 요청합니다... (행동 ${i + 1}/10)`);

        const nextActionPrompt = createNextActionPrompt(page.url(), testContext.instructions, elements, actionsTakenOnPage);
        const aiResponse = await robustNurieRequest(nextActionPrompt, { chatId: sessionChatId });
        sessionChatId = aiResponse.chatId; // 응답에서 chatId를 업데이트
        const nextAction = parseNextAction(aiResponse);

        if (!nextAction || nextAction.action === 'stop') {
          console.log('💡 AI가 이 페이지의 탐색을 중지할 것을 권장했습니다.');
          break; // 현재 페이지에 대한 행동 루프 종료
        }

        console.log(`📋 AI 제안: ${nextAction.description} (Action: ${nextAction.action})`);
        actionsTakenOnPage.push(nextAction);
        
        const originalUrlBeforeStep = page.url();
        console.log(`▶️ 행동 실행: ${nextAction.action} on ${nextAction.locator}`);

        try {
          await executeAction(page, nextAction);

          await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
          await page.waitForTimeout(1000);

          const newUrl = page.url();
          if (newUrl !== originalUrlBeforeStep && !visitedUrls.has(newUrl)) {
            console.log(`✨ 새로운 URL 발견! 탐색 큐에 추가합니다: ${newUrl}`);
            taskQueue.unshift(newUrl);
            break; // 현재 페이지 루프를 중단하고 새 URL을 우선 탐색
          }
        } catch (e: any) {
           if (e.message.includes('strict mode violation')) {
            console.warn('🟡 엄격 모드 위반! AI에게 해결 방법을 물어봅니다...');
            const refinedResponse = await handleStrictModeError(page, nextAction, e.message, sessionChatId);
            if(refinedResponse) {
              sessionChatId = refinedResponse.chatId;
              const refinedAction = parseNextAction(refinedResponse);
              if (refinedAction && refinedAction.action !== 'stop') {
                console.log('✅ AI가 새로운 해결책을 제시했습니다. 다시 시도합니다.');
                try {
                  await executeAction(page, refinedAction);
                  actionsTakenOnPage.push(refinedAction); // 성공한 수정된 행동을 기록
                } catch (finalError: any) {
                  console.error(`❌ 수정된 행동도 실패했습니다: ${finalError.message}`);
                }
              } else {
                console.log('💡 AI가 해결책을 찾지 못해 행동을 중지합니다.');
              }
            }
          } else {
            console.error(`❌ 행동 실행 중 다른 오류 발생: ${e.message}`);
          }
        }

        if (page.url() !== originalUrlBeforeStep) {
          // 페이지가 바뀌었으면 현재 페이지의 루프를 종료하고 다음 큐의 URL을 처리
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
    const fileContent = await readFile(contextFilePath, 'utf-8');

    const emailMatch = fileContent.match(/Email:\s*(.*)/);
    const passwordMatch = fileContent.match(/Password:\s*(.*)/);
    const instructionsMatch = fileContent.match(/Instructions:\s*([\s\S]*)/);

    const email = emailMatch ? emailMatch[1].trim() : '';
    const password = passwordMatch ? passwordMatch[1].trim() : '';
    const instructions = instructionsMatch ? instructionsMatch[1].trim() : '로그인이 완료된 대시보드 페이지 기준입니다.';

    if (!email || !password) {
      console.warn('⚠️ 경고: test-context.md 파일에 이메일 또는 비밀번호가 없습니다. 로그인 없이 테스트를 진행합니다.');
      return { email: '', password: '', instructions: '' };
    }

    console.log("✅ test-context.md 파일에서 로그인 정보를 성공적으로 로드했습니다.");
    return { email, password, instructions };
  } catch (error) {
    console.warn('⚠️ 경고: test-context.md 파일을 찾을 수 없거나 읽는 데 실패했습니다. 로그인 없이 테스트를 진행합니다.');
    return { email: '', password: '', instructions: '' };
  }
}

async function getInteractiveElements(page: any): Promise<any[]> {
  const roles = [
    'link',
    'button',
    'textbox',
    'searchbox',
    'checkbox',
    'radio',
    'option',
    'combobox',
    'listbox',
    'menuitem',
    'tab',
    'slider',
  ];

  const elements = [];
  for (const role of roles) {
    try {
      const locators = await page.getByRole(role).all();
      for (const locator of locators) {
        if (await locator.isVisible()) {
          const name = await locator.getAttribute('aria-label') || await locator.textContent();
          const elementData: any = {
            role: role,
            name: name?.trim().replace(/\s+/g, ' ') || 'No name',
          };

          if (role === 'link') {
            const href = await locator.getAttribute('href');
            if (href) {
              elementData.href = href;
            }
          }
          
          elements.push(elementData);
        }
      }
    } catch (error) {
      // 특정 역할을 가진 요소가 없으면 오류가 발생할 수 있으므로, 무시하고 계속 진행합니다.
    }
  }

  return elements.filter(el => el.name); // 이름이 있는 요소만 필터링
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

async function login(page: any, expect: any, url: string, chatId?: string): Promise<{ success: boolean; chatId?: string; }> {
  console.log('\n===== 실제 브라우저를 실행하여 로그인 시나리오 생성 중... =====');
  try {
    page.on('response', async (response: any) => {
      if (response.url().includes('login') || response.url().includes('auth')) {
        console.log(`\n--- 네트워크 응답 감지 ---`);
        console.log(`URL: ${response.url()}`);
        console.log(`Status: ${response.status()}`);
        try {
          const body = await response.json();
          console.log(`Body: ${JSON.stringify(body)}`);
        } catch (e) {
          console.log(`Body: (JSON 파싱 불가)`);
        }
        console.log(`-----------------------\n`);
      }
    });

    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // 1단계: "Login/Sign Up" 버튼 클릭
    await page.getByRole('button', { name: 'Login/Sign Up' }).click();
    await page.waitForTimeout(1000); 

    // 2단계: "Email Login" 버튼 클릭
    await page.getByRole('button', { name: 'Email Login' }).click();
    await page.waitForTimeout(1000);

    const loginFormHtml = await page.locator('body').innerHTML();
    console.log('✅ 이메일/비밀번호 폼 HTML을 가져왔습니다. AI에게 분석을 요청합니다.');

    const prompt = createLoginPrompt(loginFormHtml);
    const aiResponse = await robustNurieRequest(prompt, { chatId });
    const newChatId = aiResponse.chatId;
    
    const jsonMatch = ((typeof aiResponse === 'string' ? aiResponse : aiResponse.text) || '').match(/```json\r?\n([\s\S]*?)\r?\n```/);
    if (!jsonMatch) {
      console.error('AI 응답에서 JSON을 찾을 수 없습니다:', aiResponse);
      return { success: false };
    }
    const aiGeneratedSteps = JSON.parse(jsonMatch[1]);

    console.log('✅ 동적 로그인 시나리오 스텝을 생성했습니다. 이제 로그인을 실행합니다...');
    
    for (const step of aiGeneratedSteps) {
      console.log(`▶️  로그인 스텝 실행: ${step.description}`);
      await new Function('page', 'expect', 'process', `return (async () => { ${step.code} })()`)(page, expect, process);
      await page.waitForTimeout(500); // 각 스텝 후 DOM 변경을 위한 짧은 대기
    }

    console.log('✅ AI가 생성한 로그인 스텝을 모두 실행했습니다. 이제 탐색 AI가 상황을 판단합니다.');
    await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});

    return { success: true, chatId: newChatId };
  } catch (error) {
    console.error('❌ 로그인 과정 중 오류 발생:', error);
    return { success: false };
  }
}

function createLoginPrompt(loginFormHtml: string): string {
  return `
You are a QA automation engineer. Your task is to analyze the provided HTML of a login form and create a JSON array of action steps to complete the login.

**[Context]**
- The user's email is available as \`process.env.TEST_USER_EMAIL\`.
- The user's password is available as \`process.env.TEST_USER_PASSWORD\`.

**[Login Form HTML]**
\`\`\`html
${loginFormHtml}
\`\`\`

**[Your Task]**
Create a JSON array of action steps to fill the form and click the submit button.

**[Action Step Rules]**
1.  **code**: This is the most critical rule. The 'code' value MUST be a complete, valid, executable Playwright command as a string.
    - **Use \`process.env\`**: Use \`process.env.TEST_USER_EMAIL\` and \`process.env.TEST_USER_PASSWORD\` to fill in the credentials.
    - **Prefer locators like \`getByPlaceholder\` or \`getByRole\`**: Ensure locators are specific and robust.
    - **Example**: \`await page.getByPlaceholder("example@eposo.ai").fill(process.env.TEST_USER_EMAIL)\`
2.  **description**: Briefly explain the purpose of the step.
3.  **Output**: Your entire output MUST be ONLY the JSON array, enclosed in \`\`\`json ... \`\`\`.

**[Example Output]**
\`\`\`json
[
  {
    "code": "await page.getByPlaceholder('example@eposo.ai').fill(process.env.TEST_USER_EMAIL)",
    "description": "Fill in the email address."
  },
  {
    "code": "await page.getByPlaceholder('password').fill(process.env.TEST_USER_PASSWORD)",
    "description": "Fill in the password."
  },
  {
    "code": "await page.getByRole('button', { name: 'Email Login' }).click()",
    "description": "Click the final login button."
  }
]
\`\`\`

Now, provide the JSON action plan for the login page.
`;
}

async function cleanUp() {
  if (fs.existsSync(testsDir)) {
    fs.rmSync(testsDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testsDir, { recursive: true });
}

function createNextActionPrompt(currentUrl: string, instructions: string, elements: any[], actionsTaken: any[]): string {
  const simplifiedElements = elements.map(el => {
    const element: any = {
      role: el.role,
      name: el.name.slice(0, 100)
    };
    if (el.href) {
      element.href = el.href;
    }
    return element;
  });

  return `
You are a superhuman QA automation engineer. Your goal is to intelligently explore a web application step-by-step.

**[Mission Context]**
- Current Page URL: ${currentUrl}
- User's High-Level Instructions: ${instructions || 'Test all features comprehensively.'}
- Actions already taken during this session: ${JSON.stringify(actionsTaken.map(a => a.description), null, 2)}

**[Interactive Elements on Current Page]**
Here are the only interactive elements visible on the page. Each element has a role and name. Links may also have an 'href' attribute.
\`\`\`json
${JSON.stringify(simplifiedElements, null, 2)}
\`\`\`

**[Your Task]**
Based on the elements above and actions already taken, decide the single best next action.
**Crucial Consideration:** An action (like a click) might navigate to a new page. The elements you see now are for the *current* page. Your next action should be based *only* on what is currently visible.

**[Action Rules]**
1.  **Action:** Choose "click", "fill", or "stop".
2.  **Locator Strategy (Very Important!):**
    - **For links with an \`href\` attribute, YOU MUST use the \`href\` for the locator.** This is the most stable method.
      - Example: \`page.locator('a[href="/dashboard/219"]')\`
    - **For other elements,** use \`page.getByRole()\`.
      - Example: \`page.getByRole('button', { name: 'Submit' })\`
    - Your generated locator string MUST start with \`page.\`.
3.  **Value:** Required for "fill" action.
4.  **Description:** Briefly explain your reasoning.
5.  **Output:** Your entire output MUST be ONLY the single JSON object.

**[Example]**
\`\`\`json
{
  "action": "click",
  "locator": "page.locator('a[href=\\"#/dashboard/219\\"]')",
  "value": "",
  "description": "Navigate to the dashboard using its href."
}
\`\`\`

Now, provide the single best next action for the current page.
`;
}

function parseNextAction(aiResponse: any): any | null {
  try {
    const responseText = (typeof aiResponse === 'string' ? aiResponse : aiResponse.text) || '';
    const jsonMatch = responseText.match(/```json\r?\n([\s\S]*?)\r?\n```/);
    if (!jsonMatch) {
      console.error('AI 응답에서 JSON 블록을 찾을 수 없습니다.');
      return null;
    }
    return JSON.parse(jsonMatch[1]);
  } catch (error) {
    console.error('AI 응답 JSON 파싱 중 오류 발생:', error);
    return null;
  }
}

async function executeAction(page: any, action: { action: string; locator: string; value?: string }) {
  const locator = eval(action.locator);

  switch (action.action) {
    case 'click':
      await locator.click({ timeout: 5000 });
      break;
    case 'fill':
      if (typeof action.value === 'undefined') {
        throw new Error('"fill" action requires a "value"');
      }
      await locator.fill(action.value, { timeout: 5000 });
      break;
    default:
      console.warn(`🤔 알 수 없는 행동 "${action.action}"은 건너뜁니다.`);
  }
}

async function handleStrictModeError(page: any, failedAction: any, errorMessage: string, chatId?: string): Promise<any> {
  // ANSI 색상 코드와 같은 제어 문자를 제거하여 AI 요청이 실패하지 않도록 합니다.
  const cleanErrorMessage = errorMessage.replace(/[\u001b\u009b][[()#;?]?[0-9]{1,4}(?:;[0-9]{0,4})?[0-9A-ORZcf-nqry=><]/g, '');
  const disambiguationPrompt = createDisambiguationPrompt(failedAction, cleanErrorMessage);
  const aiResponse = await robustNurieRequest(disambiguationPrompt, { chatId });
  return aiResponse;
}

function createDisambiguationPrompt(failedAction: any, errorMessage: string): string {
  return `
You are a super-smart QA automation engineer debugging a Playwright script.
Your previous attempt to execute an action failed because the locator was not specific enough.

**[Original Failed Action]**
\`\`\`json
${JSON.stringify(failedAction, null, 2)}
\`\`\`

**[The Error: Strict Mode Violation]**
This error means the locator matched multiple elements on the page. Here is the error message:
\`\`\`
${errorMessage}
\`\`\`

**[Your Task]**
Analyze the error message and the conflicting elements. Then, provide a single, refined JSON action object to resolve the ambiguity.

**[Resolution Strategies]**
1.  **Refine Locator:** Create a more specific locator that uniquely identifies only ONE element. You might need to add parent classes, use \`.nth(n)\`, or \`.first()\`.
2.  **Stop:** If it's impossible to decide or not worth pursuing, use the "stop" action.

**[Example Output]**
\`\`\`json
{
  "action": "click",
  "locator": "page.locator('.main-navigation a[href=\\"#/dashboard\\"]').first()",
  "value": "",
  "description": "Refined the locator to target the link within the main navigation to ensure it's the correct one, and selected the first match."
}
\`\`\`

Now, provide the single best JSON action object to resolve the error.
`;
}

main();
