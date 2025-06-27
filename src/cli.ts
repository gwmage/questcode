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
            el.locator = `${el.tag}[aria-label='${el['aria-label']}']`;
        } else if (el.text) {
            el.locator = `${el.tag}:has-text('${el.text}')`;
        } else if (el.placeholder) {
            el.locator = `${el.tag}[placeholder='${el.placeholder}']`;
        }
    }
    return elements;
}

async function crawlSite(page: Page, iaTree: IANode, baseUrl: string) {
    console.log(`🗺️  Crawling page: ${page.url()}`);
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
    await page.goto(startUrl, { waitUntil: 'load', timeout: 60000 });

    const actionHistory: Action[] = [];
    let chatId: string | undefined = undefined;
    let step = 0;
    while (true) {
        step++;
        console.log(`
>>>>> [ 스텝 ${step} ] <<<<< `);

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
        const aiRawResponse = await nurieRequest(prompt, chatId);

        if (!aiRawResponse || !aiRawResponse.text) {
            console.error('❌ AI로부터 유효한 응답을 받지 못했습니다.');
            continue;
        }

        if (!chatId && aiRawResponse.chatId) {
            chatId = aiRawResponse.chatId;
            console.log(`🤝 새로운 대화 세션을 시작합니다. Chat ID: ${chatId}`);
        }

        let aiResponse;
        try {
            aiResponse = parseAiActionResponse(aiRawResponse.text);
        } catch (e: any) {
            console.error(e.message);
            continue;
        }
        
        console.log(`🧠 AI의 판단: ${aiResponse.reasoning}`);
        console.log(`▶️  실행: ${aiResponse.action.description}`);
        actionHistory.push(aiResponse.action);

        if (aiResponse.decision === 'finish') {
            console.log('✅ AI가 작업을 완료했습니다.');
            if (aiResponse.action.type === 'generate_report') {
                fs.writeFileSync(reportFilePath, aiResponse.action.description, 'utf-8');
                console.log(`📝 QA 보고서가 ${reportFilePath}에 저장되었습니다.`);
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
                const errorMessage = e.message.split('\\n')[0];
                console.error(`❌ 행동 '${description}' 실패: ${errorMessage}`);
                if(currentNode) currentNode.status = 'failed';
                
                const lastAction = actionHistory[actionHistory.length - 1];
                if (lastAction) {
                    lastAction.description = `${lastAction.description} -- ACTION FAILED: ${errorMessage}`;
                }
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