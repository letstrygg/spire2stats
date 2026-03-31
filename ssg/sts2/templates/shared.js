import fs from 'fs';
// --- BUILD DATE CONSTANTS ---
const BUILD_DATE = new Date();
export const FORMATTED_BUILD_DATE = BUILD_DATE.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
export const ISO_BUILD_DATE = BUILD_DATE.toISOString();

const CHARACTER_COLORS = {
    'IRONCLAD': '255, 101, 101',
    'SILENT': '127, 255, 0',
    'DEFECT': '135, 206, 235',
    'NECROBINDER': '193, 140, 255',
    'REGENT': '230, 126, 34'
};

/** Returns an inline style for 20% opacity character background */
export function getCharacterBgStyle(name) {
    if (!name) return '';
    // Normalize name: "Ironclad Pool" -> "IRONCLAD", "The Silent" -> "SILENT"
    const cleanName = name.toUpperCase().replace(/ POOL$/i, '').replace(/^THE\s+/i, '').trim();
    const rgb = CHARACTER_COLORS[cleanName];
    return rgb ? `background-color: rgba(${rgb}, 0.2);` : '';
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
    const completionHtml = seen === total ? total : `${seen} <span class="stat-sub">/ ${total} ${label.toLowerCase()}</span>`;
    return `
    <div class="stats-summary">
        <div class="stats-grid">
            <div class="stat-item"><div class="stat-label">Total Runs</div><div class="stat-value"><data value="${runStats.totalRuns}">${runStats.totalRuns}</data></div></div>
            <div class="stat-item"><div class="stat-label">Wins / Losses</div><div class="stat-value"><data value="${runStats.totalWins}"><span style="color: #00ff89">${runStats.totalWins}</span></data> <span style="color: #444">/</span> <data value="${runStats.totalLosses}"><span style="color: #ff4b4b">${runStats.totalLosses}</span></data></div></div>
            <div class="stat-item"><div class="stat-label">Overall Winrate</div><div class="stat-value"><data value="${runStats.globalWinRate.toFixed(1)}">${runStats.globalWinRate.toFixed(1)}%</data></div></div>
            <div class="stat-item"><div class="stat-label">Contributors</div><div class="stat-value">${runStats.uniqueUsers}</div></div>
            <div class="stat-item">
                <div class="stat-label">${label} Seen</div>
                <div class="stat-value"><data value="${seen}">${completionHtml}</data></div>
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

export function generateSemanticStatsParagraph(name, stats, contextLabel) {
    if (stats.seen === 0) return `<p>No runs recorded for the <strong>${name}</strong> ${contextLabel.toLowerCase()} yet.</p>`;
    return `
    <p>Based on tracked gameplay, <strong>${name}</strong> currently has a <data value="${stats.num}"><strong style="color: ${stats.color}">${stats.formatted}% winrate</strong></data> across <data value="${stats.seen}"><strong>${stats.seen} total runs</strong></data> (<span style="color: #00ff89">${stats.wins} Wins</span> / <span style="color: #ff4b4b">${stats.losses} Losses</span>) as of <time datetime="${ISO_BUILD_DATE}">${FORMATTED_BUILD_DATE}</time>.</p>`;
}

export function wrapLayout(title, content, breadcrumbs = [], description = "", headExtra = "") {
    const bcHtml = breadcrumbs.length > 0 
        ? `<nav class="breadcrumbs"><a href="/">spire2stats</a> / ${breadcrumbs.map((b, i) => i === breadcrumbs.length - 1 ? b.name.toLowerCase() : `<a href="${b.url}">${b.name.toLowerCase()}</a>`).join(' / ')}</nav>`
        : '';
    const metaDesc = description ? `<meta name="description" content="${description}">` : '';
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>${title} - Spire 2 Stats</title>
    ${metaDesc}
    <link rel="stylesheet" href="/css/main.css">
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />
    ${headExtra}
</head>
<body>${bcHtml}${content}</body></html>`;
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