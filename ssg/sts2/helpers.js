import { slugify } from './paths.js';

/**
 * Normalizes IDs by stripping common prefixes (CHARACTER., RELIC., CARD., etc)
 * and converting to lowercase for consistent handling in CSS and JS.
 * @param {string} rawId 
 * @returns {string}
 */
export function normalizeId(rawId) {
    return (rawId || '').replace(/^[A-Z]+\./i, '').replace(/\s*POOL$/i, '').toLowerCase().trim();
}

/**
 * Reusable helper to determine if a run belongs to a specific user.
 * Prioritizes Supabase ID matching, falling back to slug and display name comparisons.
 * 
 * @param {Object} run - The run object from the database.
 * @param {Object} user - The user object from the database.
 * @returns {boolean}
 */
export function isRunByUser(run, user) {
    if (!run || !user) return false;

    // 1. Primary match: Supabase User ID (Most accurate)
    if (run.supabase_user_id && user.supabase_user_id) {
        return run.supabase_user_id === user.supabase_user_id;
    }

    // 2. Fallback match: Name comparison (Handles legacy/unlinked data)
    const runUser = (run.username || '').toLowerCase();
    if (!runUser) return false;

    const userSlug = (user.slug || '').toLowerCase();
    const userDisplayName = (user.display_name || '').toLowerCase();
    const runSlug = slugify(run.username || '');

    return runUser === userSlug || runUser === userDisplayName || runSlug === userSlug;
}

/**
 * Calculates the winrate percentage for a given set of runs.
 * @param {Array} runs 
 * @returns {number}
 */
export function calculateWinRate(runs) {
    if (!runs || runs.length === 0) return 0;
    const wins = runs.filter(r => r.win).length;
    return (wins / runs.length) * 100;
}

/**
 * Calculates a Bayesian average score to weight items with low sample sizes.
 * Formula: (C * M + Wins) / (C + Runs)
 * 
 * @param {number} wins - Number of successful outcomes (wins).
 * @param {number} runs - Total number of attempts (seen).
 * @param {number} priorWinRate - The baseline win rate to pull towards (M).
 * @param {number} confidence - The weight given to the prior (C). Default is 5.
 * @returns {number}
 */
export function calculateBayesianScore(wins, runs, priorWinRate, confidence = 5) {
    if (runs === 0) return priorWinRate;
    return (confidence * priorWinRate + wins) / (confidence + runs);
}

/**
 * Extracts core metadata from a run row.
 * @param {Object} row 
 * @returns {Object}
 */
export function getRunMetadata(row) {
    return {
        id: row.id,
        user_run_num: row.user_run_num,
        username: row.username,
        win: !!row.win,
        character: row.character,
        build_id: row.build_id,
        ascension: row.ascension,
        deck_list: row.deck_list,
        relic_list: row.relic_list,
        supabase_user_id: row.supabase_user_id,
        yt_video: row.yt_video,
        ltg_url: row.ltg_url,
        killed_by_encounter: row.killed_by_encounter,
        shorts: (() => {
            let s = row.shorts ? (typeof row.shorts === 'string' ? JSON.parse(row.shorts) : row.shorts) : [];
            // Robustness: Handle double-encoded strings from legacy syncs
            if (typeof s === 'string') {
                try { s = JSON.parse(s); } catch (e) { s = []; }
            }
            return Array.isArray(s) ? s : [];
        })()
    };
}

/**
 * Calculates top/low card performance for a subset of runs.
 */
export function getPerformanceStats(runs, priorM, starterCards) {
    const cardStats = aggregateCardStats(runs);
    const nonStarterEntries = Object.entries(cardStats).filter(([id]) => !starterCards.has(normalizeId(id)));
    
    if (nonStarterEntries.length === 0) return null;

    const sorted = [...nonStarterEntries].sort((a, b) => 
        calculateBayesianScore(b[1].wins, b[1].seen, priorM) - 
        calculateBayesianScore(a[1].wins, a[1].seen, priorM)
    );

    return {
        mostPicked: [...nonStarterEntries].sort((a, b) => b[1].seen - a[1].seen)[0],
        topCard: sorted[0],
        lowCard: sorted[sorted.length - 1]
    };
}

/**
 * Aggregates card statistics from an array of runs.
 * Returns a map of { cardId: { seen, wins } }
 * 
 * @param {Array} runs 
 * @returns {Object}
 */
export function aggregateCardStats(runs) {
    const cardMap = {};
    runs.forEach(run => {
        const deck = JSON.parse(run.deck_list || '[]');
        const uniqueIds = new Set(deck.map(c => c.id).filter(Boolean));
        uniqueIds.forEach(cid => {
            if (!cardMap[cid]) cardMap[cid] = { seen: 0, wins: 0 };
            cardMap[cid].seen++;
            if (run.win) cardMap[cid].wins++;
        });
    });
    return cardMap;
}

/**
 * Resolves card text templates using variables and upgrade data.
 * Preserves Godot BBCode tags for downstream formatting.
 */
export function parseCardText(raw, vars, upgrade, isUpgraded) {
    if (!raw) return "";
    
    // Determine the actual template to use.
    let template = raw;
    let upgradeData = null;
    if (upgrade) {
        if (typeof upgrade === 'object') upgradeData = upgrade;
        else {
            try { upgradeData = JSON.parse(upgrade); }
            catch (e) {
                // If it's not valid JSON, it might be a raw description string override
                if (isUpgraded) template = upgrade;
            }
        }
    }
    
    // Prioritize explicit description overrides provided in the upgrade object
    if (isUpgraded && upgradeData && (upgradeData.description_raw || upgradeData.description)) {
        template = upgradeData.description_raw || upgradeData.description;
    }

    const activeVars = {};
    const processVars = (vObj) => {
        if (!vObj) return;
        for (const [k, v] of Object.entries(vObj)) {
            activeVars[k.toLowerCase()] = v;
        }
    };

    processVars(vars ? (typeof vars === 'string' ? JSON.parse(vars) : vars) : null);

    if (isUpgraded && upgradeData) {
        for (const [k, v] of Object.entries(upgradeData)) {
            const key = k.toLowerCase();
            if (key === 'description_raw' || key === 'description') continue;

            const val = String(v);
            if (val.startsWith('+')) {
                activeVars[key] = (Number(activeVars[key] || 0)) + parseInt(val.substring(1), 10);
            } else if (val.startsWith('-')) {
                activeVars[key] = (Number(activeVars[key] || 0)) - parseInt(val.substring(1), 10);
            } else if (!isNaN(v) && typeof v !== 'boolean') {
                activeVars[key] = Number(v);
            } else {
                activeVars[key] = v;
            }
        }
    }

    let result = template;
    let iterations = 0;

    const getVarValue = (path) => {
        const parts = path.toLowerCase().split('.');
        let current = activeVars;
        for (const part of parts) {
            if (current && typeof current === 'object') {
                current = current[part];
            } else return undefined;
        }
        return current;
    };

    // Iteratively resolve tags from innermost to outermost to support nested templates (e.g. plurals containing stats)
    while (iterations < 5) {
        const nextResult = result.replace(/\{([A-Za-z0-9_\.]+)(?::([^{}]+))?\}/g, (match, varPath, formatter) => {
            const lowPath = varPath.toLowerCase();
            if (lowPath === 'ifupgraded') {
                const data = formatter?.startsWith('show:') ? formatter.substring(5) : formatter;
                const parts = data ? data.split('|') : ["", ""];
                return isUpgraded ? parts[0] : (parts[1] || "");
            }
            if (lowPath === 'singlestaricon') return '[star:1]';

            let val = getVarValue(varPath);
            if (val === undefined && (formatter?.startsWith('energyIcons') || formatter?.startsWith('starIcons'))) {
                const argMatch = formatter.match(/\((\d+)\)/);
                val = argMatch ? argMatch[1] : 1;
            }
            if (val === undefined) return match;

            if (!formatter) return String(val);

            if (formatter?.startsWith('plural:')) {
                const parts = formatter.substring(7).split('|');
                if (Number(val) === 1) return parts[0];
                return (parts.length > 1) ? parts[1] : (parts[0] + 's');
            }
            if (formatter?.startsWith('cond:')) {
                const parts = formatter.substring(5).split('|');
                return val ? parts[0] : (parts[1] || "");
            }
            if (formatter === 'diff()' || formatter === 'percentLess()' || formatter === 'percentMore()') return String(val);
            if (formatter === 'abs()') return String(Math.abs(Number(val)));
            if (formatter?.startsWith('energyIcons')) return `[energy:${val}]`;
            if (formatter?.startsWith('starIcons')) return `[star:${val}]`;
            return String(val);
        });
        if (nextResult === result) break;
        result = nextResult;
        iterations++;
    }
    return result;
}