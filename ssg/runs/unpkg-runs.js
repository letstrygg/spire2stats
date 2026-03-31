import fs from 'fs';
import path from 'path';
import unzipper from 'unzipper';
import { ensureDir } from '../sts2/paths.js';

/**
 * Slay the Spire 2 - Run Data Unpackager
 * Extracts a specific run backup zip into a dedicated subfolder.
 */

const PKG_DIR = 'C:\\GitHub\\sts2\\runs_pkg\\';
const DEST_BASE_DIR = 'C:\\GitHub\\sts2\\runs_unpkg\\';

async function unpkgRuns() {
    try {
        console.log('🛠️  Starting run unpackaging...');

        if (!fs.existsSync(PKG_DIR)) {
            throw new Error(`Package directory not found: ${PKG_DIR}`);
        }

        const files = fs.readdirSync(PKG_DIR).filter(f => f.endsWith('.zip'));

        if (files.length === 0) {
            console.log('ℹ️ No zip files found in package directory.');
            return;
        }

        for (const file of files) {
            const zipPath = path.join(PKG_DIR, file);
            const folderName = path.basename(file, '.zip');
            const targetDir = path.join(DEST_BASE_DIR, folderName);

            ensureDir(targetDir);

            console.log(`📦 Extracting: ${file}`);
            const directory = await unzipper.Open.file(zipPath);
            await directory.extract({ path: targetDir });

            // 4. Remove the source zip file upon success
            fs.unlinkSync(zipPath);
            console.log(`✅ Unpacked and removed source: ${file}`);
        }

        console.log(`✨ All discovered packages processed!`);

    } catch (error) {
        console.error('❌ Unpackaging failed:', error.message);
        process.exit(1);
    }
}

unpkgRuns();