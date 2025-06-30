import { chromium, Browser, Page } from 'playwright';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { AiActionResponse, createAgentPrompt, requestAiModel, parseAiActionResponse, createReport, AiModel } from './ai.service';
import { getPageContext } from './utils';
import { Action } from './types';

interface ActionResult {
  success: boolean;
  error?: string;
}

function getUrlFromArgs(): string | null {
    const urlArg = process.argv.find(arg => arg.startsWith('--url='));
    if (urlArg) {
        return urlArg.split('=', 2)[1];
    }
    // Fallback for positional argument
    const positionalArg = process.argv[2];
    if (positionalArg && !positionalArg.startsWith('--')) {
        return positionalArg;
    }
    return null;
}

const scenariosFilePath = path.join(__dirname, '..', 'test-scenarios.md');

function getScenarioFromArgs(): string | null {
    const scenarioArg = process.argv.find(arg => arg.startsWith('--scenario='));
    if (scenarioArg) {
        return scenarioArg.split('=', 2)[1];
    }
    return null;
}

function getModelFromArgs(): AiModel {
    const modelArg = process.argv.find(arg => arg.startsWith('--model='));
    if (modelArg) {
        const model = modelArg.split('=', 2)[1] as AiModel;
        if (['gpt-4o', 'claude-3-opus', 'gemini-2.5-pro', 'nurie'].includes(model)) {
            return model;
        }
        console.warn(`경고: 잘못된 모델이 지정되었습니다 (${model}). 기본 모델인 gpt-4o를 사용합니다.`);
    }
    return 'gpt-4o';
}

async function runTest(browser: Browser, targetUrl: string, testContext: string, model: AiModel) {
  console.log(`\n🎯 테스트 목표: ${testContext}`);
  const chatId = uuidv4();
  console.log(`🤝 새로운 대화 세션을 시작합니다. Chat ID: ${chatId}`);

  const actionHistory: Action[] = [];
  let page: Page | null = null;
  const stateHistory: string[] = [];
  
  try {
    page = await browser.newPage();
    await page.goto(targetUrl);
    
    console.log('⏳ 페이지가 완전히 로드되고 상호작용 가능할 때까지 대기합니다...');
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
    // "JS 비활성화" 경고 메시지가 사라질 때까지 기다려서 페이지가 상호작용 가능함을 확인합니다.
    const noJsWarningLocator = page.locator("text=We're sorry but EPOSO doesn't work");
    await noJsWarningLocator.waitFor({ state: 'hidden', timeout: 10000 });
    console.log('✅ 페이지가 성공적으로 로드되었습니다.');

    let step = 1;
    while (step <= 100) {
      console.log(`
>>>>> [ 스텝 ${step} ] <<<<<`);

      const pageUrl = page.url();
      const pageTitle = await page.title();
      
      console.log("👀 페이지의 현재 상태를 분석하여 AI에게 전달할 보고서를 생성합니다...");
      const pageContext = await getPageContext(page);
      
      const iaString = "{}";

      const currentState = pageContext;
      stateHistory.push(currentState);

      let isStuck = stateHistory.length > 4 &&
        stateHistory.slice(-4)[0] === stateHistory.slice(-4)[2] &&
        stateHistory.slice(-4)[1] === stateHistory.slice(-4)[3];

      let aiActionResponse: AiActionResponse | null = null;

      if (isStuck) {
        console.log("⚡️ AI 조련사 개입: 루프가 감지되어 테스트를 종료합니다.");
        aiActionResponse = { decision: 'finish', reasoning: 'Stuck in a state loop.', action: null };
      }
      
      if (!aiActionResponse) {
        const prompt = createAgentPrompt(
          iaString,
          pageUrl,
          pageTitle,
          pageContext,
          testContext,
          actionHistory,
          isStuck
        );

        const maxRetries = 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            console.log(`🤖 AI에게 현재 상황에서 최선의 행동을 묻습니다... (시도 ${attempt}/${maxRetries})`);
            const aiResponseData = await requestAiModel(prompt, model, chatId);
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
            await page.click(action.locator!, { force: action.force, timeout: 10000 });
            break;
          case 'fill':
            await page.fill(action.locator!, action.value!);
            break;
          case 'select':
            await page.selectOption(action.locator!, action.value!);
            break;
          case 'keypress':
            await page.press(action.locator!, action.key as any);
            break;
          case 'crawl':
            await page.waitForTimeout(1000);
            break;
        }

        console.log('⏳ 페이지 상태가 안정되기를 기다립니다...');
        await page.waitForLoadState('domcontentloaded', { timeout: 5000 });
        
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
    console.error('테스트 실행 중 심각한 오류 발생:', error);
  } finally {
    if (page) await page.close();
  }

  console.log('\n\n===== 최종 보고서 생성 =====');
  try {
    const reportPrompt = createReport(testContext, actionHistory);
    const reportResponseData = await requestAiModel(reportPrompt, model, chatId);
    const reportContent = reportResponseData?.text || '보고서 생성에 실패했습니다. AI 응답이 비어있습니다.';

    const reportFileName = `QA-Report-${new Date().toISOString().replace(/:/g, '-')}.md`;
    fs.writeFileSync(reportFileName, reportContent);
    console.log(`✅ 최종 보고서가 ${reportFileName} 파일로 저장되었습니다.`);
  } catch (error) {
    console.error('❌ 최종 보고서 생성 중 오류가 발생했습니다:', error);
  }
}

async function main() {
  const targetUrl = getUrlFromArgs();
  if (!targetUrl) {
    console.error('Please provide a target URL using --url=<URL> or as the first positional argument.');
    process.exit(1);
  }

  const model = getModelFromArgs();
  console.log(`🚀 AI 모델: ${model}`);

  const scenariosFilePath = 'test-context.md'; // Use the new context file

  // headless: false 로 설정해야 브라우저 창이 실제로 보입니다. 디버깅에 필수적입니다.
  const browser = await chromium.launch({ headless: false });
  try {
    if (fs.existsSync(scenariosFilePath)) {
      console.log(`📝 ${scenariosFilePath} 파일에서 전체 시나리오를 읽어 테스트를 시작합니다.`);
      const scenarioContent = fs.readFileSync(scenariosFilePath, 'utf-8');
      await runTest(browser, targetUrl, scenarioContent, model);
      console.log('🎉 모든 테스트 시나리오 실행을 완료했습니다.');
    } else {
      console.error(`❌ 시나리오 파일(${scenariosFilePath})을 찾을 수 없습니다.`);
      process.exit(1);
    }
  } finally {
    if (browser) await browser.close();
  }
}

main().catch(err => {
  console.error("치명적인 오류 발생:", err);
  process.exit(1);
});