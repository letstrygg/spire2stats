import sqlite3 from 'sqlite3';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { PATHS } from '../sts2/paths.js';

/**
 * Slay the Spire 2 - Video Link Importer
 * Syncs video_id from Supabase ltg_sts2_runs to local SQLite runs.yt_video
 */

// Load credentials from C:\GitHub\.env
dotenv.config({ path: 'C:\\GitHub\\.env' });

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

const db = new sqlite3.Database(PATHS.DATABASE);

async function run() {
    try {
        console.log('📡 Connecting to Supabase and checking local database...');

        // 1. Ensure the yt_video and ltg_url columns exist
        await new Promise((resolve, reject) => {
            db.all("PRAGMA table_info(runs)", (err, columns) => {
                if (err) return reject(err);
                const hasVideoCol = columns.some(c => c.name === 'yt_video');
                const hasLtgUrlCol = columns.some(c => c.name === 'ltg_url');
                
                if (!hasVideoCol || !hasLtgUrlCol) {
                    db.serialize(() => {
                        if (!hasVideoCol) {
                            console.log('➕ Adding yt_video column to local runs table...');
                            db.run("ALTER TABLE runs ADD COLUMN yt_video TEXT");
                        }
                        if (!hasLtgUrlCol) {
                            console.log('➕ Adding ltg_url column to local runs table...');
                            db.run("ALTER TABLE runs ADD COLUMN ltg_url TEXT");
                        }
                        db.get("SELECT 1", () => resolve());
                    });
                } else {
                    resolve();
                }
            });
        });

        // 2. Fetch run video mappings and URLs from Supabase
        const { data: remoteRuns, error } = await supabase
            .from('ltg_sts2_runs')
            .select(`
                id, video_id, ltg_videos ( url )
            `)
            .not('video_id', 'is', null);

        if (error) throw error;
        if (!remoteRuns || remoteRuns.length === 0) {
            console.log('ℹ️ No runs with video IDs found in Supabase.');
            return;
        }

        console.log(`🔍 Found ${remoteRuns.length} video/URL links in Supabase. Syncing...`);

        // 3. Update local database
        db.serialize(() => {
            db.run("BEGIN TRANSACTION");

            const stmt = db.prepare("UPDATE runs SET yt_video = ?, ltg_url = ? WHERE id = ?");
            let updatedCount = 0;

            for (const run of remoteRuns) {
                const url = run.ltg_videos?.url || null;
                stmt.run(run.video_id, url, run.id, function(err) {
                    if (!err && this.changes > 0) {
                        updatedCount++;
                    }
                });
            }

            stmt.finalize();
            db.run("COMMIT", () => {
                console.log(`✨ Success: Updated ${updatedCount} local runs with video IDs and URLs.`);
                db.close();
            });
        });

    } catch (error) {
        console.error('❌ Sync failed:', error.message);
        process.exit(1);
    }
}

run();