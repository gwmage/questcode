import * as fs from 'fs/promises';

export interface IANode {
  url: string;
  title: string;
  status: 'unvisited' | 'in-progress' | 'visited';
  children: IANode[];
}

/**
 * Loads the IA from a file, or creates a new one if it doesn't exist.
 * @param filePath The path to the ia.json file.
 * @param rootUrl The starting URL for the test.
 * @returns The IA tree.
 */
export async function loadIA(filePath: string, rootUrl: string): Promise<IANode> {
  try {
    const fileContent = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(fileContent) as IANode;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.log('ℹ️ ia.json 파일을 찾을 수 없어 새로 생성합니다.');
      const newIA: IANode = {
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
export async function saveIA(filePath: string, data: IANode): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Recursively finds the next unvisited node in the IA tree.
 * @param node The current node to start searching from.
 * @returns The unvisited IANode or null if none are found.
 */
export function findNextUnvisitedNode(node: IANode): IANode | null {
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
export function addNodeToIA(tree: IANode, parentUrl: string, newChildData: Omit<IANode, 'children'>): boolean {
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
function normalizeUrl(url: string): string {
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
export function findNodeByUrl(node: IANode, url: string): IANode | null {
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