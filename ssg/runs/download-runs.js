import sqlite3 from 'sqlite3';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { PATHS, slugify } from '../sts2/paths.js';
import { recalculateUserRunNumbers } from '../sts2/user-run-num.js';

/**
 * Slay the Spire 2 - Run Downloader
 * Downloads runs from s2s_runs_todo, updates local user mapping, and transfers to local SQLite.
 */

// Load credentials from C:\GitHub\.env
dotenv.config({ path: 'C:\\GitHub\\.env' });

const db = new sqlite3.Database(PATHS.DATABASE);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function query(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

async function run() {
    try {
        console.log('📡 Connecting to Supabase and checking for new runs...');

        // 1. Ensure local schema has supabase_user_id columns
        await ensureColumns();

        // 2. Fetch runs from s2s_runs_todo
        const { data: todoRuns, error: fetchError } = await supabase
            .from('s2s_runs_todo')
            .select('*');

        if (fetchError) throw fetchError;

        if (todoRuns && todoRuns.length > 0) {
            console.log(`🚀 Found ${todoRuns.length} runs to process in s2s_runs_todo.`);
            const processedIds = [];

            for (const run of todoRuns) {
                const slug = slugify(run.username || '');
                const supabaseUserId = run.supabase_user_id;

                // 3. User & ID Linking Logic
                if (slug) {
                    const localUser = (await query("SELECT id, supabase_user_id FROM users WHERE slug = ?", [slug]))[0];
                    
                    if (!localUser) {
                        console.log(` New user detected: ${run.username}. Registering...`);
                        await query("INSERT INTO users (display_name, slug, supabase_user_id) VALUES (?, ?, ?)", 
                            [run.username, slug, supabaseUserId || null]);
                    } else if (supabaseUserId && !localUser.supabase_user_id) {
                        console.log(`🔗 Linking Supabase ID for existing user: ${run.username}`);
                        // Update users table
                        await query("UPDATE users SET supabase_user_id = ? WHERE id = ?", [supabaseUserId, localUser.id]);
                        // Update all existing runs for this username
                        await query("UPDATE runs SET supabase_user_id = ? WHERE LOWER(username) = ?", [supabaseUserId, (run.username || '').toLowerCase()]);
                    }
                }

                // 4. Insert into local SQLite
                const success = await insertRunLocally(run);
                if (success) {
                    processedIds.push(run.id);
                }
            }

            // 5. Clean up remote s2s_runs_todo
            if (processedIds.length > 0) {
                console.log(`🗑️  Cleaning up ${processedIds.length} runs from Supabase...`);
                const { error: delError } = await supabase
                    .from('s2s_runs_todo')
                    .delete()
                    .in('id', processedIds);
                
                if (delError) console.error("⚠️ Failed to delete runs from remote todo list:", delError.message);
                else {
                    console.log(`✅ Cleaned up ${processedIds.length} runs from remote todo list.`);
                }
            }
        } else {
            console.log('✨ No new runs found in s2s_runs_todo.');
        }

        // 6. Sync metadata updates (YouTube links and Shorts) from the permanent s2s_runs table
        // This ensures edits made on the website via editRunVideos.js are reflected locally
        console.log('📡 Downloading video and shorts updates from s2s_runs...');
        
        let hasMore = true;
        let offset = 0;
        const limit = 1000;
        let totalSyncedCount = 0;
        let runsWithShortsCount = 0;

        while (hasMore) {
            const { data: updates, error: updateError } = await supabase
                .from('s2s_runs')
                .select('id, yt_video, ltg_url, shorts')
                .range(offset, offset + limit - 1);

            if (updateError) throw updateError;
            if (!updates || updates.length === 0) break;

            for (const run of updates) {
                const shortsJson = JSON.stringify(run.shorts || []);
                const hasShorts = run.shorts && Array.isArray(run.shorts) && run.shorts.length > 0;
                const hasVideo = !!run.yt_video;

                if (hasShorts || hasVideo) {
                    if (hasShorts) runsWithShortsCount++;
                    console.log(`   [DEBUG] Syncing Run ${run.id}: Video=${run.yt_video || 'None'}, Shorts=${shortsJson}`);
                }

                await query("UPDATE runs SET yt_video = ?, ltg_url = ?, shorts = ? WHERE id = ?", [
                    run.yt_video,
                    run.ltg_url,
                    shortsJson,
                    run.id
                ]);
            }

            totalSyncedCount += updates.length;
            if (updates.length < limit) hasMore = false;
            else offset += limit;
        }

        console.log(`✅ Metadata sync complete. Checked ${totalSyncedCount} runs, found ${runsWithShortsCount} runs with linked shorts.`);

        await recalculateUserRunNumbers(db);
        console.log(`✨ All synchronization and metadata updates complete.`);

    } catch (error) {
        console.error('❌ Sync failed:', error.message);
    } finally {
        db.close();
    }
}

async function ensureColumns() {
    const tables = ['runs', 'users'];
    for (const table of tables) {
        const info = await query(`PRAGMA table_info(${table})`);
        if (!info.some(c => c.name === 'supabase_user_id')) {
            console.log(`➕ Adding supabase_user_id to local ${table} table...`);
            await query(`ALTER TABLE ${table} ADD COLUMN supabase_user_id TEXT`);
        }
        if (table === 'runs' && !info.some(c => c.name === 'shorts')) {
            console.log(`➕ Adding shorts column to local runs table...`);
            await query(`ALTER TABLE runs ADD COLUMN shorts TEXT`);
        }
    }
}

async function insertRunLocally(run) {
    try {
        const stmt = `
            INSERT INTO runs (
                id, user_run_num, username, schema_version, build_id, platform_type, 
                seed, start_time, run_time, ascension, game_mode, win, was_abandoned, 
                killed_by_encounter, killed_by_event, acts, character, 
                relic_list, deck_list, path_history, yt_video, ltg_url, supabase_user_id, shorts
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                username=excluded.username,
                supabase_user_id=excluded.supabase_user_id,
                user_run_num=excluded.user_run_num,
                win=excluded.win,
                relic_list=excluded.relic_list,
                deck_list=excluded.deck_list,
                path_history=excluded.path_history,
                yt_video=excluded.yt_video,
                ltg_url=excluded.ltg_url,
                shorts=excluded.shorts
        `;

        const params = [
            run.id,
            run.user_run_num,
            run.username,
            run.schema_version,
            run.build_id,
            run.platform_type,
            run.seed,
            run.start_time,
            run.run_time,
            run.ascension,
            run.game_mode,
            run.win,
            run.was_abandoned,
            run.killed_by_encounter,
            run.killed_by_event,
            JSON.stringify(run.acts),
            run.character,
            JSON.stringify(run.relic_list),
            JSON.stringify(run.deck_list),
            JSON.stringify(run.path_history),
            run.yt_video,
            run.ltg_url,
            run.supabase_user_id,
            JSON.stringify(run.shorts || [])
        ];

        await query(stmt, params);
        return true;
    } catch (err) {
        console.error(`❌ Failed to insert run ${run.id}:`, err.message);
        return false;
    }
}

run();