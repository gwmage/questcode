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
exports.nurieRequest = nurieRequest;
exports.createAgentPrompt = createAgentPrompt;
exports.createReport = createReport;
exports.parseAiActionResponse = parseAiActionResponse;
var axios_1 = require("axios");
var dotenv_1 = require("dotenv");
var fs = require("fs");
var path = require("path");
(0, dotenv_1.config)();
function nurieRequest(prompt, chatId) {
    return __awaiter(this, void 0, void 0, function () {
        var apiKey, requestBody, requestConfig, response, error_1;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    apiKey = process.env.NURIE_API_KEY;
                    if (!apiKey) {
                        throw new Error('NURIE_API_KEY is not set in the environment variables.');
                    }
                    requestBody = { question: prompt, chatId: chatId };
                    requestConfig = {
                        headers: {
                            'Content-Type': 'application/json; charset=utf-8',
                            Authorization: "Bearer ".concat(apiKey),
                        },
                    };
                    _d.label = 1;
                case 1:
                    _d.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, axios_1.default.post(process.env.NURIE_API, requestBody, requestConfig)];
                case 2:
                    response = _d.sent();
                    console.log('Full AI Response Data:', JSON.stringify(response.data, null, 2)); // Added for debugging
                    return [2 /*return*/, response.data];
                case 3:
                    error_1 = _d.sent();
                    console.error('AI 요청 실패:', (_a = error_1.response) === null || _a === void 0 ? void 0 : _a.status, (_b = error_1.response) === null || _b === void 0 ? void 0 : _b.data);
                    throw new Error("Request failed with status code ".concat((_c = error_1.response) === null || _c === void 0 ? void 0 : _c.status));
                case 4: return [2 /*return*/];
            }
        });
    });
}
var promptTemplate = null;
function createAgentPrompt(iaString, pageUrl, pageTitle, elementsString, testContext, actionHistory, isStuck) {
    if (!promptTemplate) {
        promptTemplate = fs.readFileSync(path.join(__dirname, 'prompt.txt'), 'utf-8');
    }
    var recentHistory = actionHistory.slice(-15);
    var contextPrompt = testContext
        ? "\n[Your Goal]\nYou have a specific mission. Analyze the user's request and the current screen to achieve the goal.\n---\n".concat(testContext, "\n---\n")
        : "[Your Goal]\nYour primary goal is to explore the given website URL, understand its structure, and test its functionalities.";
    var historyPrompt = recentHistory.length > 0
        ? "\n[Action History]\nYou have already performed these actions. Learn from them. Do not repeat the same action if it is not producing results.\n---\n".concat(recentHistory.map(function (a, i) { return "Step ".concat(actionHistory.length - recentHistory.length + i + 1, ": ").concat(a.description); }).join('\n'), "\n---\n")
        : '';
    var stuckPrompt = isStuck
        ? "\n[IMPORTANT]\nYou seem to be stuck in a loop repeating the same action. You MUST try a different action.\n"
        : '';
    var prompt = promptTemplate;
    prompt = prompt.replace('{stuckPrompt}', stuckPrompt);
    prompt = prompt.replace('{contextPrompt}', contextPrompt);
    prompt = prompt.replace('{historyPrompt}', historyPrompt);
    prompt = prompt.replace('{pageUrl}', pageUrl);
    prompt = prompt.replace('{pageTitle}', pageTitle);
    prompt = prompt.replace('{iaString}', iaString);
    prompt = prompt.replace('{elementsString}', elementsString);
    return prompt;
}
var reportPromptTemplate = null;
function createReport(testContext, actionHistory) {
    if (!reportPromptTemplate) {
        reportPromptTemplate = fs.readFileSync(path.join(__dirname, 'report_prompt.txt'), 'utf-8');
    }
    var historyString = actionHistory
        .map(function (a, i) {
        var log = "Step ".concat(i + 1, ": ").concat(a.description);
        if (a.error) {
            log += "\n  - Error: ".concat(a.error);
        }
        return log;
    })
        .join('\n');
    var prompt = reportPromptTemplate;
    prompt = prompt.replace('{testContext}', testContext);
    prompt = prompt.replace('{actionHistory}', historyString);
    return prompt;
}
function parseAiActionResponse(responseText) {
    try {
        if (!responseText) {
            throw new Error('AI response text is empty or undefined.');
        }
        var jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
        if (!jsonMatch || !jsonMatch[1]) {
            return JSON.parse(responseText);
        }
        ;
        return JSON.parse(jsonMatch[1]);
    }
    catch (e) {
        console.error("Failed to parse AI action response JSON. Error:", e, "Original Response:", responseText);
        throw new Error("Failed to parse AI action response.");
    }
}
