import fs from 'fs';
import path from 'path';
import { PATHS, ensureDir, slugify } from './paths.js';
import { normalizeId } from './helpers.js';
import { 
    getItemStats, 
    generateCardItemHtml, 
    wrapLayout, 
    formatDescription, 
    generateItemJsonLd 
} from './templates/shared.js';

export async function buildKeywords(keywords, allCards, runStats, sitemap) {
    console.log(`🔑 Building ${keywords.length} keyword pages with card lists...`);
    const root = ensureDir(path.join(PATHS.WEB_ROOT, 'keywords'));
    const standardKeywords = ["Innate", "Retain", "Ethereal", "Unplayable", "Sly", "Eternal", "Exhaust"];

    for (const kw of keywords) {
        const slug = slugify(kw.name);
        const dir = ensureDir(path.join(root, slug));

        // Find cards that feature this keyword either in base or via upgrade
        const matchingCards = allCards.filter(c => {
            const kSet = new Set((c.keywords ? JSON.parse(c.keywords || '[]') : []).map(k => k.toLowerCase()));
            let upg = null;
            if (c.upgrade) {
                try { 
                    const p = JSON.parse(c.upgrade); 
                    if (p && typeof p === 'object' && !Array.isArray(p)) upg = p;
                } catch (e) { /* Ignore raw string overrides for keyword logic */ }
            }
            
            if (upg) {
                const lowUpg = Object.fromEntries(Object.entries(upg).map(([k, v]) => [k.toLowerCase(), v]));
                // Check standard keyword boolean flags in upgrade
                standardKeywords.forEach(sk => {
                    if (lowUpg[sk.toLowerCase()] === true) kSet.add(sk.toLowerCase());
                });
                // Check "add_keyword" keys
                Object.entries(lowUpg).forEach(([key, val]) => {
                    if (val === true && key.startsWith('add_')) {
                        kSet.add(key.substring(4).toLowerCase());
                    }
                });
            }
            return kSet.has(kw.name.toLowerCase());
        });

        kw.cardCount = matchingCards.length;
        // A keyword is "seen" if at least one card featuring it has been seen in a run
        kw.isSeen = matchingCards.some(c => runStats.stats[normalizeId(c.card_id)]?.seen > 0);

        // Sort matching cards by performance
        matchingCards.sort((a, b) => {
            const sA = getItemStats(runStats.stats[normalizeId(a.card_id)], runStats.globalWinRate);
            const sB = getItemStats(runStats.stats[normalizeId(b.card_id)], runStats.globalWinRate);
            return sB.score - sA.score;
        });

        const cardItemsHtml = matchingCards.map(c => {
            const stats = getItemStats(runStats.stats[normalizeId(c.card_id)], runStats.globalWinRate);
            return generateCardItemHtml(`/cards/${slugify(c.name)}/`, c.name, stats, c.color);
        }).join('');

        const detailHtml = wrapLayout(
            kw.name,
            `
            <div class="item-box" style="margin-bottom: 40px;">
                <div class="subtitle">Keyword</div>
                <div class="description">${formatDescription(kw.description)}</div>
            </div>
            <h3 style="margin-bottom: 15px;">Cards featuring ${kw.name}</h3>
            <div class="grid">${cardItemsHtml || '<p class="text-muted">No cards found with this keyword.</p>'}</div>`,
            [{ name: 'keywords', url: '/keywords/' }, { name: kw.name, url: '' }],
            `${kw.name} keyword description and associated cards for Slay the Spire 2.`,
            generateItemJsonLd(kw.name, "Keyword", null),
            `/keywords/${slug}/`
        );

        fs.writeFileSync(path.join(dir, 'index.html'), detailHtml);
        sitemap.add(`/keywords/${slug}/`);
    }

    // Index Page
    const indexLinks = keywords.map(kw => `
        <a href="/keywords/${slugify(kw.name)}/" class="item-link">
            ${kw.name} <span style="color: #666; font-size: 0.85em; font-weight: normal;">(${kw.cardCount || 0})</span>
        </a>`).join('');
    const indexHtml = wrapLayout('Keywords', `<div class="grid">${indexLinks}</div>`, [{ name: 'keywords', url: '' }], "Complete list of Slay the Spire 2 keywords.");
    fs.writeFileSync(path.join(root, 'index.html'), indexHtml);
    sitemap.add('/keywords/');

    return {
        total: keywords.length,
        seen: keywords.filter(k => k.isSeen).length
    };
}