import { supabase } from '../utils/db.js';

// Helper to convert "CARD.IRON_WAVE" -> "slay-the-spire-2:card:iron-wave"
function formatTag(prefix, rawType, rawValue) {
    if (!rawValue) return null;
    const cleanValue = rawValue.replace(`${rawType}.`, '').toLowerCase().replace(/_/g, '-');
    return `slay-the-spire-2:${prefix}:${cleanValue}`;
}

export async function generateAutoTags() {
    console.log(`\n🤖 Generating Auto-Tags from Mapped Runs...`);

    // 1. Fetch runs that are actually mapped to a video
    const { data: runs, error } = await supabase
        .from('ltg_sts2_runs')
        .select('video_id, character, deck_list, relic_list, event_list')
        .not('video_id', 'is', null);

    if (error || !runs) {
        console.error("❌ Error fetching mapped runs:", error?.message);
        return;
    }

    // 2. Group and deduplicate tags by video_id
    const videoTags = new Map();

    runs.forEach(run => {
        if (!videoTags.has(run.video_id)) videoTags.set(run.video_id, new Set());
        const tagsSet = videoTags.get(run.video_id);

        // Add Character
        if (run.character) {
            tagsSet.add(formatTag('character', 'CHARACTER', run.character));
        }

        // Add Relics
        if (run.relic_list) {
            run.relic_list.forEach(relic => {
                tagsSet.add(formatTag('relic', 'RELIC', relic));
            });
        }
        
        // Add ALL Events
        if (run.event_list) {
            run.event_list.forEach(event => {
                tagsSet.add(formatTag('event', 'EVENT', event));
            });
        }

        // Add Cards & Enchantments
        if (run.deck_list) {
            run.deck_list.forEach(card => {
                tagsSet.add(formatTag('card', 'CARD', card.id));
                if (card.enchantment) {
                    tagsSet.add(formatTag('enchantment', 'ENCHANTMENT', card.enchantment));
                }
            });
        }
    });

    // 3. Batch push the auto-tags back to the ltg_videos table
    const updates = Array.from(videoTags.entries()).map(([videoId, tagsSet]) => ({
        id: videoId,
        auto_tags: Array.from(tagsSet)
    }));

    if (updates.length > 0) {
        console.log(`🚀 Pushing auto-tags to ${updates.length} videos...`);
        
        // We use a Promise.all loop with .update() to ensure we don't accidentally overwrite views/likes via an upsert
        const updatePromises = updates.map(u =>
            supabase.from('ltg_videos').update({ auto_tags: u.auto_tags }).eq('id', u.id)
        );

        await Promise.all(updatePromises);
        console.log(`✅ Auto-tags successfully generated and saved!`);
    } else {
        console.log(`✅ No mapped runs found to generate tags for.`);
    }
}

// Run if called directly
if (process.argv[1].endsWith('generateAutoTags.js')) {
    generateAutoTags();
}