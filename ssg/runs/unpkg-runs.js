import fs from 'fs';
import path from 'path';
import unzipper from 'unzipper';
import { ensureDir } from '../sts2/paths.js';

/**
 * Slay the Spire 2 - Run Data Unpackager
 * Extracts a specific run backup zip into a dedicated subfolder.
 */

const ZIP_PATH = 'C:\\GitHub\\sts2\\runs_pkg\\letstrygg_runs_2026-03-31_02-18-28.zip';
const DEST_BASE_DIR = 'C:\\GitHub\\sts2\\runs_unpkg\\';

async function unpkgRuns() {
    try {
        console.log('🛠️  Starting run unpackaging...');

        if (!fs.existsSync(ZIP_PATH)) {
            throw new Error(`Zip file not found: ${ZIP_PATH}`);
        }

        // 1. Determine target directory name from zip filename
        const folderName = path.basename(ZIP_PATH, '.zip');
        const targetDir = path.join(DEST_BASE_DIR, folderName);

        // 2. Ensure destination root and specific subfolder exist
        ensureDir(targetDir);

        console.log(`📦 Extracting: ${path.basename(ZIP_PATH)}`);
        console.log(`📂 Destination: ${targetDir}`);

        // 3. Perform extraction
        const directory = await unzipper.Open.file(ZIP_PATH);
        await directory.extract({ path: targetDir });

        // 4. Remove the source zip file upon success
        fs.unlinkSync(ZIP_PATH);
        console.log(`✨ Unpackaging complete and source file removed!`);

    } catch (error) {
        console.error('❌ Unpackaging failed:', error.message);
        process.exit(1);
    }
}

unpkgRuns();