import { slugify } from '../paths.js';
import { CHARACTER_COLORS } from './shared.js';

/** Generates a standard run card HTML used across the site */
export function generateRunCardHtml(run, user) {
    const charId = (run.character || 'Unknown').replace('CHARACTER.', '').toUpperCase();
    const charClass = charId.toLowerCase();
    const charColor = CHARACTER_COLORS[charId] || 'var(--gray)';
    const statusClass = run.win ? 'win' : 'loss';
    const statusText = run.win ? 'Victory' : 'Defeat';
    const statusColor = run.win ? 'var(--green)' : 'var(--red)';

    const ytId = run.yt_video || run.video?.yt;
    const ltgUrl = run.ltg_url || run.video?.ltg;
    
    let shorts = run.shorts ? (typeof run.shorts === 'string' ? JSON.parse(run.shorts) : run.shorts) : [];
    // Robustness: If we got a string back (double encoded), parse it again.
    if (typeof shorts === 'string') {
        try { shorts = JSON.parse(shorts); } catch (e) { shorts = []; }
    }
    if (!Array.isArray(shorts)) shorts = [];

    let videoButtons = '';
    if (ytId || ltgUrl || shorts.length > 0) {
        let btns = '';
        if (ltgUrl) {
            const match = ltgUrl.match(/s(\d+)e(\d+)\.html/i);
            const epLabel = match ? `S${match[1].padStart(2, '0')}E${match[2].padStart(2, '0')}` : 'Run';
            btns += `<a href="https://letstrygg.com${ltgUrl}" class="run-vid-btn ltg" target="_blank">${epLabel}</a>`;
        }
        if (ytId) {
            btns += `<a href="https://www.youtube.com/watch?v=${ytId}" class="run-vid-btn yt" target="_blank"><span class="material-symbols-outlined" style="color: #ff4b4b;">smart_display</span>YouTube</a>`;
        }
        if (shorts.length > 0) {
            btns += shorts.map(s => `<a href="https://www.youtube.com/shorts/${s}" class="run-vid-btn short" target="_blank" title="Watch Short" style="padding: 2px 8px; display: inline-flex; align-items: center;"><img src="/images/250px-Youtube_shorts_icon.svg.png" style="height: 20px; width: auto;" alt="YouTube Short"></a>`).join('');
        }
        videoButtons = `<div class="run-video-links">${btns}</div>`;
    }

    const buildId = run.build_id || 'v0.0.0';
    const ascension = run.ascension || 0;
    const winVal = run.win ? 1 : 0;

    return `
    <div class="card-item ${statusClass} ${charClass} run-record" 
         data-build="${buildId}" data-ascension="${ascension}" data-win="${winVal}" 
         data-user-id="${run.supabase_user_id || ''}" data-run-id="${run.id}"
         data-yt-video="${ytId || ''}" data-shorts='${JSON.stringify(shorts)}'
         style="display: flex; flex-direction: column; position: relative;">
        
        <span class="material-symbols-outlined edit-run-videos-btn" style="position: absolute; top: -2px; right: -2px; cursor: pointer; font-size: 1.2rem; display: none; z-index: 10;" title="Edit Video Links">settings</span>

        <a href="/users/${user.slug}/runs/${run.id}/" style="text-decoration: none; color: inherit; display: flex; justify-content: space-between; flex-grow: 1;">
            <div class="card-info">
                <span class="card-name" style="line-height: 1.1;">
                    <span style="font-size: 0.7rem; color: var(--gray); text-transform: uppercase; display: block;">${user.display_name}</span>
                    <span style="font-size: 0.7rem; color: var(--gray); font-weight: normal; display: block; margin-bottom: 2px;">Run ${run.user_run_num}</span>
                    <span style="color: ${charColor}">${charId}</span>
                </span>
            </div>
            <div class="card-stats">
                <div class="win-rate" style="color: ${statusColor}">${statusText}</div>
                <div class="run-count" style="font-size: 0.7rem; opacity: 0.6;">Build ${run.build_id || 'Unknown'}</div>
                <div class="run-count">Ascension ${run.ascension || 0}</div>
            </div>
        </a>
        ${videoButtons}
        <div class="run-edit-area" style="display: none;"></div>
        <div class="win-bar" style="background: ${statusColor};"></div>
    </div>`;
}

/** Generates a grid of links to runs with embedded video buttons */
export function generateRunLinksList(runs, title = "Runs") {
    if (!runs || runs.length === 0) return '';
    
    const links = runs.map(run => generateRunCardHtml(run, { display_name: run.username, slug: slugify(run.username || '') })).join('');
    return `
    <div class="recent-runs" style="margin-top: 30px;">
        <h3 style="margin-bottom: 15px;">${title}</h3>
        <div class="grid">${links}</div>
    </div>`;
}