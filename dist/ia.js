"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadIA = loadIA;
exports.saveIA = saveIA;
exports.findNextUnvisitedNode = findNextUnvisitedNode;
exports.addNodeToIA = addNodeToIA;
exports.findNodeByUrl = findNodeByUrl;
const fs = __importStar(require("fs/promises"));
/**
 * Loads the IA from a file, or creates a new one if it doesn't exist.
 * @param filePath The path to the ia.json file.
 * @param rootUrl The starting URL for the test.
 * @returns The IA tree.
 */
async function loadIA(filePath, rootUrl) {
    try {
        const fileContent = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(fileContent);
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            console.log('ℹ️ ia.json 파일을 찾을 수 없어 새로 생성합니다.');
            const newIA = {
                url: rootUrl,
                title: 'Root', // The title will be updated after the first visit
                status: 'unvisited',
                children: [],
            };
            await saveIA(filePath, newIA);
            return newIA;
        }
        console.error('❌ ia.json 파일 로드 중 오류 발생:', error);
        throw error;
    }
}
/**
 * Saves the IA tree to a file.
 * @param filePath The path to the ia.json file.
 * @param data The IA tree to save.
 */
async function saveIA(filePath, data) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}
/**
 * Recursively finds the next unvisited node in the IA tree.
 * @param node The current node to start searching from.
 * @returns The unvisited IANode or null if none are found.
 */
function findNextUnvisitedNode(node) {
    if (node.status === 'unvisited') {
        return node;
    }
    for (const child of node.children) {
        const found = findNextUnvisitedNode(child);
        if (found) {
            return found;
        }
    }
    return null;
}
/**
 * Adds a new child node to a parent node in the IA tree.
 * @param tree The entire IA tree.
 * @param parentUrl The URL of the parent node to add the child to.
 * @param newChildData The data for the new child node.
 * @returns True if the node was added, false otherwise.
 */
function addNodeToIA(tree, parentUrl, newChildData) {
    const parentNode = findNodeByUrl(tree, parentUrl);
    if (parentNode) {
        const existingChild = findNodeByUrl(tree, newChildData.url); // Check the whole tree
        if (!existingChild) {
            parentNode.children.push({ ...newChildData, children: [] });
            return true;
        }
    }
    return false;
}
/**
 * Normalizes a URL by removing trailing slashes and hash-slashes.
 * @param url The URL to normalize.
 * @returns The normalized URL.
 */
function normalizeUrl(url) {
    let newUrl = url;
    if (newUrl.endsWith('/#/')) {
        newUrl = newUrl.slice(0, -3);
    }
    if (newUrl.endsWith('#/')) {
        newUrl = newUrl.slice(0, -2);
    }
    if (newUrl.endsWith('/')) {
        newUrl = newUrl.slice(0, -1);
    }
    return newUrl;
}
/**
 * Finds a node in the tree by its URL.
 * @param node The node to start searching from.
 * @param url The URL to find.
 * @returns The found IANode or null.
 */
function findNodeByUrl(node, url) {
    const normalizedUrl = normalizeUrl(url);
    const normalizedNodeUrl = normalizeUrl(node.url);
    if (normalizedNodeUrl === normalizedUrl) {
        return node;
    }
    for (const child of node.children) {
        const found = findNodeByUrl(child, url);
        if (found) {
            return found;
        }
    }
    return null;
}
