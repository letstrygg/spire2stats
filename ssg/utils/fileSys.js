import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 1. Get the exact directory this specific file lives in (.../letstrygg/ssg/utils)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 2. Define the absolute root of the project (.../letstrygg)
// Since this file is inside ssg/utils, we tell it to go up two folders ('../../')
const PROJECT_ROOT = path.resolve(__dirname, '../../');

export function writeStaticPage(urlPath, htmlContent) {
    // 3. Anchor the file path absolutely to the project root
    const fullPath = path.resolve(PROJECT_ROOT, urlPath);
    const dir = path.dirname(fullPath);

    // Ensure the entire directory tree exists
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    // Write the actual HTML file
    fs.writeFileSync(fullPath, htmlContent, 'utf8');
    
    // Print a clean, readable path to the console
    console.log(`✅ Wrote page: ${urlPath}`);
}

export function checkFileExists(urlPath) {
    return fs.existsSync(path.resolve(PROJECT_ROOT, urlPath));
}