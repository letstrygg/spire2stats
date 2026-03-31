import fs from 'fs';
import path from 'path';
import { supabase } from '../utils/db.js';

function isStarterCard(cardId) {
    return cardId.startsWith('CARD.STRIKE_') || cardId.startsWith('CARD.DEFEND_');
}

export async function syncSts2Runs() {
    console.log(`\n⚔️ Initiating Slay the Spire 2 Local Run Sync...`);

    const appData = process.env.APPDATA;
    if (!appData) {
        console.error("❌ Could not find %APPDATA% environment variable.");
        return;
    }

    const sts2SteamDir = path.join(appData, 'SlayTheSpire2', 'steam');
    if (!fs.existsSync(sts2SteamDir)) {
        console.error(`❌ Could not find STS2 Steam directory at: ${sts2SteamDir}`);
        return;
    }

    const steamIds = fs.readdirSync(sts2SteamDir).filter(f => fs.statSync(path.join(sts2SteamDir, f)).isDirectory());
    if (steamIds.length === 0) {
        console.error("❌ Could not find a Steam ID folder.");
        return;
    }

    const historyDir = path.join(sts2SteamDir, steamIds[0], 'profile1', 'saves', 'history');
    if (!fs.existsSync(historyDir)) {
        console.error(`❌ Could not find run history folder at: ${historyDir}`);
        return;
    }

    const runFiles = fs.readdirSync(historyDir).filter(f => f.endsWith('.run'));
    console.log(`📂 Found ${runFiles.length} local run files.`);

    if (runFiles.length === 0) return;

    const { data: existingRuns, error: fetchError } = await supabase
        .from('ltg_sts2_runs')
        .select('id, event_list');

    if (fetchError) {
        console.error("❌ Failed to fetch existing runs from database:", fetchError.message);
        return;
    }

    const existingIds = new Set();
    const needsBackfill = new Set();

    existingRuns.forEach(r => {
        existingIds.add(r.id);
        // If event_list is empty, flag it for a non-destructive backfill
        if (!r.event_list || r.event_list.length === 0) {
            needsBackfill.add(r.id);
        }
    });

    const newRunsToInsert = [];
    const runsToUpdate = [];

    const newFilesToProcess = runFiles.filter(file => !existingIds.has(file.replace('.run', '')));
    newFilesToProcess.sort((a, b) => parseInt(a.replace('.run', '')) - parseInt(b.replace('.run', '')));

    const { data: maxRunData } = await supabase.from('ltg_sts2_runs').select('run_number').order('run_number', { ascending: false }).limit(1);
    let nextRunNum = (maxRunData && maxRunData.length > 0) ? maxRunData[0].run_number + 1 : 1;

    for (const file of runFiles) {
        const runId = file.replace('.run', '');
        const filePath = path.join(historyDir, file);
        
        const isNew = !existingIds.has(runId);
        const needsUpdate = needsBackfill.has(runId);

        if (!isNew && !needsUpdate) continue;

        try {
            const rawData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            const player = rawData.players?.[0];
            if (!player) continue;

            // --- THE FIX: Extract events from deep inside map_point_history ---
            let cleanEvents = [];
            let currentFloor = 1;
            let floorHistory = [];

            if (rawData.map_point_history && rawData.map_point_history.length > 0) {
                const allFloors = rawData.map_point_history.flat();
                
                // Build the floor history for the graph
                floorHistory = allFloors.map(pt => {
                    const stats = pt.player_stats?.[0] || {};
                    return { floor: currentFloor++, type: pt.map_point_type, hp: stats.current_hp || 0, max_hp: stats.max_hp || 0, gold: stats.current_gold || 0 };
                });

                // Dig into the 'rooms' array of every floor to find events
                cleanEvents = allFloors.flatMap(pt => {
                    if (!pt.rooms) return [];
                    return pt.rooms
                        .filter(r => r.room_type === 'event' && r.model_id)
                        .map(r => r.model_id);
                });
            }
            // ------------------------------------------------------------------

            if (isNew) {
                const cleanDeck = player.deck.filter(c => !isStarterCard(c.id) || c.current_upgrade_level > 0 || c.enchantment).map(c => ({ id: c.id, upgrades: c.current_upgrade_level || 0, enchantment: c.enchantment?.id || null }));
                const cleanRelics = player.relics.map(r => r.id);

                const startTimeIso = new Date(parseInt(runId) * 1000).toISOString();

                newRunsToInsert.push({
                    id: runId,
                    run_number: nextRunNum++,
                    video_id: null,
                    start_time: startTimeIso,
                    run_time: rawData.run_time || 0,
                    character: player.character,
                    ascension: rawData.ascension || 0,
                    win: rawData.win || false,
                    killed_by: rawData.killed_by_encounter || rawData.killed_by_event || null,
                    deck_list: cleanDeck,
                    relic_list: cleanRelics,
                    event_list: cleanEvents,
                    floor_history: floorHistory
                });
            } else if (needsUpdate) {
                // For backfills, we only care about patching the events in
                runsToUpdate.push({ id: runId, event_list: cleanEvents });
            }

        } catch (err) {
            console.error(`⚠️ Failed to parse file ${file}:`, err.message);
        }
    }

    if (runsToUpdate.length > 0) {
        console.log(`🔧 Backfilling events for ${runsToUpdate.length} existing runs...`);
        const updatePromises = runsToUpdate.map(u => 
            supabase.from('ltg_sts2_runs').update({ event_list: u.event_list }).eq('id', u.id)
        );
        await Promise.all(updatePromises);
        console.log(`  ✅ Backfill complete!`);
    }

    if (newRunsToInsert.length > 0) {
        console.log(`🚀 Uploading ${newRunsToInsert.length} new runs to the database...`);
        const { error: insertError } = await supabase.from('ltg_sts2_runs').insert(newRunsToInsert);
        if (insertError) console.error("❌ Failed to insert new runs:", insertError.message);
        else console.log(`✅ Successfully synced ${newRunsToInsert.length} runs!`);
    } else {
        console.log(`✅ Database runs are up-to-date with local files.`);
    }
}

if (process.argv[1].endsWith('syncSts2Runs.js')) {
    syncSts2Runs();
}