import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Anchor to the project root (up two levels from ssg/sts2)
const PROJECT_ROOT = path.resolve(__dirname, '../../');

export const PATHS = {
    // Look for the sts2 folder as a sibling to the spire2stats folder
    CODEX_DATA: path.resolve(PROJECT_ROOT, '../sts2/spire-codex-main/data'), 
    DATABASE: path.resolve(PROJECT_ROOT, '../sts2/spire2.db'),
    
    WEB_ROOT: PROJECT_ROOT,
    STS2_ROOT: path.join(PROJECT_ROOT, 'games/slay-the-spire-2'),
};

export function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
    return dirPath;
}

export function slugify(text) {
    return text.toString().toLowerCase().trim()
        .replace(/[.\s]+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-');
}