import fs from 'fs';
import path from 'path';
import { PATHS, ensureDir, slugify } from './paths.js';
import { supabase } from '../utils/db.js';
import { buildStatsPage } from './build-stats.js';

// --- BUILD DATE CONSTANTS ---
const BUILD_DATE = new Date();
const FORMATTED_BUILD_DATE = BUILD_DATE.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
const ISO_BUILD_DATE = BUILD_DATE.toISOString();

/**
 * Helper to generate JSON-LD for individual item pages
 */
function generateItemJsonLd(name, category, stats) {
    const wr = stats ? ((stats.wins / stats.runs) * 100).toFixed(1) : "0.0";
    const runs = stats ? stats.runs : 0;
    return `
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "ItemPage",
  "name": "${name} - Slay the Spire 2",
  "description": "Gameplay statistics for ${name}. Winrate: ${wr}%. Total Runs: ${runs}.",
  "dateModified": "${ISO_BUILD_DATE}",
  "mainEntity": {
    "@type": "Thing",
    "name": "${name}",
    "alternateName": "Slay the Spire 2 ${category}"
  }
}
</script>`;
}

// --- TAG TO VIDEO MAPPER ---
async function fetchTagVideoMap(gameSlug = 'slay-the-spire-2') {
    const tagMap = {};
    console.log(`\n🔍 Fetching video tags from database to build cross-links...`);

    const { data, error } = await supabase
        .from('ltg_playlist_videos')
        .select(`
            sort_order,
            ltg_playlists!inner (
                season, channel_slug,
                ltg_series!inner ( game_slug, ltg_games ( custom_abbr, title ) ) 
            ),
            ltg_videos!inner ( id, title, auto_tags, published_at )
        `)
        .eq('ltg_playlists.ltg_series.game_slug', gameSlug);

    if (error) {
        console.error("❌ Error fetching videos for cross-linking:", error.message);
        return tagMap;
    }

    for (const row of data) {
        const v = row.ltg_videos;
        if (!v.auto_tags || v.auto_tags.length === 0) continue;

        const pl = row.ltg_playlists;
        const seasonNumSafe = pl.season.toString().replace('.', '_');
        const seasonParts = pl.season.toString().split('.');
        const paddedSeason = seasonParts[0].padStart(2, '0') + (seasonParts[1] ? '_' + seasonParts[1] : '');
        
        const paddedEpUrl = String(row.sort_order).padStart(2, '0');
        const formattedEpNum = String(row.sort_order).padStart(3, '0');
        
        const gameData = pl.ltg_series.ltg_games;
        const shortPrefix = gameData?.custom_abbr ? gameData.custom_abbr.toLowerCase() : gameSlug.split('-').map(w => isNaN(parseInt(w)) ? w[0] : w).join('').toLowerCase();
        
        const fileName = `${shortPrefix}-s${paddedSeason}e${paddedEpUrl}.html`;
        const url = `/yt/${pl.channel_slug}/${gameSlug}/season-${seasonNumSafe}/${fileName}`;

        const gameTitle = gameData?.title || 'Slay the Spire 2';
        const displayTitle = `${formattedEpNum} ${gameTitle}`;

        const videoObj = { id: v.id, title: displayTitle, url: url, date: v.published_at, epNum: row.sort_order };

        for (const tag of v.auto_tags) {
            if (tag.startsWith(`${gameSlug}:`)) {
                const strippedTag = tag.replace(`${gameSlug}:`, ''); 
                if (!tagMap[strippedTag]) tagMap[strippedTag] = [];
                tagMap[strippedTag].push(videoObj);
            }
        }
    }

    for (const key in tagMap) {
        tagMap[key] = tagMap[key].sort((a, b) => new Date(a.date) - new Date(b.date));
    }

    console.log(`✅ Indexed ${Object.keys(tagMap).length} unique tags across ${data.length} episodes.`);
    return tagMap;
}

// --- RUN STATS AGGREGATOR ---
async function fetchRunStatsMap() {
    console.log(`\n📊 Calculating run statistics (wins/losses) for all items...`);
    const statsMap = {};
    
    const { data: runs, error } = await supabase
        .from('ltg_sts2_runs')
        .select('win, character, deck_list, relic_list, event_list');

    if (error) {
        console.error("❌ Error fetching runs for stats:", error.message);
        return { statsMap, overallWinRate: 0, totalRuns: 0, totalWins: 0 };
    }

    const totalRuns = runs.length;
    const totalWins = runs.filter(r => r.win).length;
    const overallWinRate = totalRuns > 0 ? (totalWins / totalRuns) * 100 : 0;

    const addStat = (category, rawValue, win, isTypePrefixed = true) => {
        if (!rawValue) return;
        // Convert "CARD.STRIKE_R" -> "strike-r"
        const typePrefix = isTypePrefixed ? rawValue.split('.')[0] + '.' : '';
        const itemSlug = rawValue.replace(typePrefix, '').toLowerCase().replace(/_/g, '-');
        const key = `${category}:${itemSlug}`;
        
        if (!statsMap[key]) statsMap[key] = { runs: 0, wins: 0 };
        statsMap[key].runs++;
        if (win) statsMap[key].wins++;
    };

    runs.forEach(run => {
        // 1. Character (Unique by nature)
        if (run.character) {
            addStat('character', run.character, run.win);
        }

        // 2. Relics (Deduplicated)
        if (run.relic_list) {
            [...new Set(run.relic_list)].forEach(r => addStat('relic', r, run.win));
        }

        // 3. Events (Deduplicated)
        if (run.event_list) {
            [...new Set(run.event_list)].forEach(e => addStat('event', e, run.win));
        }

        // 4. Cards & Enchantments (Deduplicated)
        if (run.deck_list) {
            const uniqueCards = new Set();
            const uniqueEnchantments = new Set();
            run.deck_list.forEach(card => {
                uniqueCards.add(card.id);
                if (card.enchantment) uniqueEnchantments.add(card.enchantment);
            });
            uniqueCards.forEach(id => addStat('card', id, run.win));
            uniqueEnchantments.forEach(e => addStat('enchantment', e, run.win));
        }
    });

    return { statsMap, overallWinRate, totalRuns, totalWins };
}

/**
 * Helper to generate the stats row HTML for the index buttons
 */
function formatRunStatsRow(key, statsMap, overallWinRate) {
    const stats = statsMap[key];
    if (!stats || stats.runs === 0) return '';

    const losses = stats.runs - stats.wins;
    const wr = (stats.wins / stats.runs) * 100;
    const wrFormatted = wr.toFixed(0);
    
    let wrColor = 'var(--gray)'; // Equal
    if (wr > overallWinRate) wrColor = 'var(--green)';
    else if (wr < overallWinRate) wrColor = 'var(--red)';

    const ariaLabel = `${stats.runs} Runs, ${stats.wins} Wins, ${losses} Losses, ${wrFormatted}% Winrate`;

    return `
    <div aria-label="${ariaLabel}" style="font-size: 0.75rem; font-weight: normal; margin-top: 4px; color: var(--text-muted); display: flex; justify-content: center; gap: 6px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 4px;">
        <span aria-hidden="true">r: <data value="${stats.runs}"><strong>${stats.runs}</strong></data></span>
        <span aria-hidden="true">w: <data value="${stats.wins}"><strong style="color: var(--green);">${stats.wins}</strong></data></span>
        <span aria-hidden="true">l: <data value="${losses}"><strong style="color: var(--red);">${losses}</strong></data></span>
        <span aria-hidden="true">wr: <data value="${wrFormatted}"><strong style="color: ${wrColor};">${wrFormatted}%</strong></data></span>
    </div>`;
}

/**
 * Generates a linear-gradient background style based on winrate
 */
function getWinRateStyle(key, statsMap) {
    const stats = statsMap[key];
    if (!stats || stats.runs === 0) return '';
    const wr = (stats.wins / stats.runs) * 100;
    return `background: linear-gradient(90deg, rgb(0 255 137 / 37%) ${wr}%, rgb(255 75 75 / 32%) ${wr}%);`;
}

/**
 * Generates border color based on winrate vs average
 * Grey if no episodes
 */
function getBorderStyle(i, statsMap, overallWinRate) {
    if (i.videoCount <= 0) {
        return 'border-color: var(--gray);';
    }

    const stats = statsMap[i.statsKey];
    if (!stats || stats.runs === 0) return 'border-color: var(--gray);';

    const wr = (stats.wins / stats.runs) * 100;
    const color = wr >= overallWinRate ? '#8dff8d' : 'var(--red)';
    return `border-color: ${color};`;
}

/**
 * Helper to generate a stats summary panel for individual detail pages
 */
function generateItemStatsPanel(name, stats, overallWinRate) {
    if (!stats || stats.runs === 0) return '';
    const losses = stats.runs - stats.wins;
    const wr = (stats.wins / stats.runs) * 100;
    const winrate = wr.toFixed(1);

    let wrColor = 'var(--gray)';
    if (wr > overallWinRate) wrColor = '#8dff8d';
    else if (wr < overallWinRate) wrColor = 'var(--red)';

    return `
  <div style="background: #1a1a1a; border: 1px solid var(--border); padding: 20px; border-radius: 8px; margin-bottom: 30px;">
    <h2 style="margin-top: 0; font-size: 1.4rem;">${name} <span style="font-weight: normal; color: var(--gray); font-size: 0.9em;">Winrate & Run Stats</span></h2>
    <p style="margin-bottom: 0;">Based on my tracked gameplay, <strong>${name}</strong> currently has a <data value="${winrate}"><strong style="color: ${wrColor};">${winrate}% winrate</strong></data> across <data value="${stats.runs}"><strong>${stats.runs} total runs</strong></data> (<data value="${stats.wins}"><strong style="color: #8dff8d;">${stats.wins} Wins</strong></data> / <data value="${losses}"><strong style="color: var(--red);">${losses} Losses</strong></data>) as of <time datetime="${ISO_BUILD_DATE}">${FORMATTED_BUILD_DATE}</time>.</p>
  </div>`;
}

function getCountText(i) {
    return i.videoCount > 0 
        ? ` <span style="opacity: 0.6; font-size: 0.85em; color: var(--text);">(${i.videoCount})</span>` 
        : '';
}

// --- TEXT FORMATTERS ---
function formatSimpleText(rawText) {
    if (!rawText) return "";
    return rawText
        .replace(/\[gold\](.*?)\[\/gold\]/g, '<span class="yellow">$1</span>')
        .replace(/\[blue\](.*?)\[\/blue\]/g, '<span class="blue">$1</span>')
        .replace(/\[green\](.*?)\[\/green\]/g, '<span class="green">$1</span>')
        .replace(/\[red\](.*?)\[\/red\]/g, '<span class="red">$1</span>')
        .replace(/\[purple\](.*?)\[\/purple\]/g, '<span class="purple">$1</span>')
        .replace(/\[pink\](.*?)\[\/pink\]/g, '<span class="purple">$1</span>')
        .replace(/\[sine\](.*?)\[\/sine\]/g, '<em>$1</em>')
        .replace(/\[jitter\](.*?)\[\/jitter\]/g, '<strong>$1</strong>')
        .replace(/\[energy:\d+\]/ig, '<span class="yellow" title="Energy">[E]</span>')
        .replace(/\n/g, '<br>');
}

function formatCardText(rawText, currentVars, baseVars, isUpgraded = false) { 
    if (!rawText) return "";
    let formatted = formatSimpleText(rawText);

    formatted = formatted.replace(/\{([A-Za-z0-9_]+)(?::([^}]+))?\}/g, (match, varName, formatter) => {
        const key = varName.toLowerCase();
        
        if (key === 'ifupgraded') {
            const dataStr = formatter.startsWith('show:') ? formatter.substring(5) : formatter;
            const parts = dataStr.split('|');
            const upgText = parts[0];
            const baseText = parts[1] || "";
            
            const displayText = isUpgraded ? upgText : baseText;
            
            if (upgText.endsWith('+') && !baseText.endsWith('+')) {
                const slug = baseText.toString().toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w\-]+/g, '').replace(/\-\-+/g, '-');
                return `<a href="/games/slay-the-spire-2/cards/${slug}.html" style="text-decoration: underline; color: inherit;">${displayText}</a>`;
            }
            return displayText;
        }

        const val = currentVars[key] !== undefined ? currentVars[key] : (baseVars[key] !== undefined ? baseVars[key] : 1);
        const baseVal = baseVars[key] !== undefined ? baseVars[key] : val;

        if (!formatter) return val;

        if (formatter === 'diff()') {
            if (val > baseVal) return `<span class="green">${val}</span>`;
            if (val < baseVal) return `<span class="red">${val}</span>`; 
            return val;
        }

        if (formatter.startsWith('plural:')) {
            const parts = formatter.substring(7).split('|');
            const singular = parts[0];
            const plural = parts[1] || singular + 's';
            return val === 1 ? singular : plural;
        }

        if (formatter === 'energyIcons()') {
            let icons = Array(val).fill('<span class="yellow" title="Energy">[E]</span>').join(' ');
            if (val > baseVal) return `<span class="green">${icons}</span>`;
            if (val < baseVal) return `<span class="red">${icons}</span>`;
            return icons;
        }

        return val;
    });

    return formatted;
}

function getCostDisplay(cost, isX, starCost, isXStar) {
    let parts = [];
    if (isX) parts.push('X');
    else if (cost !== null && cost !== undefined) parts.push(cost);

    if (isXStar) parts.push('X★');
    else if (starCost !== null && starCost !== undefined) parts.push(`${starCost}★`);

    if (parts.length === 0) return '0';
    return parts.join(' '); 
}

function generateFeaturedHTML(featuredVideos) {
    if (!featuredVideos || featuredVideos.length === 0) return "<div style='margin-bottom: 50px;'></div>";
    return `
  <div class="featured-videos" style="margin-top: 30px; margin-bottom: 50px; border-top: 1px solid var(--border, #26262c); padding-top: 20px;">
    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; font-size: 1.1rem; color: var(--text, #e3e3e3);">
        <span class="material-symbols-outlined" style="color: var(--gray, #a0a0a0);">smart_display</span> 
        <strong>Featured in:</strong>
    </div>
    <div class="tag-list" style="display: flex; flex-wrap: wrap; gap: 8px;">
        ${featuredVideos.map(v => `
            <a href="${v.url}" class="btn btn-gray" style="border-radius: 20px; padding: 4px 12px; font-size: 0.9rem; text-decoration: none;">Episode ${v.epNum}</a>
        `).join('')}
    </div>
  </div>`;
}

// --- SHARED INDEX TEMPLATE ---
const generateIndex = (title, items, slug, statsMap, overallWinRate, totalRuns, totalWins, gridClass = 'grid-sm') => `---
layout: new
title: "${title} Winrates & Stats - Slay the Spire 2"
description: "View global winrates, run statistics, and win/loss records for all Slay the Spire 2 ${title.toLowerCase()}."
permalink: /games/slay-the-spire-2/${slug}/
custom_css: "/css/game/sts2-style.css"
---
<div class="game-page-wrapper">
  <div class="divider-bottom" style="margin-bottom: 20px; padding-bottom: 15px;">
    <h1 class="title">Slay the Spire 2 ${title} Winrates & Stats</h1>
  </div>

  <p style="font-size: 0.8rem; color: var(--gray); margin-top: -15px; margin-bottom: 20px; text-transform: uppercase;">
    Data last updated: <time datetime="${ISO_BUILD_DATE}">${FORMATTED_BUILD_DATE}</time>
  </p>

  <div style="background: #1a1a1a; border: 1px solid var(--border); padding: 15px; border-radius: 8px; margin-bottom: 25px; text-align: center;">
    <div style="color: var(--gray); font-size: 0.9rem; text-transform: uppercase; margin-bottom: 10px;">Winrate stats across all of my Slay the Spire runs for all ${title.toLowerCase()}</div>
    <div style="font-size: 1.5rem; font-weight: bold;">
        <data value="${totalRuns}">${totalRuns} Total Runs</data> &nbsp;&nbsp; 
        <data value="${totalWins}"><span style="color: var(--green);">${totalWins} Wins</span></data> / 
        <data value="${totalRuns - totalWins}"><span style="color: var(--red);">${totalRuns - totalWins} Losses</span></data>, 
        <data value="${overallWinRate.toFixed(1)}"><span style="color: var(--gray);">${overallWinRate.toFixed(1)}% Winrate</span></data>
    </div>
  </div>

  <div class="grid ${gridClass}">
    ${items.map(i => {
        const bgStyle = getWinRateStyle(i.statsKey, statsMap);
        const borderStyle = getBorderStyle(i, statsMap, overallWinRate);
        return '<a href="' + i.url + '" class="btn btn-gray" style="display: flex; flex-direction: column; text-align: center; padding: 10px; ' + bgStyle + borderStyle + '"><span>' + i.title + getCountText(i) + '</span>' + formatRunStatsRow(i.statsKey, statsMap, overallWinRate) + '</a>';
    }).join('\n')}
  </div>
</div>

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "name": "Slay the Spire 2 ${title} Winrates & Stats",
  "description": "View global winrates, run statistics, and win/loss records for all Slay the Spire 2 ${title.toLowerCase()}.",
  "dateModified": "${ISO_BUILD_DATE}"
}
</script>`;

// --- TEMPLATES ---
const CardTemplates = {
    index: generateIndex,
    detail: (item, manualContent = "", featuredVideos = [], stats = null, overallWinRate = 0) => {
        const rarity = item.rarity || 'Common';
        const type = item.type || 'Skill';
        const colorMap = { ironclad: { name: "Ironclad", css: "red" }, silent: { name: "Silent", css: "green" }, defect: { name: "Defect", css: "blue" }, necrobinder: { name: "Necrobinder", css: "purple" }, regent: { name: "Regent", css: "orange" }, colorless: { name: "Colorless", css: "gray" }, curse: { name: "Curse", css: "gray" } };
        const charData = item.color ? colorMap[item.color.toLowerCase()] : null;
        const charSubtitle = charData ? `<span class="${charData.css}">${charData.name}</span> &bull; ` : '';

        const baseVars = {};
        if (item.vars) for (const [k, v] of Object.entries(item.vars)) baseVars[k.toLowerCase()] = v;
        const upgVars = { ...baseVars };
        let costUpg = item.cost, starCostUpg = item.star_cost;

        if (item.upgrade) {
            for (const [k, v] of Object.entries(item.upgrade)) {
                const key = k.toLowerCase(), strVal = String(v);
                let delta = 0;
                if (strVal.startsWith('+') || strVal.startsWith('-')) delta = parseInt(strVal, 10);
                if (key === 'cost') costUpg = delta ? (item.cost + delta) : parseInt(strVal, 10);
                else if (key === 'star_cost') starCostUpg = delta ? (item.star_cost + delta) : parseInt(strVal, 10);
                else upgVars[key] = (upgVars[key] || 0) + delta;
            }
        }

        const rawText = item.description_raw || item.description || "";
        const baseDesc = formatCardText(rawText, baseVars, baseVars, false); 
        const upgDesc = formatCardText(rawText, upgVars, baseVars, true);   

        const costBaseDisplay = getCostDisplay(item.cost, item.is_x_cost, item.star_cost, item.is_x_star_cost);
        const costUpgDisplay = getCostDisplay(costUpg, item.is_x_cost, starCostUpg, item.is_x_star_cost);
        const costClassBase = costBaseDisplay === '0' ? 'green' : '';
        const costClassUpg = costUpgDisplay === '0' || costUpg < item.cost ? 'green' : '';

        return `---
layout: new
title: "${item.name} Stats & Winrates - Slay the Spire 2"
description: "Detailed winrates and run statistics for the ${item.name} in Slay the Spire 2, based on tracked gameplay."
permalink: /games/slay-the-spire-2/cards/${slugify(item.name)}.html
custom_css: "/css/game/sts2-style.css"
---
<div class="game-page-wrapper">
  <h1 class="title">${item.name}</h1>
  <p class="subtitle" style="text-transform: capitalize;">${charSubtitle}${rarity} ${type}</p>

  ${generateItemStatsPanel(item.name, stats, overallWinRate)}

  <div class="sts-card-display">
    <div class="sts-card ${rarity.toLowerCase()} ${type.toLowerCase()}">
      <div class="sts-card-inner">
        <div class="sts-card-header">
          <div class="sts-energy ${costClassBase}">${costBaseDisplay}</div>
          <div class="sts-card-title">${item.name}</div>
        </div>
        <div class="sts-card-type-banner">${type}</div>
        <div class="sts-card-text">${baseDesc}</div>
        <div class="sts-card-footer">${rarity}</div>
      </div>
    </div>
    <div class="sts-card-arrow"><span>Upgrade</span><span class="material-symbols-outlined">arrow_forward</span></div>
    <div class="sts-card ${rarity.toLowerCase()} ${type.toLowerCase()}">
      <div class="sts-card-inner">
        <div class="sts-card-header">
          <div class="sts-energy ${costClassUpg}">${costUpgDisplay}</div>
          <div class="sts-card-title green">${item.name}+</div>
        </div>
        <div class="sts-card-type-banner">${type}</div>
        <div class="sts-card-text">${upgDesc}</div>
        <div class="sts-card-footer">${rarity}</div>
      </div>
    </div>
  </div>
${manualContent ? `\n${manualContent}` : ''}
${generateFeaturedHTML(featuredVideos)}
</div>
${generateItemJsonLd(item.name, "Card", stats)}`;
    }
};

const RelicTemplates = {
    index: generateIndex,
    detail: (item, manualContent = "", featuredVideos = [], stats = null, overallWinRate = 0) => `---
layout: new
title: "${item.name} Stats & Winrates - Slay the Spire 2"
description: "Detailed winrates and run statistics for the ${item.name} in Slay the Spire 2, based on tracked gameplay."
permalink: /games/slay-the-spire-2/relics/${slugify(item.name)}.html
custom_css: "/css/game/sts2-style.css"
---
<div class="game-page-wrapper">
  <h1 class="title" style="color: var(--yellow);">${item.name}</h1>
  <p class="subtitle" style="text-transform: capitalize;">${item.rarity || 'Common'} Relic &bull; ${item.pool || 'Shared'} Pool</p>

  ${generateItemStatsPanel(item.name, stats, overallWinRate)}

  <div style="background: #1a1a1a; padding: 20px; border-radius: 8px; border: 2px solid #555; max-width: 600px; margin: 25px 0; box-shadow: 0 4px 10px rgba(0,0,0,0.5);">
    <p style="font-size: 1.25em; line-height: 1.5; margin: 0;">${formatSimpleText(item.description)}</p>
    ${item.flavor ? `<p style="color: #888; font-style: italic; margin-top: 15px; font-size: 0.9em;">${formatSimpleText(item.flavor)}</p>` : ''}
  </div>
${manualContent ? `\n${manualContent}` : ''}
${generateFeaturedHTML(featuredVideos)}
</div>
${generateItemJsonLd(item.name, "Relic", stats)}`
};

const CharacterTemplates = {
    index: (title, items, slug, statsMap, overallWinRate, totalRuns, totalWins, gridClass = 'grid-sm') => `---
layout: new
title: "${title} Winrates & Stats - Slay the Spire 2"
description: "View global winrates, run statistics, and win/loss records for all Slay the Spire 2 ${title.toLowerCase()}."
permalink: /games/slay-the-spire-2/${slug}/
custom_css: "/css/game/sts2-style.css"
---
<div class="game-page-wrapper">
  <div class="divider-bottom" style="margin-bottom: 20px; padding-bottom: 15px;">
    <h1 class="title">Slay the Spire 2 ${title} Winrates & Stats</h1>
  </div>

  <p style="font-size: 0.8rem; color: var(--gray); margin-top: -15px; margin-bottom: 20px; text-transform: uppercase;">
    Data last updated: <time datetime="${ISO_BUILD_DATE}">${FORMATTED_BUILD_DATE}</time>
  </p>

  <div style="background: #1a1a1a; border: 1px solid var(--border); padding: 15px; border-radius: 8px; margin-bottom: 25px; text-align: center;">
    <div style="color: var(--gray); font-size: 0.9rem; text-transform: uppercase; margin-bottom: 10px;">Winrate stats across all of my Slay the Spire runs for all ${title.toLowerCase()}</div>
    <div style="font-size: 1.5rem; font-weight: bold;">
        <data value="${totalRuns}">${totalRuns} Total Runs</data> &nbsp;&nbsp; 
        <data value="${totalWins}"><span style="color: var(--green);">${totalWins} Wins</span></data> / 
        <data value="${totalRuns - totalWins}"><span style="color: var(--red);">${totalRuns - totalWins} Losses</span></data>, 
        <data value="${overallWinRate.toFixed(1)}"><span style="color: var(--gray);">${overallWinRate.toFixed(1)}% Winrate</span></data>
    </div>
  </div>

  <div class="grid ${gridClass}">
    ${items.map(i => {
        const bgStyle = getWinRateStyle(i.statsKey, statsMap);
        const borderStyle = getBorderStyle(i, statsMap, overallWinRate);
        const charColor = (i.rawData && i.rawData.color) ? `color: var(--${i.rawData.color.toLowerCase()});` : '';
            
        return '<a href="' + i.url + '" class="btn btn-gray" style="display: flex; flex-direction: column; text-align: center; padding: 10px; ' + bgStyle + borderStyle + charColor + '"><span>' + i.title + getCountText(i) + '</span>' + formatRunStatsRow(i.statsKey, statsMap, overallWinRate) + '</a>';
    }).join('\n')}
  </div>
</div>

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "name": "Slay the Spire 2 ${title} Winrates & Stats",
  "description": "View global winrates, run statistics, and win/loss records for all Slay the Spire 2 ${title.toLowerCase()}.",
  "dateModified": "${ISO_BUILD_DATE}"
}
</script>`,

    detail: (item, manualContent = "", featuredVideos = [], stats = null, overallWinRate = 0) => {
        const charColor = item.color || 'gray';
        return `---
layout: new
title: "${item.name} Stats & Winrates - Slay the Spire 2"
description: "Detailed winrates and run statistics for the ${item.name} in Slay the Spire 2, based on tracked gameplay."
permalink: /games/slay-the-spire-2/characters/${slugify(item.name)}.html
custom_css: "/css/game/sts2-style.css"
---
<div class="game-page-wrapper">
  <h1 class="title" style="color: var(--${charColor});">${item.name}</h1>
  <p class="subtitle">Character</p>

  ${generateItemStatsPanel(item.name, stats, overallWinRate)}

  <div style="background: #1a1a1a; padding: 20px; border-radius: 8px; border: 2px solid var(--${charColor}); max-width: 600px; margin: 25px 0; box-shadow: 0 4px 10px rgba(0,0,0,0.5);">
    <p style="font-size: 1.25em; line-height: 1.5; margin: 0; white-space: pre-wrap;">${formatSimpleText(item.description)}</p>
    <ul style="color: #ccc; margin-top: 20px; line-height: 1.8; font-size: 1.1em;">
        <li><strong>Starting HP:</strong> ${item.starting_hp || '?'}</li>
        <li><strong>Starting Gold:</strong> ${item.starting_gold || '?'}</li>
        <li><strong>Max Energy:</strong> ${item.max_energy || '?'}</li>
    </ul>
  </div>
${manualContent ? `\n${manualContent}` : ''}
${generateFeaturedHTML(featuredVideos)}
</div>
${generateItemJsonLd(item.name, "Character", stats)}`;
    }
};

const EnchantmentTemplates = {
    index: generateIndex,
    detail: (item, manualContent = "", featuredVideos = [], stats = null, overallWinRate = 0) => `---
layout: new
title: "${item.name} Stats & Winrates - Slay the Spire 2"
description: "Detailed winrates and run statistics for the ${item.name} in Slay the Spire 2, based on tracked gameplay."
permalink: /games/slay-the-spire-2/enchantments/${slugify(item.name)}.html
custom_css: "/css/game/sts2-style.css"
---
<div class="game-page-wrapper">
  <h1 class="title" style="color: var(--purple);">${item.name}</h1>
  <p class="subtitle">Enchantment</p>

  ${generateItemStatsPanel(item.name, stats, overallWinRate)}

  <div style="background: #1a1a1a; padding: 20px; border-radius: 8px; border: 2px solid var(--purple); max-width: 600px; margin: 25px 0; box-shadow: 0 4px 10px rgba(0,0,0,0.5);">
    <p style="font-size: 1.25em; line-height: 1.5; margin: 0;">${formatSimpleText(item.description)}</p>
    ${item.extra_card_text ? `<p style="color: #888; font-style: italic; margin-top: 15px; font-size: 0.9em;">Adds Text: "${formatSimpleText(item.extra_card_text)}"</p>` : ''}
  </div>
${manualContent ? `\n${manualContent}` : ''}
${generateFeaturedHTML(featuredVideos)}
</div>
${generateItemJsonLd(item.name, "Enchantment", stats)}`
};

const EventTemplates = {
    index: generateIndex,
    detail: (item, manualContent = "", featuredVideos = [], stats = null, overallWinRate = 0) => {
        // Build the choices list if the event has options
        let optionsHtml = '';
        if (item.options && item.options.length > 0) {
            optionsHtml = `
    <div style="margin-top: 20px; border-top: 1px solid #333; padding-top: 15px;">
        <h3 style="color: var(--gray); font-size: 0.85rem; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 1px;">Choices / Outcomes</h3>
        <div style="display: flex; flex-direction: column; gap: 8px; padding-left: 20px;">
            ${item.options.map(opt => `
            <div style="background: rgba(255,255,255,0.03); padding: 12px; border-radius: 6px; border-left: 3px solid var(--blue);">
                <strong style="display: block; color: var(--yellow); font-size: 1.1em; margin-bottom: 6px;">${opt.title || opt.id}</strong>
                <span style="font-size: 0.95em; color: #ddd; line-height: 1.4;">${formatSimpleText(opt.description)}</span>
            </div>
            `).join('')}
        </div>
    </div>`;
        }

        return `---
layout: new
title: "${item.name} Stats & Winrates - Slay the Spire 2"
description: "Detailed winrates and run statistics for the ${item.name} in Slay the Spire 2, based on tracked gameplay."
permalink: /games/slay-the-spire-2/events/${slugify(item.name)}.html
custom_css: "/css/game/sts2-style.css"
---
<div class="game-page-wrapper">
  <h1 class="title" style="color: var(--blue);">${item.name}</h1>
  <p class="subtitle">${item.type || 'Event'} &bull; ${item.act || 'Unknown Act'}</p>

  ${generateItemStatsPanel(item.name, stats, overallWinRate)}

  <div style="background: #1a1a1a; padding: 20px; border-radius: 8px; border: 2px solid var(--blue); max-width: 600px; margin: 25px 0; box-shadow: 0 4px 10px rgba(0,0,0,0.5);">
    <p style="font-size: 1.15em; line-height: 1.6; margin: 0; white-space: pre-wrap;">${formatSimpleText(item.description)}</p>
    ${optionsHtml}
  </div>
${manualContent ? `\n${manualContent}` : ''}
${generateFeaturedHTML(featuredVideos)}
</div>
${generateItemJsonLd(item.name, "Event", stats)}`;
    }
};

// --- DIRECTORY INDEX BUILDERS ---
function buildSTS2Index(categories) {
    const indexHTML = `---
layout: new
title: "Slay the Spire 2"
permalink: /games/slay-the-spire-2/
custom_css: "/css/game/sts2-style.css"
---
<div class="game-page-wrapper">
  <div class="divider-bottom" style="margin-bottom: 20px; padding-bottom: 15px;">
    <h1 class="title">Slay the Spire 2</h1>
  </div>
  <div class="grid grid-sm">
    ${categories.map(cat => `
        <a href="/games/slay-the-spire-2/${slugify(cat)}/" class="btn btn-gray interactive" style="display: flex; align-items: center; justify-content: center; height: 100px; text-align: center; padding: 20px; font-size: 1.3rem; font-weight: bold; border-radius: 8px; text-decoration: none;">
            ${cat}
        </a>
    `).join('')}
  </div>
</div>`;
    fs.writeFileSync(path.join(PATHS.STS2_ROOT, 'index.html'), indexHTML);
    console.log(`  ✅ Wrote Slay the Spire 2 Hub Index to /games/slay-the-spire-2/index.html`);
}

// --- THE GENERALIZED BUILDER ---
function buildCategory(categoryName, itemsArray, templates, tagVideoMap, statsMap, overallWinRate, totalRuns, totalWins, categoryPrefix, gridClass = 'grid-sm') {
    if (!itemsArray || !Array.isArray(itemsArray)) return;
    
    const categorySlug = slugify(categoryName);
    const outputDir = ensureDir(path.join(PATHS.STS2_ROOT, categorySlug));
    const manualDir = ensureDir(path.join(PATHS.STS2_ROOT, '_manual', categorySlug));
    
    console.log(`\n🛠️ Building Category: ${categoryName} (${itemsArray.length} items)`);

    const indexItems = [];
    const processedSlugs = new Set(); 

    itemsArray.forEach(item => {
        if (!item.name || item.name.includes("???") || item.name === "Unknown") return;

        const itemSlug = slugify(item.name);
        if (processedSlugs.has(itemSlug)) return;
        processedSlugs.add(itemSlug);

        const filePath = path.join(outputDir, `${itemSlug}.html`);
        const lookupKey = `${categoryPrefix}:${itemSlug}`; 
        
        const featuredVideos = tagVideoMap[lookupKey] || [];
        const manualPath = path.join(manualDir, `${itemSlug}.html`);
        let hasManualData = false;
        let manualContent = "";
        
        if (fs.existsSync(manualPath)) {
            hasManualData = true;
            manualContent = fs.readFileSync(manualPath, 'utf8');
        }

        indexItems.push({
            title: item.name,
            url: `/games/slay-the-spire-2/${categorySlug}/${itemSlug}.html`,
            hasManualData: hasManualData,
            videoCount: featuredVideos.length,
            statsKey: lookupKey,
            rawData: item 
        });

        const detailHTML = templates.detail(item, manualContent, featuredVideos, statsMap[lookupKey], overallWinRate);
        fs.writeFileSync(filePath, detailHTML);
    });

    indexItems.sort((a, b) => a.title.localeCompare(b.title));
    
    const indexFilePath = path.join(outputDir, 'index.html');
    // Pass the gridClass into the template!
    const indexHTML = templates.index(categoryName, indexItems, categorySlug, statsMap, overallWinRate, totalRuns, totalWins, gridClass);
    fs.writeFileSync(indexFilePath, indexHTML);

    console.log(`  ✅ Wrote ${indexItems.length} detail pages + 1 index page to /${categorySlug}/`);
}

// --- HELPER TO LOAD JSON ---
function loadJsonSafe(dir, filename) {
    const filePath = path.join(dir, filename);
    if (!fs.existsSync(filePath)) return null;
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return Array.isArray(data) ? data : Object.values(data);
}

// --- ORCHESTRATION ---
async function run() {
    ensureDir(PATHS.STS2_ROOT);

    const tagVideoMap = await fetchTagVideoMap('slay-the-spire-2');
    const { statsMap, overallWinRate, totalRuns, totalWins } = await fetchRunStatsMap();
    const codexDir = PATHS.CODEX_DATA;
    const categoriesBuilt = [];

    const allCards = loadJsonSafe(codexDir, 'cards.json');
    if (allCards) {
        buildCategory("Cards", allCards, CardTemplates, tagVideoMap, statsMap, overallWinRate, totalRuns, totalWins, "card");
        categoriesBuilt.push("Cards");
    }

    const allRelics = loadJsonSafe(codexDir, 'relics.json');
    if (allRelics) {
        allRelics.forEach(r => {
            if (r.flavor && r.flavor.includes("Details for this relic will be revealed")) {
                r.flavor = null;
            }
        });
        buildCategory("Relics", allRelics, RelicTemplates, tagVideoMap, statsMap, overallWinRate, totalRuns, totalWins, "relic");
        categoriesBuilt.push("Relics");
    }

    const allCharacters = loadJsonSafe(codexDir, 'characters.json');
    if (allCharacters) {
        allCharacters.forEach(c => {
            if (c.name) c.name = c.name.replace(/^The\s+/i, '');
        });
        buildCategory("Characters", allCharacters, CharacterTemplates, tagVideoMap, statsMap, overallWinRate, totalRuns, totalWins, "character");
        categoriesBuilt.push("Characters");
    }

    const allEnchantments = loadJsonSafe(codexDir, 'enhancements.json') || loadJsonSafe(codexDir, 'enchantments.json');
    if (allEnchantments) {
        buildCategory("Enchantments", allEnchantments, EnchantmentTemplates, tagVideoMap, statsMap, overallWinRate, totalRuns, totalWins, "enchantment");
        categoriesBuilt.push("Enchantments");
    }

    // --- NEW: Process Events ---
    const allEvents = loadJsonSafe(codexDir, 'events.json');
    if (allEvents) {
        buildCategory("Events", allEvents, EventTemplates, tagVideoMap, statsMap, overallWinRate, totalRuns, totalWins, "event", "grid-md");
        categoriesBuilt.push("Events");
    }

    await buildStatsPage();
    categoriesBuilt.push("Stats"); 
    
    console.log(`\n🏗️ Building Hub Pages...`);
    buildSTS2Index(categoriesBuilt);

    console.log(`\n✨ Build Complete! Check C:\\GitHub\\letstrygg\\games\\`);
}

run();