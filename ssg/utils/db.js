import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// 1. Get exact directory of this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 2. Resolve the path to .env
const envPath = path.resolve(__dirname, '../../../.env');

// 3. Load the environment variables explicitly
dotenv.config({ path: envPath });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error(`❌ DB Init Error: Missing Supabase credentials. Looked in: ${envPath}`);
    process.exit(1);
}

export const supabase = createClient(supabaseUrl, supabaseKey);

export async function getFullEpisodeContext(videoId) {
    const { data, error } = await supabase
        .from('ltg_videos')
        .select(`
            *,
            ltg_playlist_videos!inner(
                sort_order,
                ltg_playlists!inner(
                    id, season, title, channel_slug,
                    ltg_series!inner(
                        slug, title,
                        ltg_games(slug, title, custom_abbr, tags)
                    )
                )
            )
        `)
        .eq('id', videoId)
        .single();

    if (error) throw error;
    return data;
}

export async function getAdjacentEpisodes(playlistId, currentSortOrder) {
    const { data: prevData } = await supabase
        .from('ltg_playlist_videos')
        .select('video_id, sort_order')
        .eq('playlist_id', playlistId)
        .lt('sort_order', currentSortOrder)
        .order('sort_order', { ascending: false })
        .limit(1)
        .single();

    const { data: nextData } = await supabase
        .from('ltg_playlist_videos')
        .select('video_id, sort_order')
        .eq('playlist_id', playlistId)
        .gt('sort_order', currentSortOrder)
        .order('sort_order', { ascending: true })
        .limit(1)
        .single();

    return { 
        prevSortOrder: prevData?.sort_order || null, 
        nextSortOrder: nextData?.sort_order || null 
    };
}

export async function getFullSeasonContext(playlistId) {
    const { data, error } = await supabase
        .from('ltg_playlists')
        .select(`
            id, season, channel_slug, sync_date, 
            ltg_series ( slug, title, ltg_games (slug, custom_abbr, tags) ),
            ltg_playlist_videos ( video_id, sort_order )
        `)
        .eq('id', playlistId)
        .single();

    if (error) throw error;
    return data;
}

export async function getFullSeriesContext(gameSlug, channelFamily = null) {
    const { data, error } = await supabase
        .from('ltg_series')
        .select(`
            slug, title, status,
            ltg_games!inner (slug, title, custom_abbr, tags),
            ltg_playlists (
                id, season, channel_slug, sync_date, title, playlist_type, 
                ltg_playlist_stats ( ep_count, total_views, total_likes, total_comments, total_duration, latest_published_at, first_published_at, first_video_id ),
                ltg_playlist_videos ( sort_order )
            )
        `)
        .eq('game_slug', gameSlug);

    if (error) throw error;

    let processedData = data;
    processedData.forEach(series => {
        if (series.ltg_playlists) {
            series.ltg_playlists = series.ltg_playlists.filter(p => {
                if (p.playlist_type !== 'game') return false;
                if (channelFamily && Array.isArray(channelFamily) && channelFamily.length > 0) {
                    return channelFamily.includes(p.channel_slug);
                }
                return true;
            });
        }
    });
    
    processedData = processedData.filter(s => s.ltg_playlists && s.ltg_playlists.length > 0);
    
    if (!processedData || processedData.length === 0) {
        throw new Error(`No valid game series found attached to game slug: '${gameSlug}'.`);
    }
    return processedData;
}

export async function getChannelContext(targetSlug) {
    // 1. Fetch channel family AND display names
    const { data: familyData } = await supabase
        .from('ltg_channels')
        .select('slug, display_name, parent_channel')
        .or(`slug.eq.${targetSlug},parent_channel.eq.${targetSlug}`);

    const slugsToFetch = familyData.map(c => c.slug);
    const parentChannel = familyData.find(c => c.slug === targetSlug);
    const parentDisplayName = parentChannel?.display_name || targetSlug;

    // 2. Fetch playlists, games, tags, AND FULL STATS
    const { data, error } = await supabase
        .from('ltg_playlists')
        .select(`
            id, channel_slug,
            ltg_series!inner (
                ltg_games!inner ( slug, title, custom_abbr, tags )
            ),
            ltg_playlist_stats (
                ep_count, total_views, total_likes, total_comments, total_duration,
                latest_published_at, first_published_at, first_video_id
            )
        `)
        .in('channel_slug', slugsToFetch)
        .eq('playlist_type', 'game'); 

    if (error) throw error;
    if (!data || data.length === 0) {
        throw new Error(`No playlists found for channel family: '${slugsToFetch.join(', ')}'.`);
    }

    // 3. Group games and attach their stats
    const channelsMap = new Map();
    slugsToFetch.forEach(slug => channelsMap.set(slug, new Map()));

    data.forEach(p => {
        const cSlug = p.channel_slug;
        const game = p.ltg_series.ltg_games;
        const gameMap = channelsMap.get(cSlug);
        
        if (!gameMap.has(game.slug)) {
            gameMap.set(game.slug, {
                slug: game.slug,
                title: game.title,
                custom_abbr: game.custom_abbr,
                tags: game.tags || [],
                channelOwner: cSlug,
                ltg_series_playlists: []
            });
        }

        gameMap.get(game.slug).ltg_series_playlists.push({
            ltg_playlists: {
                id: p.id,
                ltg_playlist_stats: p.ltg_playlist_stats
            }
        });
    });

    const formattedChannels = Array.from(channelsMap.entries())
        .map(([slug, gamesMap]) => {
            const chanInfo = familyData.find(c => c.slug === slug);
            return {
                channelSlug: slug,
                displayName: chanInfo?.display_name || slug,
                isParent: slug === targetSlug,
                games: Array.from(gamesMap.values())
            };
        })
        .filter(c => c.games.length > 0); 

    return {
        hubSlug: targetSlug,
        hubDisplayName: parentDisplayName,
        channels: formattedChannels 
    };
}

export async function updateSeriesSyncDateByPlaylist(playlistId) {
    const { data: playlist, error: fetchError } = await supabase
        .from('ltg_playlists')
        .select('series_slug, ltg_series (game_slug)')
        .eq('id', playlistId)
        .single();

    if (fetchError || !playlist?.series_slug) return null;

    const { error: updateError } = await supabase
        .from('ltg_series')
        .update({ sync_date: new Date().toISOString() })
        .eq('slug', playlist.series_slug);

    if (updateError) return null;
    return playlist.ltg_series?.game_slug || playlist.series_slug.toLowerCase();
}