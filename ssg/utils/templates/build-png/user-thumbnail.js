/**
 * Slay the Spire 2 - User Thumbnail Template (1000x1000)
 * Focused, enlarged elements for Google search results and rich snippets.
 */
import { normalizeId } from '../../../sts2/helpers.js';

export function getUserThumbnailTemplate(user, runs, swordIconBase64) {
    const totalRuns = runs.length;
    const wins = runs.filter(r => r.win).length;
    const losses = totalRuns - wins;
    const winRate = totalRuns > 0 ? ((wins / totalRuns) * 100).toFixed(1) : "0.0";

    // Calculate Max Ascensions (logic synchronized with user-png.js)
    const charIds = ['ironclad', 'silent', 'defect', 'necrobinder', 'regent'];
    const maxAscensionsMap = {};
    charIds.forEach(id => maxAscensionsMap[id] = -1);
    runs.filter(r => r.win).forEach(run => {
        const cid = normalizeId(run.character);
        if (maxAscensionsMap.hasOwnProperty(cid)) {
            const level = run.ascension || 0;
            if (level > maxAscensionsMap[cid]) maxAscensionsMap[cid] = level;
        }
    });
    const totalCompletedAscensions = Object.values(maxAscensionsMap)
        .reduce((sum, val) => sum + (val === -1 ? 0 : val + 1), 0);

    return {
        type: 'div',
        props: {
            style: {
                height: '1000px',
                width: '1000px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: '#0a0a0a',
                color: '#e3e3e3',
                fontFamily: 'Kreon',
                padding: '80px 40px',
                border: '20px solid #222'
            },
            children: [
                // Large Username
                {
                    type: 'div',
                    props: {
                        style: {
                            fontSize: '110px',
                            fontWeight: '700',
                            color: '#ffd700',
                            textAlign: 'center',
                            lineHeight: '1.1'
                        },
                        children: user.display_name
                    }
                },
                // Enlarged Sword Icon
                {
                    type: 'img',
                    props: {
                        src: swordIconBase64,
                        style: {
                            width: '350px',
                            height: '350px'
                        }
                    }
                },
                // Core Stats Only
                {
                    type: 'div',
                    props: {
                        style: {
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '15px'
                        },
                        children: [
                            {
                                type: 'div',
                                props: {
                                    style: { fontSize: '75px', fontWeight: '700' },
                                    children: `Ascension: ${totalCompletedAscensions} / 50`
                                }
                            },
                            {
                                type: 'div',
                                props: {
                                    style: { fontSize: '90px', color: '#4caf50', fontWeight: '700' },
                                    children: `${winRate}% Winrate`
                                }
                            },
                            {
                                type: 'div',
                                props: {
                                    style: { display: 'flex', gap: '60px', fontSize: '60px' },
                                    children: [
                                        { type: 'span', props: { style: { color: '#7fff00' }, children: `${wins} Wins` } },
                                        { type: 'span', props: { style: { color: '#f44336' }, children: `${losses} Losses` } }
                                    ]
                                }
                            }
                        ]
                    }
                }
            ]
        }
    };
}