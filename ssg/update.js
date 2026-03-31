import { supabase } from './utils/db.js';
import { updateEpisode } from './updaters/updateEpisode.js';
import { updateSeason } from './updaters/updateSeason.js'; 
import { updateSeries } from './updaters/updateSeries.js'; 
import { updateChannel } from './updaters/updateChannel.js';
import { updateTag } from './updaters/updateTag.js';
import { updateYT } from './updaters/updateYT.js';

const rawArgs = process.argv.slice(2);

// Extract flags safely so they don't break the command router
const forceUpdate = rawArgs.includes('--force') || rawArgs.includes('-f');

const options = { force: forceUpdate };

// Clean args to find the actual commands
const cleanArgs = rawArgs.filter(a => !a.startsWith('-'));
const command = cleanArgs[0];
const targetId = cleanArgs[1];

async function buildTheWorld() {
    console.log(`\n🌍 Initiating Full Network Rebuild...`);
    
    // 1. Fetch ONLY channels officially flagged to generate directories
    const { data: channels } = await supabase
        .from('ltg_channels')
        .select('slug')
        .eq('generate_dir', true); // <--- Updated flag here

    if (channels) {
        for (const ch of channels) {
            try {
                await updateChannel(ch.slug, options);
            } catch (err) {
                // Bulletproof the loop: If one channel fails, log it and keep going
                console.error(`  ⚠️ Warning: Skipped building channel '${ch.slug}' (${err.message})`);
            }
        }
    }

    // 2. Rebuild all Tags and the Tag Hub
    await updateTag(null, options);

    // 3. Rebuild the Master Network Hub
    await updateYT(options);
    
    console.log(`\n✨ Full Network Rebuild Complete!`);
}

async function cascadeChannelUpdate(slug) {
    console.log(`\n🌊 Cascading updates for channel: ${slug}...`);
    
    // 1. Build the specific channel
    await updateChannel(slug, options);
    
    // 2. Rebuild the Tags (since this channel's stats/videos might have changed tag data)
    await updateTag(null, options);
    
    // 3. Rebuild the Master Hub (to reflect new channel totals)
    await updateYT(options);
    
    console.log(`\n✨ Cascade Complete for ${slug}!`);
}

async function run() {
    // SCENARIO 1: No arguments passed -> Build Everything
    if (!command) {
        await buildTheWorld();
        return;
    }

    // SCENARIO 2: Channel Shortcut (e.g., `node ssg/update.js letstrygg`)
    // If the command isn't a known keyword, assume it's a channel slug shortcut
    const knownCommands = ['episode', 'season', 'series', 'channel', 'tag', 'yt'];
    if (!knownCommands.includes(command)) {
        await cascadeChannelUpdate(command);
        return;
    }

    // SCENARIO 3: Explicit Commands
    try {
        switch (command) {
            case 'episode':
                if (!targetId) throw new Error("Missing episode ID");
                await updateEpisode(targetId, options);
                break;
            case 'season':
                if (!targetId) throw new Error("Missing playlist ID");
                await updateSeason(targetId, options);
                break;
            case 'series':
                if (!targetId) throw new Error("Missing series slug");
                await updateSeries(targetId, options);
                // If we force a series update, we should refresh the channel index too
                if (options.force) {
                    await updateChannel(options.channelSlug || 'letstrygg', { ...options, indexesOnly: true });
                }
                break;
            case 'channel':
                if (!targetId) throw new Error("Missing channel slug");
                // Use the cascade function so it updates the hubs too!
                await cascadeChannelUpdate(targetId);
                break;
            case 'tag':
                await updateTag(targetId, options); // TargetId is optional here
                break;
            case 'yt':
                await updateYT(options);
                break;
            default:
                console.error(`❌ Unknown command: ${command}`);
                break;
        }
    } catch (err) {
        console.error(`\n❌ SSG Build Failed:`, err.message);
        process.exit(1);
    }
}

run();