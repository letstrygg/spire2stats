import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import archiver from 'archiver';
import { PATHS, ensureDir } from '../sts2/paths.js';

/**
 * Slay the Spire 2 - Run Data Importer
 * Parses unpacked run JSONs and stores them in the local SQLite database.
 */

const UNPKG_DIR = 'C:\\GitHub\\sts2\\runs_unpkg\\';
const PROCESSED_DIR = 'C:\\GitHub\\sts2\\runs_processed\\';
const DB_FILE = PATHS.DATABASE;

async function run() {
    try {
        console.log(`📂 Scanning for unpacked runs in: ${UNPKG_DIR}`);
        if (!fs.existsSync(UNPKG_DIR)) {
            console.log('ℹ️ No runs found to process.');
            return;
        }

        const db = new sqlite3.Database(DB_FILE);

        // Ensure the schema is up to date for existing tables
        await new Promise((resolve, reject) => {
            db.all("PRAGMA table_info(runs)", (err, columns) => {
                if (err) return reject(err);
                if (columns.length === 0) return resolve();

                const hasUserRunNum = columns.some(c => c.name === 'user_run_num');
                if (!hasUserRunNum) {
                    console.log('➕ Adding missing column: user_run_num to existing runs table...');
                    db.run("ALTER TABLE runs ADD COLUMN user_run_num INTEGER", (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                } else {
                    resolve();
                }
            });
        });

        const folders = fs.readdirSync(UNPKG_DIR).filter(f => fs.statSync(path.join(UNPKG_DIR, f)).isDirectory());

        let runCount = 0;
        let success = false;

        db.serialize(() => {
            // 1. Setup the runs table with the expanded schema
            db.run(`
                CREATE TABLE IF NOT EXISTS runs (
                    id TEXT PRIMARY KEY,
                    user_run_num INTEGER,
                    username TEXT,
                    schema_version TEXT,
                    build_id TEXT,
                    platform_type TEXT,
                    seed TEXT,
                    start_time TEXT,
                    run_time INTEGER,
                    ascension INTEGER,
                    game_mode TEXT,
                    win INTEGER,
                    was_abandoned INTEGER,
                    killed_by_encounter TEXT,
                    killed_by_event TEXT,
                    acts TEXT,
                    character TEXT,
                    relic_list TEXT,
                    deck_list TEXT,
                    path_history TEXT,
                    yt_video TEXT,
                    ltg_url TEXT
                )
            `);

            console.log('🚀 Processing run folders...');
            db.run("BEGIN TRANSACTION");

            const stmt = db.prepare(`
                INSERT INTO runs (
                    id, username, schema_version, build_id, platform_type, seed, 
                    start_time, run_time, ascension, game_mode, win, was_abandoned, 
                    killed_by_encounter, killed_by_event, acts, character, 
                    relic_list, deck_list, path_history
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    username=excluded.username, 
                    schema_version=excluded.schema_version,
                    build_id=excluded.build_id, platform_type=excluded.platform_type,
                    seed=excluded.seed, start_time=excluded.start_time,
                    run_time=excluded.run_time, ascension=excluded.ascension,
                    game_mode=excluded.game_mode, win=excluded.win,
                    was_abandoned=excluded.was_abandoned, killed_by_encounter=excluded.killed_by_encounter,
                    killed_by_event=excluded.killed_by_event, acts=excluded.acts,
                    character=excluded.character, relic_list=excluded.relic_list,
                    deck_list=excluded.deck_list, path_history=excluded.path_history`);

            for (const folder of folders) {
                const username = folder.split('_')[0];
                const folderPath = path.join(UNPKG_DIR, folder);
                const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.run') || f.endsWith('.json'));

                for (const file of files) {
                    const runId = file.replace(/\.(run|json)$/, '');
                    const rawData = JSON.parse(fs.readFileSync(path.join(folderPath, file), 'utf8'));
                    
                    const player = rawData.players?.[0] || {};

                    // Parse End-of-Run Deck & Relics
                    const cleanDeck = (player.deck || []).map(c => ({
                        id: c.id?.replace('CARD.', ''),
                        upgrades: c.current_upgrade_level || 0,
                        enchantment: c.enchantment?.id || null
                    }));
                    const cleanRelics = (player.relics || []).map(r => r.id?.replace('RELIC.', ''));

                    // Parse Encounter & Pathing History
                    const pathHistory = (rawData.map_point_history || []).flat().map((pt, idx) => {
                        const room = pt.rooms?.[0] || {};
                        const stats = pt.player_stats?.[0] || {};
                        const entry = {
                            floor: pt.floor ?? (idx + 1), // Use index as fallback floor if property is missing
                            room_type: room.room_type,
                            hp: stats.current_hp
                        };

                        if (['boss', 'monster', 'elite'].includes(room.room_type)) {
                            entry.encounter_id = room.model_id?.replace('ENCOUNTER.', '');
                            entry.monster_ids = (room.monster_ids || []).map(m => m.replace('MONSTER.', ''));
                        } else if (room.room_type === 'event') {
                            entry.event_id = room.model_id?.replace('EVENT.', '');
                        } else if (room.room_type === 'rest_site') {
                            entry.rest_choices = stats.rest_site_choices || [];
                        }

                        return entry;
                    });

                    const cleanChar = player.character?.replace('CHARACTER.', '');
                    if (runCount === 0) {
                        console.log(`🔍 Sanitization check: "${player.character}" -> "${cleanChar}"`);
                    }

                    stmt.run(
                        runId, username, rawData.schema_version, rawData.build_id, 
                        rawData.platform_type, String(rawData.seed), rawData.start_time, 
                        rawData.run_time, rawData.ascension, rawData.game_mode, 
                        rawData.win ? 1 : 0, rawData.was_abandoned ? 1 : 0,
                        rawData.killed_by_encounter?.replace('ENCOUNTER.', '') || null,
                        rawData.killed_by_event?.replace('EVENT.', '') || null,
                        JSON.stringify((rawData.acts || []).map(a => a.replace('ACT.', ''))),
                        cleanChar,
                        JSON.stringify(cleanRelics),
                        JSON.stringify(cleanDeck),
                        JSON.stringify(pathHistory)
                    );
                    runCount++;
                }
            }

            stmt.finalize();
            db.run("COMMIT", async (err) => {
                if (err) {
                    console.error('❌ Commit failed:', err.message);
                } else {
                    await recalculateUserRunNumbers(db);
                    success = true;
                    console.log(`✨ Success: Run database updated with ${runCount} runs and corrected sequential numbers.`);
                }
                db.close();
                
                // Trigger archival if DB import was successful
                if (success && runCount > 0) {
                    archiveProcessedRuns(folders);
                }
            });
        });

    } catch (error) {
        console.error('❌ Import failed:', error.message);
        process.exit(1);
    }
}

async function recalculateUserRunNumbers(db) {
    process.stdout.write('🔢 Recalculating user run sequence numbers... ');
    const users = await new Promise((res, rej) => {
        db.all("SELECT DISTINCT username FROM runs", (err, rows) => err ? rej(err) : res(rows || []));
    });

    for (const user of users) {
        const runs = await new Promise((res, rej) => {
            // Order by ID (timestamp) to ensure chronological order. 
            // Using CAST(id AS INTEGER) handles potential string length sorting issues.
            db.all("SELECT id FROM runs WHERE username = ? ORDER BY CAST(id AS INTEGER) ASC", [user.username], (err, rows) => err ? rej(err) : res(rows || []));
        });

        await new Promise((res, rej) => {
            db.serialize(() => {
                db.run("BEGIN TRANSACTION");
                const updateStmt = db.prepare("UPDATE runs SET user_run_num = ? WHERE id = ?");
                runs.forEach((run, index) => {
                    updateStmt.run(index + 1, run.id);
                });
                updateStmt.finalize();
                db.run("COMMIT", (err) => err ? rej(err) : res());
            });
        });
        console.log(`\n   ✅ User: ${user.username} - Assigned numbers 1 to ${runs.length}`);
    }
}

async function archiveProcessedRuns(folders) {
    console.log('📦 Archiving and cleaning up processed run folders...');
    ensureDir(PROCESSED_DIR);

    const getTime = (name) => name.match(/(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})/)?.[1] || "";

    for (const folder of folders) {
        const folderPath = path.join(UNPKG_DIR, folder);
        const zipName = `${folder}.zip`;
        const tempZipPath = path.join(UNPKG_DIR, zipName);
        const username = folder.split('_')[0];

        try {
            await zipFolder(folderPath, tempZipPath);

            const existingZips = fs.readdirSync(PROCESSED_DIR).filter(f => f.startsWith(username) && f.endsWith('.zip'));
            let keepNewZip = true;
            const newZipStats = fs.statSync(tempZipPath);
            const newTime = getTime(folder);

            for (const existing of existingZips) {
                const existingPath = path.join(PROCESSED_DIR, existing);
                const existingStats = fs.statSync(existingPath);
                const existingTime = getTime(existing);

                if (newTime > existingTime) {
                    fs.unlinkSync(existingPath);
                } else if (newTime < existingTime) {
                    keepNewZip = false;
                    break;
                } else {
                    // Timestamps are identical, check file size
                    if (newZipStats.size >= existingStats.size) {
                        fs.unlinkSync(existingPath);
                    } else {
                        keepNewZip = false;
                        break;
                    }
                }
            }

            if (keepNewZip) {
                fs.renameSync(tempZipPath, path.join(PROCESSED_DIR, zipName));
                console.log(`✅ Archived newest version: ${zipName}`);
            } else {
                fs.unlinkSync(tempZipPath);
                console.log(`🗑️  Discarded older/duplicate data: ${folder}`);
            }

            fs.rmSync(folderPath, { recursive: true, force: true });

        } catch (err) {
            console.error(`⚠️ Failed to archive folder ${folder}:`, err.message);
        }
    }
    console.log('✨ Archival process complete.');
}

function zipFolder(sourceDir, outPath) {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(outPath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        output.on('close', resolve);
        archive.on('error', reject);
        archive.pipe(output);
        archive.directory(sourceDir, false);
        archive.finalize();
    });
}

run();