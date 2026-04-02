import sqlite3 from 'sqlite3';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { PATHS } from '../ssg/sts2/paths.js';

/**
 * Slay the Spire 2 - Supabase Data Sync Utility
 * Exports and updates local SQLite data into Supabase 's2s_' tables.
 */

// Load credentials from C:\GitHub\.env
dotenv.config({ path: 'C:\\GitHub\\.env' });

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

const db = new sqlite3.Database(PATHS.DATABASE);

async function query(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

// Mapping of local SQLite tables to remote Supabase tables and their respective primary/conflict keys
const TABLE_MAP = [
    { local: 'ascensions', remote: 's2s_ascensions', pk: 'ascension_id' },
    { local: 'cards', remote: 's2s_cards', pk: 'card_id' },
    { local: 'characters', remote: 's2s_characters', pk: 'character_id' },
    { local: 'enchantments', remote: 's2s_enchantments', pk: 'enchantment_id' },
    { local: 'encounters', remote: 's2s_encounters', pk: 'encounter_id' },
    { local: 'events', remote: 's2s_events', pk: 'event_id' },
    { local: 'monsters', remote: 's2s_monsters', pk: 'monster_id' },
    { local: 'relics', remote: 's2s_relics', pk: 'relic_id' },
    { local: 'runs', remote: 's2s_runs', pk: 'id' },
    { local: 'users', remote: 's2s_users', pk: 'slug' }
];

// Columns that contain JSON strings in SQLite which should be treated as Objects in Supabase
const JSON_COLUMNS = [
    'keywords', 'spawns_cards', 'vars', 'upgrade', 'tags',
    'deck', 'relics',
    'monsters',
    'options', 'pages',
    'moves', 'damage_values', 'block_values',
    'acts', 'relic_list', 'deck_list', 'path_history'
];

async function syncTable(config) {
    console.log(`\n📤 Syncing: ${config.local} -> ${config.remote}...`);
    try {
        const rows = await query(`SELECT * FROM ${config.local}`);
        if (!rows || rows.length === 0) {
            console.log(`ℹ️ No data found in local table '${config.local}'. Skipping.`);
            return;
        }

        const processedRows = rows.map(row => {
            const cleanRow = { ...row };
            
            // If the local SQLite auto-inc 'id' is not our primary sync key, remove it
            if (config.pk !== 'id' && typeof cleanRow.id === 'number') {
                delete cleanRow.id;
            }

            // Parse JSON strings into objects so Supabase stores them as jsonb
            for (const col of Object.keys(cleanRow)) {
                if (JSON_COLUMNS.includes(col) && typeof cleanRow[col] === 'string' && (cleanRow[col].startsWith('[') || cleanRow[col].startsWith('{'))) {
                    try {
                        cleanRow[col] = JSON.parse(cleanRow[col]);
                    } catch (e) {
                        // Not valid JSON, keep as-is
                    }
                }
            }
            return cleanRow;
        });

        // Supabase batch upsert
        const batchSize = 100;
        let count = 0;
        for (let i = 0; i < processedRows.length; i += batchSize) {
            const batch = processedRows.slice(i, i + batchSize);
            const { error } = await supabase
                .from(config.remote)
                .upsert(batch, { onConflict: config.pk });

            if (error) throw error;
            count += batch.length;
        }

        console.log(`✨ Success: Synced ${count} rows to ${config.remote}.`);
    } catch (err) {
        console.error(`❌ Failed to sync ${config.local}:`, err.message);
    }
}

async function run() {
    console.log('📡 Connecting to local database and preparing Supabase sync...');
    for (const table of TABLE_MAP) {
        await syncTable(table);
    }
    console.log('\n✅ Sync process completed.');
    db.close();
}

run();