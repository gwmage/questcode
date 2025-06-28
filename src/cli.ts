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

const scenariosFilePath = path.join(__dirname, '..', 'test-scenarios.md');

function getScenarioFromArgs(): string | null {
    const scenarioArg = process.argv.find(arg => arg.startsWith('--scenario='));
    if (scenarioArg) {
        return scenarioArg.split('=', 2)[1];
    }
    return null;
}

async function runTest(targetUrl: string, testContext: string) {
  console.log(`\n🎯 테스트 목표: ${testContext}`);
  const chatId = uuidv4();
  console.log(`🤝 새로운 대화 세션을 시작합니다. Chat ID: ${chatId}`);

  const actionHistory: Action[] = [];
  let browser: Browser | null = null;
  let page: Page | null = null;
  const stateHistory: string[] = [];
  
  try {
    browser = await chromium.launch({ headless: false });
    page = await browser.newPage();
    await page.goto(targetUrl);
    
    // Initial wait might need adjustment or removal depending on general page load times.
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });

    let step = 1;
    while (step <= 100) {
      console.log(`
>>>>> [ 스텝 ${step} ] <<<<<`);

      const pageUrl = page.url();
      const pageTitle = await page.title();
      const interactiveElements = await getInteractiveElements(page);
      const elementsString = JSON.stringify(interactiveElements, null, 2);
      const iaString = "{}";

      const currentState = `${pageUrl}::${interactiveElements.map(e => e.locator).join(',')}`;
      stateHistory.push(currentState);

      let isStuck = actionHistory.length > 3 &&
        actionHistory.slice(-3).every(a => a.description === actionHistory[actionHistory.length - 1].description);

      if (!isStuck && stateHistory.length > 4) {
        const lastFourStates = stateHistory.slice(-4);
        if (lastFourStates[0] === lastFourStates[2] && lastFourStates[1] === lastFourStates[3]) {
            console.warn("🚩 상태 루프 감지! (A -> B -> A -> B)");
            isStuck = true;
        }
      }

      let aiActionResponse: AiActionResponse | null = null;

      if (isStuck) {
        console.log("⚡️ AI 조련사 개입: 루프 탈출을 위한 강제 행동을 생성합니다.");
        const untriedClickActions = interactiveElements
            .filter(el => ['a', 'button'].includes(el.type))
            .filter(el => !actionHistory.some(a => a.locator === el.locator));
        
        let forcedAction: Action | null = null;
        if (untriedClickActions.length > 0) {
            const randomActionElement = untriedClickActions[Math.floor(Math.random() * untriedClickActions.length)];
            forcedAction = {
                type: 'click',
                locator: randomActionElement.locator,
                description: `[강제 조치] 루프를 탈출하기 위해 '${randomActionElement.name || randomActionElement.locator}'을(를) 클릭합니다.`
            };
            console.log(`🔨 새로운 강제 행동: ${forcedAction.description}`);
        } else {
            console.log("🛑 시도할 새로운 행동이 없어 테스트를 종료합니다.");
            aiActionResponse = { decision: 'finish', reasoning: 'Stuck in a loop and no new actions to try.', action: null };
        }

        if (forcedAction) {
            aiActionResponse = { decision: 'act', reasoning: 'Forced action to break a loop.', action: forcedAction };
        }

      }
      
      if (!aiActionResponse) {
        const prompt = createAgentPrompt(
          iaString,
          pageUrl,
          pageTitle,
          elementsString,
          testContext,
          actionHistory,
          isStuck
        );

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
    console.error('테스트 실행 중 심각한 오류 발생:', error);
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

async function main() {
  const targetUrl = process.argv[2];
  if (!targetUrl || targetUrl.startsWith('--')) {
    console.error('Please provide a target URL as the first argument.');
    process.exit(1);
  }

  const singleScenario = getScenarioFromArgs();

  if (singleScenario) {
    console.log('📝 커맨드라인 인수로 받은 단일 시나리오를 테스트합니다.');
    await runTest(targetUrl, singleScenario);
  } else if (fs.existsSync(scenariosFilePath)) {
    console.log(`📝 ${scenariosFilePath} 파일에서 전체 시나리오를 읽어 테스트를 시작합니다.`);
    const scenarios = fs.readFileSync(scenariosFilePath, 'utf-8')
      .split('\n')
      .map(s => s.trim().replace(/^\d+\.\s*/, '')) // 숫자와 점으로 시작하는 부분 제거
      .filter(s => s.length > 0 && !s.startsWith('#') && !s.toLowerCase().includes('here are 10'));

    for (const scenario of scenarios) {
      await runTest(targetUrl, scenario);
    }
    console.log('🎉 모든 테스트 시나리오 실행을 완료했습니다.');
  } else {
    console.error(`❌ 테스트 목표가 지정되지 않았습니다. ${scenariosFilePath} 파일을 생성하거나 --scenario 인수를 사용하세요.`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error("치명적인 오류 발생:", err);
  process.exit(1);
});