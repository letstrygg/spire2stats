import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { PATHS, ensureDir } from './paths.js';
import { parseCardText } from './helpers.js';

/**
 * Slay the Spire 2 - Card Data Importer
 * Reads from Spire Codex JSON and inputs into local SQLite
 */

const charFilePath = path.join(PATHS.CODEX_DATA, 'characters.json');
const starterCards = new Set();
const starterRelics = new Set();

if (fs.existsSync(charFilePath)) {
    const chars = JSON.parse(fs.readFileSync(charFilePath, 'utf8'));
    const normalize = (id) => id.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();
    chars.forEach(c => {
        const deck = c.deck ?? c.starting_deck ?? c.StartingDeck ?? [];
        const relics = c.relics ?? c.starting_relics ?? c.StartingRelics ?? [];
        deck.forEach(id => starterCards.add(normalize(id)));
        relics.forEach(id => starterRelics.add(normalize(id)));
    });
}

// Hard-coded special cases for items that are always starters but not character-specific
starterCards.add('ASCENDERS_BANE');
starterCards.add('SPOILS_MAP');

const TABLES = [
    {
        name: 'cards',
        file: 'cards.json',
        columns: 'card_id, name, type, rarity, cost, is_x_cost, is_x_star_cost, star_cost, color, description, keywords, spawns_cards, vars, upgrade, tags, starter',
        schema: `card_id TEXT, name TEXT NOT NULL, type TEXT, rarity TEXT, cost INTEGER, is_x_cost INTEGER, is_x_star_cost INTEGER, star_cost INTEGER, color TEXT, description TEXT, keywords TEXT, spawns_cards TEXT, vars TEXT, upgrade TEXT, tags TEXT, starter INTEGER`,
        map: (c) => [
            c.id, 
            c.name, 
            c.type, 
            c.rarity, 
            c.cost, 
            c.is_x_cost ? 1 : 0, 
            c.is_x_star_cost ? 1 : 0, 
            c.star_cost, 
            c.color, 
            c.description_raw || '', 
            c.keywords ? JSON.stringify(c.keywords) : null, 
            c.spawns_cards ? JSON.stringify(c.spawns_cards) : null, 
            c.vars ? JSON.stringify(c.vars) : null, 
            c.upgrade ? JSON.stringify(c.upgrade) : null, 
            c.tags ? JSON.stringify(c.tags) : null, 
            starterCards.has((c.id || '').toUpperCase()) ? 1 : 0
        ]
    },
    {
        name: 'characters',
        file: 'characters.json',
        columns: 'character_id, name, hp, gold, energy, description, deck, relics',
        schema: `character_id TEXT, name TEXT NOT NULL, hp INTEGER, gold INTEGER, energy INTEGER, description TEXT, deck TEXT, relics TEXT`,
        map: (c) => [c.id ?? c.character, c.name, c.hp ?? c.starting_hp ?? c.StartingHp ?? c.max_hp, c.gold ?? c.starting_gold ?? c.StartingGold, c.energy ?? c.max_energy ?? c.MaxEnergy ?? c.energy_per_turn, c.description || '', JSON.stringify(c.deck ?? c.starting_deck ?? c.StartingDeck ?? []), JSON.stringify(c.relics ?? c.starting_relics ?? c.StartingRelics ?? [])]
    },
    {
        name: 'afflictions',
        file: 'afflictions.json',
        columns: 'affliction_id, name, description, extra_card_text, is_stackable',
        schema: `affliction_id TEXT, name TEXT NOT NULL, description TEXT, extra_card_text TEXT, is_stackable INTEGER`,
        map: (a) => [a.id, a.name, a.description, a.extra_card_text, a.is_stackable ? 1 : 0]
    },
    {
        name: 'acts',
        file: 'acts.json',
        columns: 'act_id, name, num_rooms, bosses, ancients, events, encounters',
        schema: `act_id TEXT, name TEXT NOT NULL, num_rooms INTEGER, bosses TEXT, ancients TEXT, events TEXT, encounters TEXT`,
        map: (a) => [a.id, a.name, a.num_rooms, JSON.stringify(a.bosses || []), JSON.stringify(a.ancients || []), JSON.stringify(a.events || []), JSON.stringify(a.encounters || [])]
    },
    {
        name: 'achievements',
        file: 'achievements.json',
        columns: 'achievement_id, name, description',
        schema: `achievement_id TEXT, name TEXT NOT NULL, description TEXT`,
        map: (a) => [a.id, a.name, a.description]
    },
    {
        name: 'ascensions',
        file: 'ascensions.json',
        columns: 'ascension_id, level, name, description',
        schema: `ascension_id TEXT, level INTEGER, name TEXT NOT NULL, description TEXT`,
        map: (a) => [a.id, a.level, a.name, a.description]
    },
    {
        name: 'enchantments',
        file: 'enchantments.json',
        columns: 'enchantment_id, name, description, description_raw, extra_card_text, card_type, is_stackable, image_url',
        schema: `enchantment_id TEXT, name TEXT NOT NULL, description TEXT, description_raw TEXT, extra_card_text TEXT, card_type TEXT, is_stackable INTEGER, image_url TEXT`,
        map: (e) => [e.id, e.name, e.description, e.description_raw, e.extra_card_text, e.card_type, e.is_stackable ? 1 : 0, e.image_url]
    },
    {
        name: 'encounters',
        file: 'encounters.json',
        columns: 'encounter_id, name, room_type, is_weak, act, tags, monsters, loss_text',
        schema: `encounter_id TEXT, name TEXT NOT NULL, room_type TEXT, is_weak INTEGER, act TEXT, tags TEXT, monsters TEXT, loss_text TEXT`,
        map: (e) => [e.id, e.name, e.room_type, e.is_weak ? 1 : 0, e.act, JSON.stringify(e.tags || []), JSON.stringify(e.monsters || []), e.loss_text]
    },
    {
        name: 'events',
        file: 'events.json',
        columns: 'event_id, name, type, act, description, options, pages',
        schema: `event_id TEXT, name TEXT NOT NULL, type TEXT, act TEXT, description TEXT, options TEXT, pages TEXT`,
        map: (e) => [e.id, e.name, e.type, e.act, e.description, JSON.stringify(e.options || []), JSON.stringify(e.pages || [])]
    },
    {
        name: 'epochs',
        file: 'epochs.json',
        columns: 'epoch_id, title, era, era_name, era_year, era_position, story_id, sort_order, description, unlock_info, unlock_text, unlocks_cards, unlocks_relics, unlocks_potions, expands_timeline',
        schema: `epoch_id TEXT, title TEXT, era TEXT, era_name TEXT, era_year TEXT, era_position INTEGER, story_id TEXT, sort_order INTEGER, description TEXT, unlock_info TEXT, unlock_text TEXT, unlocks_cards TEXT, unlocks_relics TEXT, unlocks_potions TEXT, expands_timeline TEXT`,
        map: (e) => [e.id, e.title, e.era, e.era_name, e.era_year, e.era_position, e.story_id, e.sort_order, e.description, e.unlock_info, e.unlock_text, JSON.stringify(e.unlocks_cards || []), JSON.stringify(e.unlocks_relics || []), JSON.stringify(e.unlocks_potions || []), JSON.stringify(e.expands_timeline || [])]
    },
    {
        name: 'keywords',
        file: 'keywords.json',
        columns: 'keyword_id, name, description',
        schema: `keyword_id TEXT, name TEXT NOT NULL, description TEXT`,
        map: (k) => [k.id, k.name, k.description]
    },
    {
        name: 'intents',
        file: 'intents.json',
        columns: 'intent_id, name, description',
        schema: `intent_id TEXT, name TEXT NOT NULL, description TEXT`,
        map: (i) => [i.id, i.name, i.description]
    },
    {
        name: 'modifiers',
        file: 'modifiers.json',
        columns: 'modifier_id, name, description',
        schema: `modifier_id TEXT, name TEXT NOT NULL, description TEXT`,
        map: (m) => [m.id, m.name, m.description]
    },
    {
        name: 'monsters',
        file: 'monsters.json',
        columns: 'monster_id, name, type, min_hp, max_hp, min_hp_ascension, max_hp_ascension, moves, damage_values, block_values, image_url',
        schema: `monster_id TEXT, name TEXT NOT NULL, type TEXT, min_hp INTEGER, max_hp INTEGER, min_hp_ascension INTEGER, max_hp_ascension INTEGER, moves TEXT, damage_values TEXT, block_values TEXT, image_url TEXT`,
        map: (m) => [m.id, m.name, m.type, m.min_hp, m.max_hp, m.min_hp_ascension, m.max_hp_ascension, JSON.stringify(m.moves || []), JSON.stringify(m.damage_values || {}), JSON.stringify(m.block_values || {}), m.image_url]
    },
    {
        name: 'orbs',
        file: 'orbs.json',
        columns: 'orb_id, name, description, description_raw',
        schema: `orb_id TEXT, name TEXT NOT NULL, description TEXT, description_raw TEXT`,
        map: (o) => [o.id, o.name, o.description, o.description_raw]
    },
    {
        name: 'potions',
        file: 'potions.json',
        columns: 'potion_id, name, description, description_raw, rarity, image_url, pool',
        schema: `potion_id TEXT, name TEXT NOT NULL, description TEXT, description_raw TEXT, rarity TEXT, image_url TEXT, pool TEXT`,
        map: (p) => [p.id, p.name, p.description, p.description_raw, p.rarity, p.image_url, p.pool]
    },
    {
        name: 'powers',
        file: 'powers.json',
        columns: 'power_id, name, description, description_raw, type, stack_type, allow_negative, image_url',
        schema: `power_id TEXT, name TEXT NOT NULL, description TEXT, description_raw TEXT, type TEXT, stack_type TEXT, allow_negative INTEGER, image_url TEXT`,
        map: (p) => [p.id, p.name, p.description, p.description_raw, p.type, p.stack_type, p.allow_negative ? 1 : 0, p.image_url]
    },
    {
        name: 'relics',
        file: 'relics.json',
        columns: 'relic_id, name, description, description_raw, flavor, rarity, pool, image_url, starter',
        schema: `relic_id TEXT, name TEXT NOT NULL, description TEXT, description_raw TEXT, flavor TEXT, rarity TEXT, pool TEXT, image_url TEXT, starter INTEGER`,
        map: (r) => [r.id, r.name, r.description, r.description_raw, r.flavor, r.rarity, r.pool, r.image_url, starterRelics.has((r.id || '').toUpperCase()) ? 1 : 0]
    },
    {
        name: 'stories',
        file: 'stories.json',
        columns: 'story_id, name, epochs',
        schema: `story_id TEXT, name TEXT, epochs TEXT`,
        map: (s) => [s.id, s.name, JSON.stringify(s.epochs || [])]
    }
];

async function run() {
    try {
        ensureDir(path.dirname(PATHS.DATABASE));
        const db = new sqlite3.Database(PATHS.DATABASE);

        // Using serialize to ensure the schema is ready before insertion
        db.serialize(() => {
            for (const table of TABLES) {
                db.run(`DROP TABLE IF EXISTS ${table.name}`);
                db.run(`CREATE TABLE IF NOT EXISTS ${table.name} (id INTEGER PRIMARY KEY AUTOINCREMENT, ${table.schema})`);
            }

            db.run("BEGIN TRANSACTION");
            
            for (const table of TABLES) {
                const filePath = path.join(PATHS.CODEX_DATA, table.file);
                if (!fs.existsSync(filePath)) {
                    console.warn(`⚠️ Source file not found: ${filePath}. Skipping ${table.name} import.`);
                    continue;
                }

                const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                console.log(`🚀 Importing ${data.length} items into ${table.name}...`);

                const placeholders = table.columns.split(',').map(() => '?').join(', ');
                const stmt = db.prepare(`INSERT INTO ${table.name} (${table.columns}) VALUES (${placeholders})`);

                for (const item of data) {
                    stmt.run(...table.map(item));
                }
                stmt.finalize();
            }

            db.run("COMMIT", () => {
                console.log('✨ Success: All data imported to local database.');
                db.close();
            });
        });

    } catch (error) {
        console.error('❌ Import failed:', error.message);
        process.exit(1);
    }
}

run();