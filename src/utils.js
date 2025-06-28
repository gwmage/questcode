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
exports.getInteractiveElements = getInteractiveElements;
/**
 * Finds all interactive elements on the page that are visible.
 * @param page The Playwright page object.
 * @returns A promise that resolves to an array of interactive elements.
 */
function getInteractiveElements(page) {
    return __awaiter(this, void 0, void 0, function () {
        var elements, selectors, _i, selectors_1, selector, foundElements, _a, foundElements_1, element, tagName, type, textContent, ariaLabel, placeholder, nameAttr, idAttr, typeAttr, name_1, locator, sanitizedPlaceholder, normalizedText;
        var _b, _c, _d, _e, _f, _g;
        return __generator(this, function (_h) {
            switch (_h.label) {
                case 0:
                    elements = [];
                    selectors = [
                        'a',
                        'button',
                        '[role="button"]',
                        'input:not([type="hidden"])',
                        'textarea',
                        'select',
                    ];
                    _i = 0, selectors_1 = selectors;
                    _h.label = 1;
                case 1:
                    if (!(_i < selectors_1.length)) return [3 /*break*/, 14];
                    selector = selectors_1[_i];
                    return [4 /*yield*/, page.locator(selector).all()];
                case 2:
                    foundElements = _h.sent();
                    _a = 0, foundElements_1 = foundElements;
                    _h.label = 3;
                case 3:
                    if (!(_a < foundElements_1.length)) return [3 /*break*/, 13];
                    element = foundElements_1[_a];
                    return [4 /*yield*/, element.isVisible()];
                case 4:
                    if (!_h.sent()) return [3 /*break*/, 12];
                    return [4 /*yield*/, element.evaluate(function (el) { return el.tagName.toLowerCase(); })];
                case 5:
                    tagName = _h.sent();
                    // Ensure tagName is of the expected type, otherwise skip.
                    if (!['a', 'button', 'input', 'textarea', 'select'].includes(tagName)) {
                        return [3 /*break*/, 12];
                    }
                    type = tagName;
                    return [4 /*yield*/, element.textContent()];
                case 6:
                    textContent = (_b = (_h.sent())) === null || _b === void 0 ? void 0 : _b.trim().replace(/\s+/g, ' ');
                    return [4 /*yield*/, element.getAttribute('aria-label')];
                case 7:
                    ariaLabel = (_c = (_h.sent())) === null || _c === void 0 ? void 0 : _c.trim();
                    return [4 /*yield*/, element.getAttribute('placeholder')];
                case 8:
                    placeholder = (_d = (_h.sent())) === null || _d === void 0 ? void 0 : _d.trim();
                    return [4 /*yield*/, element.getAttribute('name')];
                case 9:
                    nameAttr = (_e = (_h.sent())) === null || _e === void 0 ? void 0 : _e.trim();
                    return [4 /*yield*/, element.getAttribute('id')];
                case 10:
                    idAttr = (_f = (_h.sent())) === null || _f === void 0 ? void 0 : _f.trim();
                    return [4 /*yield*/, element.getAttribute('type')];
                case 11:
                    typeAttr = (_g = (_h.sent())) === null || _g === void 0 ? void 0 : _g.trim();
                    name_1 = ariaLabel || textContent || placeholder || nameAttr || idAttr || null;
                    locator = null;
                    if (idAttr) {
                        locator = "#".concat(idAttr);
                    }
                    else if (nameAttr) {
                        locator = "[name=\"".concat(nameAttr, "\"]");
                    }
                    else if (ariaLabel) {
                        locator = "[aria-label=\"".concat(ariaLabel, "\"]");
                    }
                    else if (placeholder) {
                        sanitizedPlaceholder = placeholder.replace(/"/g, '\\"');
                        locator = "[placeholder=\"".concat(sanitizedPlaceholder, "\"]");
                    }
                    else if (textContent && textContent.length > 0) {
                        normalizedText = textContent.replace(/"/g, '\\"');
                        locator = "".concat(type, ":has-text(\"").concat(normalizedText, "\")");
                    }
                    else if (typeAttr) {
                        locator = "".concat(type, "[type=\"").concat(typeAttr, "\"]");
                    }
                    if (locator) {
                        elements.push({
                            type: type,
                            name: name_1,
                            locator: locator,
                        });
                    }
                    _h.label = 12;
                case 12:
                    _a++;
                    return [3 /*break*/, 3];
                case 13:
                    _i++;
                    return [3 /*break*/, 1];
                case 14: return [2 /*return*/, elements];
            }
        });
    });
}
