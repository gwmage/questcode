import { chromium } from 'playwright';
import { nurieRequest } from './ai.service';
import * as fs from 'fs/promises';
import { exec } from 'child_process';
import * as util from 'util';

// child_process.exec를 프로미스 기반으로 사용하기 위해 변환합니다.
const execPromise = util.promisify(exec);

const GENERATED_TEST_FILE = './tests/generated.spec.ts';

/**
 * 주어진 URL의 HTML 콘텐츠를 가져옵니다.
 * @param url 가져올 페이지의 URL
 * @returns 페이지의 HTML 콘텐츠
 */
async function getPageContent(url: string): Promise<string> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    return await page.content();
  } finally {
    await browser.close();
  }
}

/**
 * AI로부터 받은 테스트 코드를 파일로 저장합니다.
 * @param code AI가 생성한 테스트 코드 문자열
 */
async function saveTestCode(code: string): Promise<void> {
  // AI가 생성한 코드에서 마크다운 코드 블록을 제거하고 순수 코드만 추출합니다.
  const cleanedCode = code.replace(/```typescript\n|```/g, '').trim();
  await fs.writeFile(GENERATED_TEST_FILE, cleanedCode);
  console.log(`테스트 코드가 ${GENERATED_TEST_FILE} 파일에 저장되었습니다.`);
}

/**
 * 생성된 Playwright 테스트를 실행합니다.
 */
async function runTests(): Promise<{ stdout: string; stderr: string }> {
  console.log('생성된 테스트를 실행합니다...');
  // 특정 파일만 실행하도록 playwright test 명령어에 파일 경로를 지정합니다.
  const { stdout, stderr } = await execPromise(`npx playwright test ${GENERATED_TEST_FILE}`);
  
  if (stderr) {
    console.error('테스트 실행 중 오류 발생:');
    console.error(stderr);
  }

  console.log('테스트 실행 결과:');
  console.log(stdout);

  return { stdout, stderr };
}


/**
 * 메인 실행 함수
 */
async function main() {
  // 1. 커맨드라인에서 URL을 가져옵니다.
  const url = process.argv[2];
  if (!url) {
    console.error('테스트할 URL을 입력해주세요. 예: ts-node src/cli.ts https://example.com');
    process.exit(1);
  }

  console.log(`${url}에 대한 테스트 생성을 시작합니다...`);

  // 2. 페이지 HTML 콘텐츠를 가져옵니다.
  const htmlContent = await getPageContent(url);

  // 3. AI에게 보낼 프롬프트를 작성합니다.
  // TODO: 나중에는 피드백을 포함한 더 복잡한 프롬프트로 발전시킬 예정입니다.
  const prompt = `
    다음은 웹페이지의 HTML 콘텐츠입니다.
    이 HTML을 기반으로 Playwright 테스트 코드를 작성해주세요.
    사용자 관점에서 중요한 기능들을 테스트하는 코드를 포함해야 합니다. (예: 버튼 클릭, 폼 제출 등)
    반드시 전체 코드를 typescript 코드 블록 안에 넣어서 답변해주세요.

    \`\`\`html
    ${htmlContent}
    \`\`\`
  `;

  // 4. AI에게 테스트 코드 생성을 요청합니다.
  // 실제 AI 응답에서 코드 부분만 추출해야 할 수 있습니다.
  const aiResponse = await nurieRequest(prompt);

  // 5. 받은 코드를 파일로 저장합니다.
  // 'aiResponse'는 AI가 반환한 전체 텍스트일 수 있으므로, 실제 코드 부분만 전달해야 합니다.
  // 여기서는 aiResponse가 코드 자체라고 가정합니다. 실제로는 파싱이 필요할 수 있습니다.
  await saveTestCode(aiResponse); 

  // 6. 저장된 테스트를 실행합니다.
  await runTests();
  
  console.log('자동 테스트 생성 및 실행이 완료되었습니다.');
}

main().catch(error => {
  console.error('자동 테스트 프로세스 중 오류가 발생했습니다:', error);
}); 