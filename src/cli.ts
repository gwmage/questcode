import { chromium, Browser, Page } from 'playwright';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { AiActionResponse, createAgentPrompt, requestAiModel, parseAiActionResponse, createReport, AiModel, createRagExtractionPrompt } from './ai.service';
import { getPageContext, buildElementTree } from './utils';
import { Action } from './types';
import axios from 'axios';

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

function getRagUrlFromArgs(): string | null {
    const ragUrlArg = process.argv.find(arg => arg.startsWith('--rag-url='));
    if (ragUrlArg) {
        return ragUrlArg.split('=', 2)[1];
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

function getLanguageFromArgs(): string {
    const langArg = process.argv.find(arg => arg.startsWith('--language='));
    if (langArg) {
        const lang = langArg.split('=', 2)[1];
        if (['en', 'ko'].includes(lang)) {
            return lang;
        }
        console.warn(`경고: 지원하지 않는 언어입니다 (${lang}). 기본 언어인 en(영어)를 사용합니다.`);
    }
    return 'en';
}

async function fetchRagContent(url: string): Promise<string | null> {
    try {
        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        console.error(`❌ RAG 문서 가져오기 실패: ${url}`, error);
        return null;
    }
}

async function runTest(browser: Browser, targetUrl: string, testContext: string, ragSnippets: string | null, model: AiModel, language: string) {
  console.log(`\n🎯 테스트 목표: ${testContext}`);
  if (ragSnippets) {
    console.log(`📚 추출된 참고 문서를 기반으로 테스트를 진행합니다.`);
  }
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

      console.log("👀 페이지의 현재 상태를 분석하여 AI에게 전달할 보고서를 생성합니다...");
      const pageContext = await getPageContext(page);

      // 디버깅: 매 스텝의 pageContext를 파일로 저장
      // fs.writeFileSync(`debug_page_context_step_${step}.json`, pageContext);
      
      const pageUrl = page.url();
      const pageTitle = await page.title();
      
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
          isStuck,
          ragSnippets
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

      console.log(`▶️  실행: ${action.description}`);

      try {
        switch (action.type) {
          case 'click':
            try {
              await page.click(action.locator!, { timeout: 10000 });
            } catch (e: any) {
              if (e.message.includes('intercepts pointer events')) {
                console.log('다른 요소가 클릭을 가로막고 있어 force 옵션으로 재시도합니다.');
                await page.click(action.locator!, { force: true, timeout: 10000 });
              } else {
                throw e; // 다른 종류의 에러는 다시 던집니다.
              }
            }
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
            // crawl은 특별한 동작 없이 대기만 합니다.
            break;
        }
        actionHistory.push(action);
      } catch (e: any) {
        const sanitizedError = (e.message || 'Unknown error').replace(/[^\w\s.,:()]/g, '');
        console.error(`❌ 행동 '${action.description}' 실패: ${sanitizedError}`);
        action.error = sanitizedError;
        actionHistory.push(action);
      }

      // 모든 액션(성공 또는 실패) 후에 항상 페이지가 안정화될 시간을 줍니다.
      console.log('⏳ 페이지 상태가 안정되기를 기다립니다...');
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {
        console.log('⏳ DOMContentLoaded 대기 시간 초과, 계속 진행합니다.');
      });
      await page.waitForTimeout(2000); // 추가적인 안정화 시간
      
      step++;
    }

  } catch (error: any) {
    console.error('테스트 실행 중 심각한 오류 발생:', error);
  } finally {
    if (page) await page.close();
  }

  console.log('\n\n===== 최종 보고서 생성 =====');
  try {
    if (actionHistory.length === 0) {
      actionHistory.push({ type: 'finish', description: '테스트 시작 실패', error: '초기 페이지 로딩에 실패하여 테스트를 시작할 수 없었습니다.' });
    }
    const reportPrompt = createReport(testContext, actionHistory, language);
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

  const language = getLanguageFromArgs();
  console.log(`🌐 보고서 언어: ${language}`);

  const scenariosFilePath = 'test-context.md'; // Use the new context file
  const testContext = fs.readFileSync(scenariosFilePath, 'utf-8');

  let ragSnippets: string | null = null;
  const ragUrl = getRagUrlFromArgs();
  if (ragUrl) {
    console.log(`📚 참고 문서 URL에서 내용을 가져옵니다: ${ragUrl}`);
    const ragContent = await fetchRagContent(ragUrl);

    if (ragContent) {
      console.log(`🔍 테스트 목표와 관련된 정보를 문서에서 추출합니다...`);
      const extractionPrompt = createRagExtractionPrompt(ragContent, testContext);
      const extractionResponse = await requestAiModel(extractionPrompt, model, 'rag-extraction');
      ragSnippets = extractionResponse?.text || null;
      
      if (ragSnippets && !ragSnippets.includes("No relevant information found")) {
        console.log(`✅ 관련 정보 추출 완료.`);
      } else {
        ragSnippets = null;
        console.warn(`⚠️ 문서에서 관련 정보를 추출하지 못했습니다.`);
      }
    }
  }

  // headless: false 로 설정해야 브라우저 창이 실제로 보입니다. 디버깅에 필수적입니다.
  const browser = await chromium.launch({ headless: false });
  try {
    if (fs.existsSync(scenariosFilePath)) {
      console.log(`📝 ${scenariosFilePath} 파일에서 전체 시나리오를 읽어 테스트를 시작합니다.`);
      await runTest(browser, targetUrl, testContext, ragSnippets, model, language);
    } else {
      console.log(`➡️  단일 시나리오 모드로 테스트를 시작합니다.`);
      const singleTestContext = getScenarioFromArgs();
      if (!singleTestContext) {
        console.error('오류: --scenario 인자가 제공되지 않았습니다. 시나리오를 제공해주세요.');
        process.exit(1);
      }
      await runTest(browser, targetUrl, singleTestContext, ragSnippets, model, language);
    }
  } catch (error) {
    console.error('메인 프로세스에서 에러 발생:', error);
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error("치명적인 오류 발생:", err);
  process.exit(1);
});