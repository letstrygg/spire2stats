import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import { ensureDir } from '../sts2/paths.js';

/**
 * Slay the Spire 2 - Run Data Packager
 * Creates a timestamped zip backup of the local run history.
 */

const SOURCE_PATH = 'C:\\Users\\letst\\AppData\\Roaming\\SlayTheSpire2\\steam\\76561199053362469\\profile1\\saves\\history\\';
const DEST_DIR = 'C:\\GitHub\\sts2\\runs_pkg\\';

async function pkgRuns() {
    try {
        console.log('🛠️  Starting run packaging...');

        // 1. Ensure source exists
        if (!fs.existsSync(SOURCE_PATH)) {
            throw new Error(`Source directory not found: ${SOURCE_PATH}`);
        }

        // 2. Ensure destination directory exists
        ensureDir(DEST_DIR);

        // 3. Generate directory-safe timestamp (YYYY-MM-DD_HH-mm-ss)
        const now = new Date();
        const timestamp = now.toISOString()
            .replace(/T/, '_')      // Replace T with underscore
            .replace(/\..+/, '')    // Remove milliseconds
            .replace(/:/g, '-');    // Replace colons with dashes for Windows compatibility

        const zipName = `letstrygg_runs_${timestamp}.zip`;
        const outputPath = path.join(DEST_DIR, zipName);

        // 4. Initialize Archiver
        const output = fs.createWriteStream(outputPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => {
            const sizeMb = (archive.pointer() / 1024 / 1024).toFixed(2);
            console.log(`✨ Package complete: ${zipName}`);
            console.log(`📊 Size: ${sizeMb} MB`);
            console.log(`📂 Location: ${DEST_DIR}`);
        });

        archive.on('error', (err) => { throw err; });
        archive.pipe(output);

        // 5. Add directory contents (false = don't include the 'history' folder name itself)
        archive.directory(SOURCE_PATH, false);

        // 6. Finalize the stream
        await archive.finalize();

    } catch (error) {
        console.error('❌ Packaging failed:', error.message);
        process.exit(1);
    }
}

pkgRuns();