import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { PATHS, ensureDir } from '../sts2/paths.js';

/**
 * Slay the Spire 2 - Run Data Importer
 * Parses unpacked run JSONs and stores them in the local SQLite database.
 */

const UNPKG_DIR = 'C:\\GitHub\\sts2\\runs_unpkg\\';
const DB_FILE = PATHS.DATABASE;

async function run() {
    try {
        console.log(`📂 Scanning for unpacked runs in: ${UNPKG_DIR}`);
        if (!fs.existsSync(UNPKG_DIR)) {
            throw new Error(`Unpack directory not found at ${UNPKG_DIR}`);
        }

        const db = new sqlite3.Database(DB_FILE);

        db.serialize(() => {
            // 1. Setup the runs table with the expanded schema
            db.run(`
                CREATE TABLE IF NOT EXISTS runs (
                    id TEXT PRIMARY KEY,
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
                    yt_video TEXT
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
                    username=excluded.username, schema_version=excluded.schema_version,
                    build_id=excluded.build_id, platform_type=excluded.platform_type,
                    seed=excluded.seed, start_time=excluded.start_time,
                    run_time=excluded.run_time, ascension=excluded.ascension,
                    game_mode=excluded.game_mode, win=excluded.win,
                    was_abandoned=excluded.was_abandoned, killed_by_encounter=excluded.killed_by_encounter,
                    killed_by_event=excluded.killed_by_event, acts=excluded.acts,
                    character=excluded.character, relic_list=excluded.relic_list,
                    deck_list=excluded.deck_list, path_history=excluded.path_history
            `);

            const folders = fs.readdirSync(UNPKG_DIR).filter(f => fs.statSync(path.join(UNPKG_DIR, f)).isDirectory());
            let runCount = 0;

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
                    const pathHistory = (rawData.map_point_history || []).flat().map(pt => {
                        const room = pt.rooms?.[0] || {};
                        const stats = pt.player_stats?.[0] || {};
                        const entry = {
                            floor: pt.floor,
                            room_type: room.room_type
                        };

                        if (['boss', 'monster', 'elite'].includes(room.room_type)) {
                            entry.encounter_id = room.model_id;
                            entry.monster_ids = room.monster_ids;
                        } else if (room.room_type === 'event') {
                            entry.event_id = room.model_id;
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
            db.run("COMMIT", () => {
                console.log(`✨ Success: Run database updated with ${runCount} runs.`);
                db.close();
            });
        });

    } catch (error) {
        console.error('❌ Import failed:', error.message);
        process.exit(1);
    }
}

run();