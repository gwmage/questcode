import { chromium, Browser, Page } from 'playwright';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { AiActionResponse, createAgentPrompt, nurieRequest, parseAiActionResponse, createReport } from './ai.service';
import { getInteractiveElements } from './utils';

export interface Action {
  type: 'click' | 'type' | 'crawl' | 'finish' | 'generate_report' | 'keypress' | 'fill';
  locator?: string;
  value?: string;
  description: string;
  force?: boolean;
  key?: string;
  error?: string;
}

interface ActionResult {
  success: boolean;
  error?: string;
}

const testContextFilePath = path.join(__dirname, '..', 'test-context.md');

async function main() {
  const targetUrl = process.argv[2];
  if (!targetUrl) {
    console.error('Please provide a target URL.');
    process.exit(1);
  }

  let testContext = '';
  if (fs.existsSync(testContextFilePath)) {
    testContext = fs.readFileSync(testContextFilePath, 'utf-8');
    console.log('📝 테스트 컨텍스트를 발견했습니다:', testContextFilePath);
  } else {
    testContext = `Your primary goal is to explore the given website URL (${targetUrl}), understand its structure, and test its functionalities. Here are your objectives:
1.  Log in.
2.  Create a new project.
3.  Log out.`
  }
  
  const chatId = uuidv4();
  console.log(`🤝 새로운 대화 세션을 시작합니다. Chat ID: ${chatId}`);

  const actionHistory: Action[] = [];
  let browser: Browser | null = null;
  let page: Page | null = null;
  
  try {
    browser = await chromium.launch({ headless: false });
    page = await browser.newPage();
    await page.goto(targetUrl);
    await page.waitForSelector('button:has-text("Login/Sign Up")', { timeout: 15000 });

    let step = 1;
    while (step <= 100) {
      console.log(`
>>>>> [ 스텝 ${step} ] <<<<<`);

      const pageUrl = page.url();
      const pageTitle = await page.title();
      const interactiveElements = await getInteractiveElements(page);
      const elementsString = JSON.stringify(interactiveElements, null, 2);
      const iaString = "{}";

      const isStuck = actionHistory.length > 3 &&
        actionHistory.slice(-3).every(a => a.description === actionHistory[actionHistory.length - 1].description);

      const prompt = createAgentPrompt(
        iaString,
        pageUrl,
        pageTitle,
        elementsString,
        testContext,
        actionHistory,
        isStuck
      );
      
      let aiActionResponse: AiActionResponse | null = null;
      const maxRetries = 3;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`🤖 AI에게 현재 상황에서 최선의 행동을 묻습니다... (시도 ${attempt}/${maxRetries})`);
          const aiResponseData = await nurieRequest(prompt, chatId);
          aiActionResponse = parseAiActionResponse(aiResponseData?.text);
          if (aiActionResponse) {
            break; 
          }
        } catch (error: any) {
          console.error(`❌ AI 응답 처리 실패 (시도 ${attempt}/${maxRetries}):`, error.message);
          if (attempt === maxRetries) {
            console.error('💣 AI로부터 유효한 응답을 받지 못해 테스트를 중단합니다.');
            actionHistory.push({ type: 'finish', description: 'AI 응답 오류로 테스트 중단', error: 'AI did not provide a valid action after 3 retries.' });
          }
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      if (!aiActionResponse) {
        break;
      }

      console.log(`🧠 AI의 판단: ${aiActionResponse.reasoning}`);

      if (aiActionResponse.decision === 'finish') {
        console.log('🏁 AI가 테스트를 종료하기로 결정했습니다. 최종 보고서를 생성합니다...');
        break;
      }

      const action = aiActionResponse.action;
      if (!action) {
        console.log('🤔 AI가 다음 행동을 결정하지 못했습니다. 테스트를 종료합니다.');
        break;
      }

      let result: ActionResult = { success: true };
      
      console.log(`▶️  실행: ${action.description}`);

      try {
        switch (action.type) {
          case 'click':
            await page.waitForTimeout(500);
            await page.click(action.locator!, { force: action.force, timeout: 10000 });
            break;
          case 'fill':
          case 'type':
            await page.waitForTimeout(500);
            await page.fill(action.locator!, action.value!);
            break;
          case 'keypress':
            await page.waitForTimeout(500);
            await page.press(action.locator!, action.key as any);
            break;
          case 'crawl':
            await page.waitForTimeout(2000);
            break;
        }
        await page.waitForTimeout(1000);
      } catch (e: any) {
        if (e.message.includes('timeout')) {
          console.log('⏳ 페이지 로딩 시간이 초과되었지만, 계속 진행합니다.');
        } else {
          const sanitizedError = (e.message || 'Unknown error').replace(/[^\w\s.,:()]/g, '');
          result = { success: false, error: sanitizedError };
          console.error(`❌ 행동 '${action.description}' 실패: ${sanitizedError}`);
        }
      }
      
      action.error = result.error;
      actionHistory.push(action);

      await page.waitForTimeout(2000);
      step++;
    }

  } catch (error: any) {
    console.error('모든 작업 실패:', error);
  } finally {
    if (page) await page.close();
    if (browser) await browser.close();
  }

  console.log('\n\n===== 최종 보고서 생성 =====');
  try {
    const reportPrompt = createReport(testContext, actionHistory);
    const reportResponseData = await nurieRequest(reportPrompt, chatId);
    const reportContent = reportResponseData?.text || '보고서 생성에 실패했습니다. AI 응답이 비어있습니다.';

    const reportFileName = `QA-Report-${new Date().toISOString().replace(/:/g, '-')}.md`;
    fs.writeFileSync(reportFileName, reportContent);
    console.log(`✅ 최종 보고서가 ${reportFileName} 파일로 저장되었습니다.`);
  } catch (error) {
    console.error('❌ 최종 보고서 생성 중 오류가 발생했습니다:', error);
  }
}

main().catch(err => {
  console.error("치명적인 오류 발생:", err);
  process.exit(1);
});