import fs from 'fs';
import path from 'path';

export function getClientTagConfig(gameSlug) {
    if (gameSlug === 'slay-the-spire-2') {
        return {
            priorityCategories: ["character"],
            colors: {
                "character:silent": "var(--green)",
                "character:defect": "var(--blue)",
                "character:ironclad": "var(--red)",
                "character:regent": "var(--orange)",
                "character:necrobinder": "var(--purple)",
                "default": "var(--yellow)"
            }
        };
    }
    return {};
}

// List of base starting relics to ignore on the front-end
const IGNORE_RELICTS = new Set([
    'burning-blood',
    'ring-of-the-snake',
    'cracked-core',
    'divine-right',
    'bound-phylactery'
]);

export function processAdminTags(tagsArray, gameSlug = 'slay-the-spire-2') {
    const config = getClientTagConfig(gameSlug) || {};
    const colors = config.colors || {};

    const groups = {
        character: [],
        card: [],
        enchantment: [],
        relic: [],
        event: [], // <-- Added event group
        manual: []
    };

    const metaList = [];
    const rootDir = process.cwd();

    (tagsArray || []).forEach(tag => {
        const parts = tag.split(':');
        
        // --- 1. HANDLE STANDARD / MANUAL TAGS ---
        if (parts.length < 3 || parts[0] !== gameSlug) {
            const cleanTag = parts.join('-');
            const displayName = cleanTag.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
            metaList.push(displayName);
            
            const tagHtml = `<a href="/yt/tags/${cleanTag}/" class="btn interactive text-sm" style="padding: 2px 12px; border-radius: 15px; border: 1px solid var(--border, #333); color: var(--text-muted, #aaa); background: rgba(0,0,0,0.2); margin-right: 6px; margin-bottom: 6px; display: inline-flex; align-items: center; white-space: nowrap; text-decoration: none;">
                <strong>#${displayName}</strong>
            </a>`;
            groups.manual.push(tagHtml);
            return; 
        }

        // --- 2. HANDLE STS DIRECTORY TAGS ---
        const cat = parts[1].toLowerCase();
        const item = parts[2]; 

        // --- NEW: DISPLAY FILTERING ---
        // 1. Hide anything starting with "strike-" or "defend-"
        if (item.startsWith('strike-') || item.startsWith('defend-')) {
            return; 
        }
        // 2. Hide specific base starting relics
        if (cat === 'relic' && IGNORE_RELICTS.has(item)) {
            return;
        }
        // 3. Hide NEOW event
        if (cat === 'event' && item === 'neow') {
            return;
        }

        const displayName = item.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
        metaList.push(displayName);

        const colorKey = `${cat}:${item}`;
        const color = colors[colorKey] || colors['default'] || 'var(--text-muted, #aaa)';

        const folderName = cat === 'relic' ? 'relics' : 
                           cat === 'card' ? 'cards' : 
                           cat === 'enchantment' ? 'enchantments' : 
                           cat === 'character' ? 'characters' : 
                           cat === 'event' ? 'events' : `${cat}s`; // Catch events

        const targetUrl = `/games/${gameSlug}/${folderName}/${item}.html`;
        const localFilePath = path.join(rootDir, 'games', gameSlug, folderName, `${item}.html`);

        const pageExists = fs.existsSync(localFilePath);
        let tagHtml = '';

        if (pageExists) {
            tagHtml = `<a href="${targetUrl}" class="btn interactive text-sm" style="padding: 2px 12px; border-radius: 15px; border: 1px solid ${color}; color: ${color}; background: rgba(0,0,0,0.2); margin-right: 6px; margin-bottom: 6px; display: inline-flex; align-items: center; white-space: nowrap; text-decoration: none;">
                <span style="opacity: 0.6; font-size: 0.85em; margin-right: 4px;">${cat}:</span><strong>${displayName}</strong>
            </a>`;
        } else {
            tagHtml = `<span class="btn text-sm" style="padding: 2px 12px; border-radius: 15px; border: 1px solid ${color}; color: ${color}; background: transparent; opacity: 0.4; margin-right: 6px; margin-bottom: 6px; display: inline-flex; align-items: center; white-space: nowrap; cursor: default;">
                <span style="opacity: 0.6; font-size: 0.85em; margin-right: 4px;">${cat}:</span><strong>${displayName}</strong>
            </span>`;
        }

        if (cat === 'character') groups.character.push(tagHtml);
        else if (cat === 'card') groups.card.push(tagHtml);
        else if (cat === 'enchantment') groups.enchantment.push(tagHtml);
        else if (cat === 'relic') groups.relic.push(tagHtml);
        else if (cat === 'event') groups.event.push(tagHtml); // <-- Push events
        else groups.manual.push(tagHtml);
    });

    return {
        metaString: metaList.join(', '),
        groups: groups
    };
}