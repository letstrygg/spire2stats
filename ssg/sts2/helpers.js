import { slugify } from './paths.js';

/**
 * Normalizes IDs by stripping common prefixes (CHARACTER., RELIC., CARD., etc) 
 * and converting to uppercase.
 * @param {string} rawId 
 * @returns {string}
 */
export function normalizeId(rawId) {
    return (rawId || '').replace(/^[A-Z]+\./, '').toUpperCase();
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