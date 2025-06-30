import * as fs from 'fs';
import * as path from 'path';

const targetPath = path.join(__dirname, '..', 'src', 'ai.service.ts');

try {
    let content = fs.readFileSync(targetPath, 'utf8');

    content = content.replace(
      'createAgentPrompt(iaString, pageUrl, pageTitle, elementsString,',
      'createAgentPrompt(iaString, pageUrl, pageTitle, pageContext,'
    );
    
    content = content.replace(
      'prompt = prompt.replace('{elementsString}', elementsString);',
      'prompt = prompt.replace('{pageContext}', pageContext);'
    );

    fs.writeFileSync(targetPath, content, 'utf8');
    console.log('src/ai.service.ts was successfully updated by _aiServiceFix.ts');

} catch (error) {
    console.error('Failed to update src/ai.service.ts:', error);
}