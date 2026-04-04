import fs from 'fs';
// --- BUILD DATE CONSTANTS ---
const BUILD_DATE = new Date();
export const FORMATTED_BUILD_DATE = BUILD_DATE.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
export const ISO_BUILD_DATE = BUILD_DATE.toISOString();

export const CHARACTER_COLORS = {
    'IRONCLAD': 'var(--color-ironclad)',
    'SILENT': 'var(--color-silent)',
    'DEFECT': 'var(--color-defect)',
    'NECROBINDER': 'var(--color-necrobinder)',
    'REGENT': 'var(--color-regent)'
};

/** Helper for win rate text color logic */
export function getWinRateColor(seen, winRateNum, globalWinRate) {
    if (seen === 0) return 'var(--gray)';
    if (winRateNum > globalWinRate) return 'var(--green)';
    if (winRateNum < globalWinRate) return 'var(--red)';
    return 'var(--gray)';
}

/** Returns an inline style for 30% opacity character background */
export function getCharacterBgStyle(name) {
    if (!name) return '';
    // Normalize name: "Ironclad Pool" -> "IRONCLAD", "The Silent" -> "SILENT"
    const cleanName = name.toUpperCase().replace(/ POOL$/i, '').replace(/^THE\s+/i, '').trim();
    const colorVar = CHARACTER_COLORS[cleanName];
    return colorVar ? `background-color: color-mix(in srgb, ${colorVar} 30%, transparent);` : '';
}

/** Generates dropdown filter controls */
export function generateFilterControlsHtml() {
    return `
    <div class="filter-controls" style="display: flex; gap: 10px;">
        <select id="build-filter" style="background: #222; color: #eee; border: 1px solid #444; padding: 5px 10px; border-radius: 4px; cursor: pointer;">
            <option value="all">All Versions</option>
            <option value="beta">v0.100.0+ (Beta)</option>
            <option value="legacy">Below v0.100.0</option>
        </select>
        <select id="ascension-filter" style="background: #222; color: #eee; border: 1px solid #444; padding: 5px 10px; border-radius: 4px; cursor: pointer;">
            <option value="all">All Ascensions</option>
            <option value="a10">Ascension 10</option>
            <option value="a0-9">Ascension 0-9</option>
        </select>
    </div>`;
}

/** Generates the JS required for client-side filtering and stat updates */
export function generateFilterScript(globalWinRate) {
    return `
    <script>
        document.addEventListener('DOMContentLoaded', function() {
            const buildFilter = document.getElementById('build-filter');
            const ascFilter = document.getElementById('ascension-filter');
            const runCards = document.querySelectorAll('.run-record');
            const globalWR = ${globalWinRate};

            function updateFilters() {
                const buildVal = buildFilter.value;
                const ascVal = ascFilter.value;
                
                let filteredTotal = 0;
                let filteredWins = 0;

                runCards.forEach(card => {
                    const build = card.dataset.build || 'v0.0.0';
                    const asc = parseInt(card.dataset.ascension || 0);
                    const win = card.dataset.win === '1';

                    // Build Filter Logic (Beta is v0.100+)
                    const buildParts = build.replace('v', '').split('.').map(Number);
                    const isBeta = buildParts[0] > 0 || buildParts[1] >= 100;
                    const buildMatch = buildVal === 'all' || 
                                      (buildVal === 'beta' && isBeta) || 
                                      (buildVal === 'legacy' && !isBeta);

                    // Ascension Filter Logic
                    const ascMatch = ascVal === 'all' || 
                                    (ascVal === 'a10' && asc === 10) || 
                                    (ascVal === 'a0-9' && asc < 10);

                    if (buildMatch && ascMatch) {
                        card.style.display = 'flex';
                        filteredTotal++;
                        if (win) filteredWins++;
                    } else {
                        card.style.display = 'none';
                    }
                });

                // Update Summary Stats via DOM IDs
                const filteredLosses = filteredTotal - filteredWins;
                const wrNum = filteredTotal > 0 ? (filteredWins / filteredTotal) * 100 : 0;
                
                const totalEl = document.getElementById('stat-total-val');
                const winsEl = document.getElementById('stat-wins-val');
                const lossEl = document.getElementById('stat-losses-val');
                const wrValEl = document.getElementById('stat-wr-val');

                if (totalEl) totalEl.textContent = filteredTotal;
                if (winsEl) winsEl.textContent = filteredWins;
                if (lossEl) lossEl.textContent = filteredLosses;
                if (wrValEl) {
                    wrValEl.textContent = wrNum.toFixed(1) + '%';
                    // Update Winrate Color
                    if (filteredTotal === 0) wrValEl.style.color = 'var(--gray)';
                    else if (wrNum > globalWR) wrValEl.style.color = 'var(--green)';
                    else if (wrNum < globalWR) wrValEl.style.color = 'var(--red)';
                    else wrValEl.style.color = 'var(--gray)';
                }
            }

            if (buildFilter) buildFilter.addEventListener('change', updateFilters);
            if (ascFilter) ascFilter.addEventListener('change', updateFilters);
        });
    </script>`;
}

/** Standardizes item statistics for display */
export function getItemStats(stats, globalWinRate) {
    const seen = stats?.seen || 0;
    const wins = stats?.wins || 0;
    const num = seen > 0 ? (wins / seen) * 100 : 0;
    const losses = seen - wins;
    return {
        seen, wins, losses, num,
        formatted: num.toFixed(1),
        color: getWinRateColor(seen, num, globalWinRate),
        bar: `background: linear-gradient(to right, #00ff89 ${num}%, #ff4b4b ${num}%);`,
        text: seen > 0 ? `${num.toFixed(0)}% Winrate` : ''
    };
}

export function generateItemJsonLd(name, category, stats) {
    const wr = stats?.formatted || "0.0";
    const seen = stats?.seen || 0;
    return `
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "ItemPage",
  "name": "${name} - Spire 2 Stats",
  "description": "${name} gameplay statistics for Slay the Spire 2. Winrate: ${wr}%. Total Runs: ${seen}.",
  "dateModified": "${ISO_BUILD_DATE}",
  "mainEntity": {
    "@type": "Thing",
    "name": "${name}",
    "alternateName": "Slay the Spire 2 ${category}"
  }
}
</script>`;
}

export function generateCollectionJsonLd(name, description) {
    return `
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "name": "${name} - Spire 2 Stats",
  "description": "${description}",
  "dateModified": "${ISO_BUILD_DATE}"
}
</script>`;
}

export function generateSummaryPanel(runStats, label, total, seen) {
    const completionHtml = seen === total ? total : `${seen} <span style="color: #444; font-size: 0.8em;">/ ${total}</span>`;
    return `
    <div class="averages-panel" style="margin: 20px 0; background: rgba(0,0,0,0.2); padding: 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
        <div class="stats-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px;">
            <div class="stat-item" style="text-align: center;">
                <div class="stat-label" style="font-size: 0.7rem; color: #666; text-transform: uppercase;">Total Runs</div>
                <div class="stat-value" id="global-total-runs" style="font-size: 1.2rem; font-weight: bold;">${runStats.totalRuns}</div>
            </div>
            <div class="stat-item" style="text-align: center;">
                <div class="stat-label" style="font-size: 0.7rem; color: #666; text-transform: uppercase;">Overall Winrate</div>
                <div class="stat-value" id="global-winrate" style="font-size: 1.2rem; font-weight: bold; color: #00ff89">${runStats.globalWinRate.toFixed(1)}%</div>
            </div>
            <div class="stat-item" style="text-align: center;">
                <div class="stat-label" style="font-size: 0.7rem; color: #666; text-transform: uppercase;">${label} Seen</div>
                <div class="stat-value" style="font-size: 1.2rem; font-weight: bold;">${completionHtml}</div>
            </div>
        </div>
    </div>`;
}

export function generateVideoPanel(videos, title = "Associated Runs") {
    if (!videos || videos.length === 0) return '';
    const videoLinks = videos.map(v => {
        let buttons = '';
        if (v.ltg) buttons += `<a href="https://letstrygg.com${v.ltg}" class="vid-btn ltg-btn" target="_blank">Run Summary</a>`;
        if (v.yt) buttons += `<a href="https://www.youtube.com/watch?v=${v.yt}" class="vid-btn yt-btn" target="_blank"><span class="material-symbols-outlined">smart_display</span> YouTube</a>`;
        return `<div class="video-panel">${buttons}</div>`;
    }).join('');
    return `<div class="featured-videos"><h3>${title}</h3><div class="video-grid">${videoLinks}</div></div>`;
}

/** Generates a summary box for monster/encounter lethality */
export function generateLethalitySummaryBox(stats, label = "Monster") {
    const encounteredLabel = label === "Monster" ? "Times Encountered" : "Times Faced";
    const killsLabel = label === "Monster" ? "Total Kills" : "Player Kills";
    return `
    <div class="averages-panel" style="margin: 20px 0; background: rgba(0,0,0,0.2); padding: 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
        <div class="stats-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px;">
            <div class="stat-item" style="text-align: center;">
                <div class="stat-label" style="font-size: 0.7rem; color: #666; text-transform: uppercase;">${encounteredLabel}</div>
                <div class="stat-value" style="font-size: 1.5rem; font-weight: bold;">${stats.encountered || 0}</div>
            </div>
            <div class="stat-item" style="text-align: center;">
                <div class="stat-label" style="font-size: 0.7rem; color: #666; text-transform: uppercase;">${killsLabel}</div>
                <div class="stat-value" style="font-size: 1.5rem; font-weight: bold; color: #ff4b4b">${stats.kills || 0}</div>
            </div>
        </div>
    </div>`;
}

/** Generates a global summary box for the monsters/encounters index page */
export function generateLethalityIndexSummary(runStats, lethalStats, label, totalCount, seenCount) {
    let totalFaced = 0;
    let totalKills = 0;
    Object.values(lethalStats).forEach(s => {
        totalFaced += (s.encountered || 0);
        totalKills += (s.kills || 0);
    });

    const lethalityRate = totalFaced > 0 ? ((totalKills / totalFaced) * 100).toFixed(1) : "0.0";
    const completionHtml = seenCount === totalCount ? totalCount : `${seenCount} <span style="color: #444; font-size: 0.8em;">/ ${totalCount}</span>`;

    return `
    <div class="averages-panel" style="margin: 20px 0; background: rgba(0,0,0,0.2); padding: 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
        <div class="stats-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px;">
            <div class="stat-item" style="text-align: center;">
                <div class="stat-label" style="font-size: 0.7rem; color: #666; text-transform: uppercase;">Total ${label} Faced</div>
                <div class="stat-value" style="font-size: 1.5rem; font-weight: bold;">${totalFaced}</div>
            </div>
            <div class="stat-item" style="text-align: center;">
                <div class="stat-label" style="font-size: 0.7rem; color: #666; text-transform: uppercase;">Player Kills</div>
                <div class="stat-value" style="font-size: 1.5rem; font-weight: bold; color: #ff4b4b">${totalKills}</div>
            </div>
            <div class="stat-item" style="text-align: center;">
                <div class="stat-label" style="font-size: 0.7rem; color: #666; text-transform: uppercase;">Avg Lethality</div>
                <div class="stat-value" style="font-size: 1.5rem; font-weight: bold; color: #ff4b4b">${lethalityRate}%</div>
            </div>
            <div class="stat-item" style="text-align: center;">
                <div class="stat-label" style="font-size: 0.7rem; color: #666; text-transform: uppercase;">${label} Seen</div>
                <div class="stat-value" style="font-size: 1.5rem; font-weight: bold;">${completionHtml}</div>
            </div>
        </div>
    </div>`;
}

/** Generates a summary of average stats for encounters/events/monsters */
export function generateAveragesPanel(stats, count, title = "Averages") {
    if (!count || count === 0) return '';
    const avg = (val) => (val / count).toFixed(1);
    const goldTotal = (stats.gold_lost || 0) + (stats.gold_stolen || 0);
    const maxHpDelta = (stats.max_hp_gained || 0) - (stats.max_hp_lost || 0);

    return `
    <div class="averages-panel" style="margin: 20px 0; background: rgba(0,0,0,0.2); padding: 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
        <h3 style="text-align: center; margin-top: 0; margin-bottom: 15px; color: #888; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 1px;">${title}</h3>
        <div class="stats-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px;">
            <div class="stat-item" style="text-align: center;">
                <div class="stat-label" style="font-size: 0.7rem; color: #666; text-transform: uppercase;">Avg Damage</div>
                <div class="stat-value" style="font-size: 1.2rem; font-weight: bold; color: #ff4b4b">${avg(stats.damage_taken || 0)}</div>
            </div>
            <div class="stat-item" style="text-align: center;">
                <div class="stat-label" style="font-size: 0.7rem; color: #666; text-transform: uppercase;">Avg Healed</div>
                <div class="stat-value" style="font-size: 1.2rem; font-weight: bold; color: #00ff89">${avg(stats.hp_healed || 0)}</div>
            </div>
            <div class="stat-item" style="text-align: center;">
                <div class="stat-label" style="font-size: 0.7rem; color: #666; text-transform: uppercase;">Avg Gold Loss</div>
                <div class="stat-value" style="font-size: 1.2rem; font-weight: bold; color: #ffb84b">${avg(goldTotal)}</div>
            </div>
            <div class="stat-item" style="text-align: center;">
                <div class="stat-label" style="font-size: 0.7rem; color: #666; text-transform: uppercase;">Max HP Change</div>
                <div class="stat-value" style="font-size: 1.2rem; font-weight: bold; color: ${maxHpDelta >= 0 ? '#00ff89' : '#ff4b4b'}">${maxHpDelta > 0 ? '+' : ''}${avg(maxHpDelta)}</div>
            </div>
        </div>
    </div>`;
}

/** Generates a grid of links to runs with embedded video buttons */
export function generateRunLinksList(runs, title = "Runs") {
    if (!runs || runs.length === 0) return '';
    
    const links = runs.map(run => generateRunCardHtml(run, { display_name: run.username, slug: run.username?.toLowerCase() })).join('');
    return `
    <div class="recent-runs" style="margin-top: 30px;">
        <h3 style="margin-bottom: 15px;">${title}</h3>
        <div class="grid">${links}</div>
    </div>`;
}

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

    let videoButtons = '';
    if (ytId || ltgUrl) {
        let btns = '';
        if (ltgUrl) {
            const match = ltgUrl.match(/s(\d+)e(\d+)\.html/i);
            const epLabel = match ? `S${match[1].padStart(2, '0')}E${match[2].padStart(2, '0')}` : 'Run';
            btns += `<a href="https://letstrygg.com${ltgUrl}" class="run-vid-btn ltg" target="_blank">${epLabel}</a>`;
        }
        if (ytId) {
            btns += `<a href="https://www.youtube.com/watch?v=${ytId}" class="run-vid-btn yt" target="_blank"><span class="material-symbols-outlined" style="color: #ff4b4b;">smart_display</span>YouTube</a>`;
        }
        videoButtons = `<div class="run-video-links">${btns}</div>`;
    }

    const buildId = run.build_id || 'v0.0.0';
    const ascension = run.ascension || 0;
    const winVal = run.win ? 1 : 0;

    return `
    <div class="card-item ${statusClass} ${charClass} run-record" 
         data-build="${buildId}" data-ascension="${ascension}" data-win="${winVal}" style="display: flex; flex-direction: column;">
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
        <div class="win-bar" style="background: ${statusColor};"></div>
    </div>`;
}
        

export function generateItemSummaryBox(name, stats) {
    if (!stats || stats.seen === 0) return `<div class="averages-panel" style="margin: 20px 0; background: rgba(0,0,0,0.2); padding: 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); text-align: center; color: #666;">No runs recorded for ${name} yet.</div>`;
    
    return `
    <div class="averages-panel" style="margin: 20px 0; background: rgba(0,0,0,0.2); padding: 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
        <div class="stats-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 10px;">
            <div class="stat-item" style="text-align: center;">
                <div class="stat-label" style="font-size: 0.7rem; color: #666; text-transform: uppercase;">Winrate</div>
                <div class="stat-value" id="stat-wr-val" style="font-size: 1.2rem; font-weight: bold; color: ${stats.color}">${stats.formatted}%</div>
            </div>
            <div class="stat-item" style="text-align: center;">
                <div class="stat-label" style="font-size: 0.7rem; color: #666; text-transform: uppercase;">Total Runs</div>
                <div class="stat-value" id="stat-total-val" style="font-size: 1.2rem; font-weight: bold;">${stats.seen}</div>
            </div>
            <div class="stat-item" style="text-align: center;">
                <div class="stat-label" style="font-size: 0.7rem; color: #666; text-transform: uppercase;">Wins</div>
                <div class="stat-value" id="stat-wins-val" style="font-size: 1.2rem; font-weight: bold; color: #00ff89">${stats.wins}</div>
            </div>
            <div class="stat-item" style="text-align: center;">
                <div class="stat-label" style="font-size: 0.7rem; color: #666; text-transform: uppercase;">Losses</div>
                <div class="stat-value" id="stat-losses-val" style="font-size: 1.2rem; font-weight: bold; color: #ff4b4b">${stats.losses}</div>
            </div>
        </div>
    </div>`;
}

export function generateSemanticStatsParagraph(name, stats, contextLabel) {
    return generateItemSummaryBox(name, stats);
}

export function wrapLayout(title, content, breadcrumbs = [], description = "", headExtra = "", canonicalPath = "") {
    const bcHtml = `<nav class="breadcrumbs" style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 20px;">
        <div>${breadcrumbs.length > 0 
            ? `<a href="/">spire2stats</a> / ${breadcrumbs.map((b, i) => i === breadcrumbs.length - 1 ? b.name.toLowerCase() : `<a href="${b.url}">${b.name.toLowerCase()}</a>`).join(' / ')}`
            : 'spire2stats'}</div>
        <div style="font-size: 0.75rem; color: #666; text-transform: uppercase;">Updated: <time datetime="${ISO_BUILD_DATE}">${FORMATTED_BUILD_DATE}</time></div>
    </nav>`;

    const canonicalUrl = canonicalPath ? `https://spire2stats.com${canonicalPath.endsWith('/') ? canonicalPath : canonicalPath + '/'}` : '';
    const canonicalHtml = canonicalUrl ? `<link rel="canonical" href="${canonicalUrl}">` : '';

    const displayTitle = title ? `${title} | Spire 2 Stats` : 'Spire 2 Stats';

    const socialMeta = `
    <meta property="og:site_name" content="Spire 2 Stats">
    <meta property="og:type" content="website">
    ${canonicalUrl ? `<meta property="og:url" content="${canonicalUrl}">` : ''}
    <meta property="og:title" content="${displayTitle}">
    <meta property="og:description" content="${description}">
    <!-- <meta property="og:image" content="https://spire2stats.com/images/default-run-preview.jpg"> -->
    <meta property="twitter:card" content="summary">
    ${canonicalUrl ? `<meta property="twitter:url" content="${canonicalUrl}">` : ''}
    <meta property="twitter:title" content="${displayTitle}">
    <meta property="twitter:description" content="${description}">
    <!-- <meta property="twitter:image" content="https://spire2stats.com/images/default-run-preview.jpg"> -->`;

    const breadcrumbJsonLd = breadcrumbs.length > 0 ? (() => {
        const listItems = [
            {
                "@type": "ListItem",
                "position": 1,
                "name": "spire2stats.com",
                "item": "https://spire2stats.com/"
            },
            ...breadcrumbs.map((b, i) => {
                const item = {
                    "@type": "ListItem",
                    "position": i + 2,
                    "name": b.name
                };
                if (b.url) item.item = `https://spire2stats.com${b.url.startsWith('/') ? b.url : '/' + b.url}`;
                return item;
            })
        ];
        return `\n<script type="application/ld+json">\n${JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": listItems
        }, null, 2)}\n</script>`;
    })() : '';

    const metaDesc = description ? `<meta name="description" content="${description}">` : '';
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="theme-color" content="#111111">
    <!-- Google Tag Manager -->
    <script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
    new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
    j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
    'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
    })(window,document,'script','dataLayer','GTM-W4TMS5FL');</script>
    <!-- End Google Tag Manager -->
    <meta charset="UTF-8">
    <title>${displayTitle}</title>
    ${metaDesc}
    ${socialMeta}
    ${canonicalHtml}
    ${breadcrumbJsonLd}
    <link rel="stylesheet" href="/css/main.css">
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />
    ${headExtra}
</head>
<body>
    <!-- Google Tag Manager (noscript) -->
    <noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-W4TMS5FL"
    height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
    <!-- End Google Tag Manager (noscript) -->
${bcHtml}${content}</body></html>`;
}

export function formatDescription(text) {
    if (!text) return "";
    return text
        .replace(/\[gold\](.*?)\[\/gold\]/g, '<span class="text-gold">$1</span>')
        .replace(/\[blue\](.*?)\[\/blue\]/g, '<span class="text-blue">$1</span>')
        .replace(/\[green\](.*?)\[\/green\]/g, '<span class="text-green">$1</span>')
        .replace(/\[red\](.*?)\[\/red\]/g, '<span class="text-red">$1</span>')
        .replace(/\[purple\](.*?)\[\/purple\]/g, '<span class="text-purple">$1</span>')
        .replace(/\[pink\](.*?)\[\/pink\]/g, '<span class="text-purple">$1</span>')
        .replace(/\[sine\](.*?)\[\/sine\]/g, '<em>$1</em>')
        .replace(/\[jitter\](.*?)\[\/jitter\]/g, '<strong>$1</strong>')
        .replace(/\[energy:(\d+)\]/ig, '<span class="icon-energy">[E]</span>')
        .replace(/\n/g, '<br>');
}

/**
 * Rich Sitemap Generator
 * Handles standard indexing
 */
export class Sitemap {
    constructor(baseUrl) {
        this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        this.urls = [];
    }

    add(path) {
        this.urls.push({
            loc: `${this.baseUrl}${path.startsWith('/') ? path : '/' + path}`,
            lastmod: ISO_BUILD_DATE
        });
    }

    generateXml() {
        const entries = this.urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
  </url>`).join('\n');

        return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>`;
    }

    save(outputPath) {
        fs.writeFileSync(outputPath, this.generateXml());
    }
}