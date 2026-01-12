
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.resolve(__dirname, '..');
const TARGET_DIRS = ['lib', 'app', 'components', 'scripts'];

function walk(dir: string, fileList: string[] = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git') {
        walk(filePath, fileList);
      }
    } else {
      if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
        fileList.push(filePath);
      }
    }
  }
  return fileList;
}

const SUSPICIOUS_PATTERNS = [
  // Markdown List: "- Start of sentence"
  { regex: /^\s*-\s+[A-Z]/, message: "Line starts with '- [A-Z]', looks like Markdown list." },
  // Markdown Header: "# Title"
  { regex: /^\s*#\s+[A-Z]/, message: "Line starts with '# [A-Z]', looks like Markdown header." },
  // Unescaped backticks in odd places? (Hard to regex safely)
];

let hasError = false;

console.log("Scanning for raw Markdown in .ts/.tsx files...");

const files = TARGET_DIRS.flatMap(dir => walk(path.join(ROOT_DIR, dir)));

for (const file of files) {
  const content = fs.readFileSync(file, 'utf-8');
  const lines = content.split('\n');
  let inBlockComment = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Simple comment tracking
    if (trimmed.startsWith('/*')) inBlockComment = true;
    if (trimmed.endsWith('*/')) inBlockComment = false;
    if (inBlockComment) continue;
    if (trimmed.startsWith('//')) continue;
    if (trimmed.startsWith('*')) continue; // JSDoc continuation

    // Check patterns
    for (const pattern of SUSPICIOUS_PATTERNS) {
      if (pattern.regex.test(line)) {
        // Double check it's not inside a string (rough check)
        // If the line has quotes or backticks before the match, it might be in a string.
        // But our regex anchors to start of line ^.
        // So if it starts with "- ", it's likely top level or indented block.
        // But it could be inside a template literal that spans multiple lines.
        
        // Context heuristics:
        // If it's a template literal, we might be inside one.
        // This is hard to detect line-by-line.
        
        // However, the user wants to BAN this even in template literals IF it's "executable scope".
        // But wait, the user said "unless inside a string or comment".
        // Multiline strings ARE strings.
        
        // So `SYSTEM_PROMPT` (which I just moved) WAS valid.
        // But the user complained about `planner.ts:89`.
        // That line was: `   - Status: Component properties `loadingKey...`
        // It was inside a backtick string.
        // BUT the backticks INSIDE it broke the string.
        
        // So the real issue is "Broken Strings" or "Invalid Syntax".
        // But the user *also* said "Move Planner Documentation... to ... String Constants".
        // And "Remove All Raw Markdown from .ts Files".
        
        // So if I find "- Status" at the start of a line, it's suspicious.
        // If it is inside a string, it's fine.
        // If it is NOT inside a string, it's invalid code.
        
        // Since I can't easily parse "inside string" without a parser,
        // maybe I can just warn?
        
        // Actually, let's look at the user's specific request again.
        // "fail builds if a line starts with '- ' outside comments"
        
        // If I use `tsc`, it fails builds.
        // Maybe the user wants this script to find WHERE it is easier?
        
        // I will implement a "dumb" check that flags these lines.
        // If it flags a valid multiline string, I can add an ignore comment or adjust.
        // But generally, Markdown lists shouldn't appear in code unless it's a prompt.
        // And prompts should be in `prompts.ts` now.
        
        // So if I exclude `prompts.ts`, I can be stricter on other files.
        
        if (file.endsWith('prompts.ts')) continue;

        console.error(`\n[ERROR] Suspicious Markdown found in ${path.relative(ROOT_DIR, file)}:${i + 1}`);
        console.error(`  ${line.trim()}`);
        console.error(`  Reason: ${pattern.message}`);
        hasError = true;
      }
    }
  }
}

if (hasError) {
  console.error("\nFAILED: Found raw Markdown in source files. Please move documentation to comments or strings.");
  process.exit(1);
} else {
  console.log("SUCCESS: No raw Markdown patterns found.");
}
