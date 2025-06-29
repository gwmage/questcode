import * as fs from 'fs';
import * as path from 'path';

const targetPath = path.join(__dirname, '..', 'src', 'ai.service.ts');

try {
    let content = fs.readFileSync(targetPath, 'utf8');

    // Fix 1: Update createAgentPrompt to use pageContext
    content = content.replace(
      /createAgentPrompt\\(([^)]*?)elementsString: string,([^)]*?)\\)/g,
      'createAgentPrompt($1pageContext: string,$2)'
    );
    content = content.replace(
      "prompt.replace('{elementsString}', elementsString)",
      "prompt.replace('{pageContext}', pageContext)"
    );

    // Fix 2: Isolate API key checks in requestAiModel
    content = content.replace(
        `switch (model) {
        case 'gpt-4o':
            if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set.');
            return gpt4oRequest(prompt, chatId);
        case 'claude-3-opus':
            if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set.');
            return claude3OpusRequest(prompt, chatId);
        case 'gemini-2.5-pro':
            if (!process.env.GOOGLE_API_KEY) throw new Error('GOOGLE_API_KEY is not set.');
            return gemini2_5ProRequest(prompt, chatId);
        case 'nurie':
            return nurieRequest(prompt, chatId);
        default:
            console.log(\`모델을 찾을 수 없습니다: \${model}. 기본 모델인 gpt-4o를 사용합니다.\`);
            if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set.');
            return gpt4oRequest(prompt, chatId);
    }`,
        \`switch (model) {
        case 'gpt-4o':
            if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set for gpt-4o.');
            return gpt4oRequest(prompt, chatId);
        case 'claude-3-opus':
            if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set for claude-3-opus.');
            return claude3OpusRequest(prompt, chatId);
        case 'gemini-2.5-pro':
            if (!process.env.GOOGLE_API_KEY) throw new Error('GOOGLE_API_KEY is not set for gemini-2.5-pro.');
            return gemini2_5ProRequest(prompt, chatId);
        case 'nurie':
            if (!process.env.NURIE_API_KEY || !process.env.NURIE_API) {
                throw new Error('NURIE_API_KEY or NURIE_API is not set for nurie model.');
            }
            return nurieRequest(prompt, chatId);
        default:
            console.warn(\`Unknown model: \${model}. Defaulting to gpt-4o.\`);
            if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set for default model gpt-4o.');
            return gpt4oRequest(prompt, chatId);
    }\`
    );

    fs.writeFileSync(targetPath, content, 'utf8');
    console.log('src/ai.service.ts was successfully updated by _ultimateParserFix.ts');

} catch (error) {
    console.error('Failed to update src/ai.service.ts:', error);
} 