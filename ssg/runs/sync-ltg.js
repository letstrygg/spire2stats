import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve project root (C:\GitHub\spire2stats\)
const PROJECT_ROOT = path.resolve(__dirname, '../../');

const SCRIPTS = [
    'ssg/runs/pkg-runs.js',     // 1. Pack from AppData to runs_pkg
    'ssg/runs/unpkg-runs.js',   // 2. Unpack from runs_pkg to runs_unpkg
    'ssg/runs/input-runs.js',   // 3. Import to SQLite and archive to runs_processed
    'ssg/runs/input-videos.js', // 4. Sync YouTube IDs/URLs from Supabase
    'ssg/sts2/build-sts2.js'    // 5. Re-build sts2 directory
];

async function runSync() {
    console.log('🔄 Starting Full LTG Run Sync...');
    
    for (const script of SCRIPTS) {
        const scriptPath = path.join(PROJECT_ROOT, script);
        console.log(`\n🚀 Executing: ${script}`);
        try {
            execSync(`node "${scriptPath}"`, { stdio: 'inherit' });
        } catch (error) {
            console.error(`\n❌ Sync aborted: Failed while running ${script}`);
            process.exit(1);
        }
    }

    console.log('\n✨ Full sync complete! Your database is now up to date with runs and videos.');
}

runSync();