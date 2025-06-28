"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var playwright_1 = require("playwright");
var uuid_1 = require("uuid");
var fs = require("fs");
var path = require("path");
var ai_service_1 = require("./ai.service");
var utils_1 = require("./utils");
var testContextFilePath = path.join(__dirname, '..', 'test-context.md');
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var targetUrl, testContext, chatId, actionHistory, browser, page, stateHistory, step, pageUrl, pageTitle, interactiveElements, elementsString, iaString, currentState, isStuck, lastFourStates, aiActionResponse, untriedClickActions, forcedAction, randomActionElement, prompt_1, maxRetries, attempt, aiResponseData, error_1, action, result, _a, e_1, sanitizedError, error_2, reportPrompt, reportResponseData, reportContent, reportFileName, error_3;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    targetUrl = process.argv[2];
                    if (!targetUrl) {
                        console.error('Please provide a target URL.');
                        process.exit(1);
                    }
                    testContext = '';
                    if (fs.existsSync(testContextFilePath)) {
                        testContext = fs.readFileSync(testContextFilePath, 'utf-8');
                        console.log('📝 테스트 컨텍스트를 발견했습니다:', testContextFilePath);
                    }
                    else {
                        testContext = "Your primary goal is to explore the given website URL (".concat(targetUrl, "), understand its structure, and test its functionalities. Here are your objectives:\n1.  Log in.\n2.  Create a new project.\n3.  Log out.");
                    }
                    chatId = (0, uuid_1.v4)();
                    console.log("\uD83E\uDD1D \uC0C8\uB85C\uC6B4 \uB300\uD654 \uC138\uC158\uC744 \uC2DC\uC791\uD569\uB2C8\uB2E4. Chat ID: ".concat(chatId));
                    actionHistory = [];
                    browser = null;
                    page = null;
                    stateHistory = [];
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 34, 35, 40]);
                    return [4 /*yield*/, playwright_1.chromium.launch({ headless: false })];
                case 2:
                    browser = _b.sent();
                    return [4 /*yield*/, browser.newPage()];
                case 3:
                    page = _b.sent();
                    return [4 /*yield*/, page.goto(targetUrl)];
                case 4:
                    _b.sent();
                    return [4 /*yield*/, page.waitForSelector('button:has-text("Login/Sign Up")', { timeout: 15000 })];
                case 5:
                    _b.sent();
                    step = 1;
                    _b.label = 6;
                case 6:
                    if (!(step <= 100)) return [3 /*break*/, 33];
                    console.log("\n>>>>> [ \uC2A4\uD15D ".concat(step, " ] <<<<<"));
                    pageUrl = page.url();
                    return [4 /*yield*/, page.title()];
                case 7:
                    pageTitle = _b.sent();
                    return [4 /*yield*/, (0, utils_1.getInteractiveElements)(page)];
                case 8:
                    interactiveElements = _b.sent();
                    elementsString = JSON.stringify(interactiveElements, null, 2);
                    iaString = "{}";
                    currentState = "".concat(pageUrl, "::").concat(interactiveElements.map(function (e) { return e.locator; }).join(','));
                    stateHistory.push(currentState);
                    isStuck = actionHistory.length > 3 &&
                        actionHistory.slice(-3).every(function (a) { return a.description === actionHistory[actionHistory.length - 1].description; });
                    // Enhanced loop detection
                    if (!isStuck && stateHistory.length > 4) {
                        lastFourStates = stateHistory.slice(-4);
                        if (lastFourStates[0] === lastFourStates[2] && lastFourStates[1] === lastFourStates[3]) {
                            console.warn("🚩 상태 루프 감지! (A -> B -> A -> B)");
                            isStuck = true;
                        }
                    }
                    aiActionResponse = null;
                    if (isStuck) {
                        console.log("⚡️ AI 조련사 개입: 루프 탈출을 위한 강제 행동을 생성합니다.");
                        untriedClickActions = interactiveElements
                            .filter(function (el) { return ['a', 'button'].includes(el.type); })
                            .filter(function (el) { return !actionHistory.some(function (a) { return a.locator === el.locator; }); });
                        forcedAction = null;
                        if (untriedClickActions.length > 0) {
                            randomActionElement = untriedClickActions[Math.floor(Math.random() * untriedClickActions.length)];
                            forcedAction = {
                                type: 'click',
                                locator: randomActionElement.locator,
                                description: "[\uAC15\uC81C \uC870\uCE58] \uB8E8\uD504\uB97C \uD0C8\uCD9C\uD558\uAE30 \uC704\uD574 '".concat(randomActionElement.name || randomActionElement.locator, "'\uC744(\uB97C) \uD074\uB9AD\uD569\uB2C8\uB2E4.")
                            };
                            console.log("\uD83D\uDD28 \uC0C8\uB85C\uC6B4 \uAC15\uC81C \uD589\uB3D9: ".concat(forcedAction.description));
                        }
                        else {
                            console.log("🛑 시도할 새로운 행동이 없어 테스트를 종료합니다.");
                            aiActionResponse = { decision: 'finish', reasoning: 'Stuck in a loop and no new actions to try.', action: null };
                        }
                        if (forcedAction) {
                            aiActionResponse = { decision: 'act', reasoning: 'Forced action to break a loop.', action: forcedAction };
                        }
                    }
                    if (!!aiActionResponse) return [3 /*break*/, 15];
                    prompt_1 = (0, ai_service_1.createAgentPrompt)(iaString, pageUrl, pageTitle, elementsString, testContext, actionHistory, isStuck);
                    maxRetries = 3;
                    attempt = 1;
                    _b.label = 9;
                case 9:
                    if (!(attempt <= maxRetries)) return [3 /*break*/, 15];
                    _b.label = 10;
                case 10:
                    _b.trys.push([10, 12, , 14]);
                    console.log("\uD83E\uDD16 AI\uC5D0\uAC8C \uD604\uC7AC \uC0C1\uD669\uC5D0\uC11C \uCD5C\uC120\uC758 \uD589\uB3D9\uC744 \uBB3B\uC2B5\uB2C8\uB2E4... (\uC2DC\uB3C4 ".concat(attempt, "/").concat(maxRetries, ")"));
                    return [4 /*yield*/, (0, ai_service_1.nurieRequest)(prompt_1, chatId)];
                case 11:
                    aiResponseData = _b.sent();
                    aiActionResponse = (0, ai_service_1.parseAiActionResponse)(aiResponseData === null || aiResponseData === void 0 ? void 0 : aiResponseData.text);
                    if (aiActionResponse) {
                        return [3 /*break*/, 15];
                    }
                    return [3 /*break*/, 14];
                case 12:
                    error_1 = _b.sent();
                    console.error("\u274C AI \uC751\uB2F5 \uCC98\uB9AC \uC2E4\uD328 (\uC2DC\uB3C4 ".concat(attempt, "/").concat(maxRetries, "):"), error_1.message);
                    if (attempt === maxRetries) {
                        console.error('💣 AI로부터 유효한 응답을 받지 못해 테스트를 중단합니다.');
                        actionHistory.push({ type: 'finish', description: 'AI 응답 오류로 테스트 중단', error: 'AI did not provide a valid action after 3 retries.' });
                    }
                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 2000); })];
                case 13:
                    _b.sent();
                    return [3 /*break*/, 14];
                case 14:
                    attempt++;
                    return [3 /*break*/, 9];
                case 15:
                    if (!aiActionResponse) {
                        return [3 /*break*/, 33];
                    }
                    console.log("\uD83E\uDDE0 AI\uC758 \uD310\uB2E8: ".concat(aiActionResponse.reasoning));
                    if (aiActionResponse.decision === 'finish') {
                        console.log('🏁 AI가 테스트를 종료하기로 결정했습니다. 최종 보고서를 생성합니다...');
                        return [3 /*break*/, 33];
                    }
                    action = aiActionResponse.action;
                    if (!action) {
                        console.log('🤔 AI가 다음 행동을 결정하지 못했습니다. 테스트를 종료합니다.');
                        return [3 /*break*/, 33];
                    }
                    result = { success: true };
                    console.log("\u25B6\uFE0F  \uC2E4\uD589: ".concat(action.description));
                    _b.label = 16;
                case 16:
                    _b.trys.push([16, 30, , 31]);
                    _a = action.type;
                    switch (_a) {
                        case 'click': return [3 /*break*/, 17];
                        case 'fill': return [3 /*break*/, 20];
                        case 'type': return [3 /*break*/, 20];
                        case 'keypress': return [3 /*break*/, 23];
                        case 'crawl': return [3 /*break*/, 26];
                    }
                    return [3 /*break*/, 28];
                case 17: return [4 /*yield*/, page.waitForTimeout(500)];
                case 18:
                    _b.sent();
                    return [4 /*yield*/, page.click(action.locator, { force: action.force, timeout: 10000 })];
                case 19:
                    _b.sent();
                    return [3 /*break*/, 28];
                case 20: return [4 /*yield*/, page.waitForTimeout(500)];
                case 21:
                    _b.sent();
                    return [4 /*yield*/, page.fill(action.locator, action.value)];
                case 22:
                    _b.sent();
                    return [3 /*break*/, 28];
                case 23: return [4 /*yield*/, page.waitForTimeout(500)];
                case 24:
                    _b.sent();
                    return [4 /*yield*/, page.press(action.locator, action.key)];
                case 25:
                    _b.sent();
                    return [3 /*break*/, 28];
                case 26: return [4 /*yield*/, page.waitForTimeout(2000)];
                case 27:
                    _b.sent();
                    return [3 /*break*/, 28];
                case 28: return [4 /*yield*/, page.waitForTimeout(1000)];
                case 29:
                    _b.sent();
                    return [3 /*break*/, 31];
                case 30:
                    e_1 = _b.sent();
                    if (e_1.message.includes('timeout')) {
                        console.log('⏳ 페이지 로딩 시간이 초과되었지만, 계속 진행합니다.');
                    }
                    else {
                        sanitizedError = (e_1.message || 'Unknown error').replace(/[^\w\s.,:()]/g, '');
                        result = { success: false, error: sanitizedError };
                        console.error("\u274C \uD589\uB3D9 '".concat(action.description, "' \uC2E4\uD328: ").concat(sanitizedError));
                    }
                    return [3 /*break*/, 31];
                case 31:
                    action.error = result.error;
                    actionHistory.push(action);
                    return [4 /*yield*/, page.waitForTimeout(2000)];
                case 32:
                    _b.sent();
                    step++;
                    return [3 /*break*/, 6];
                case 33: return [3 /*break*/, 40];
                case 34:
                    error_2 = _b.sent();
                    console.error('모든 작업 실패:', error_2);
                    return [3 /*break*/, 40];
                case 35:
                    if (!page) return [3 /*break*/, 37];
                    return [4 /*yield*/, page.close()];
                case 36:
                    _b.sent();
                    _b.label = 37;
                case 37:
                    if (!browser) return [3 /*break*/, 39];
                    return [4 /*yield*/, browser.close()];
                case 38:
                    _b.sent();
                    _b.label = 39;
                case 39: return [7 /*endfinally*/];
                case 40:
                    console.log('\n\n===== 최종 보고서 생성 =====');
                    _b.label = 41;
                case 41:
                    _b.trys.push([41, 43, , 44]);
                    reportPrompt = (0, ai_service_1.createReport)(testContext, actionHistory);
                    return [4 /*yield*/, (0, ai_service_1.nurieRequest)(reportPrompt, chatId)];
                case 42:
                    reportResponseData = _b.sent();
                    reportContent = (reportResponseData === null || reportResponseData === void 0 ? void 0 : reportResponseData.text) || '보고서 생성에 실패했습니다. AI 응답이 비어있습니다.';
                    reportFileName = "QA-Report-".concat(new Date().toISOString().replace(/:/g, '-'), ".md");
                    fs.writeFileSync(reportFileName, reportContent);
                    console.log("\u2705 \uCD5C\uC885 \uBCF4\uACE0\uC11C\uAC00 ".concat(reportFileName, " \uD30C\uC77C\uB85C \uC800\uC7A5\uB418\uC5C8\uC2B5\uB2C8\uB2E4."));
                    return [3 /*break*/, 44];
                case 43:
                    error_3 = _b.sent();
                    console.error('❌ 최종 보고서 생성 중 오류가 발생했습니다:', error_3);
                    return [3 /*break*/, 44];
                case 44: return [2 /*return*/];
            }
        });
    });
}
main().catch(function (err) {
    console.error("치명적인 오류 발생:", err);
    process.exit(1);
});
