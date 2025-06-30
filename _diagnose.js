"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const content = `
import { chromium, Page } from 'playwright';
import { config } from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

config();

async function main() {
    console.log('🕵️‍♂️ 진단 모드를 시작합니다...');
    const startUrl = "https://eposo.ai";

    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();
    
    try {
        await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        console.log(\`✅ \${startUrl} 페이지 로드 시작...\`);
        
        const loginButtonLocator = "button:has-text('Login/Sign Up')";
        const loginButton = page.locator(loginButtonLocator);

        console.log('... "Login/Sign Up" 버튼이 나타날 때까지 대기 중...');
        await loginButton.waitFor({ state: 'visible', timeout: 30000 });
        console.log('✅ "Login/Sign Up" 버튼을 찾았습니다. 상세 정보를 수집합니다.');

        const buttonHTML = await loginButton.evaluate(el => el.outerHTML);
        console.log('\\n--- 🕵️‍♂️ Target Element (button) ---');
        console.log(buttonHTML);
        console.log('------------------------------------');

        const parentHTML = await loginButton.evaluate(el => el.parentElement?.outerHTML);
        console.log('\\n--- 🕵️‍♂️ Parent Element ---');
        console.log(parentHTML);
        console.log('--------------------------');
        
        const screenshotPath = 'login-failure-screenshot.png';
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(\`\\n📸 스크린샷을 \${path.resolve(screenshotPath)} 에 저장했습니다.\`);

    } catch (e) {
        console.error('❌ 진단 중 오류 발생:', e);
        const errorScreenshotPath = 'login-failure-screenshot-error.png';
        await page.screenshot({ path: errorScreenshotPath, fullPage: true });
        console.log(\`📸 오류 스크린샷을 \${errorScreenshotPath} 에 저장했습니다.\`);
    } finally {
        await browser.close();
        console.log('\\n🕵️‍♂️ 진단 작업 완료.');
    }
}

main().catch(err => {
    console.error('💥 치명적인 오류 발생:', err);
    process.exit(1);
});
`;
const filePath = path_1.default.join(__dirname, 'src', 'cli.ts');
fs_1.default.writeFileSync(filePath, content.trim());
console.log('src/cli.ts has been overwritten with the diagnostic-mode code.');
