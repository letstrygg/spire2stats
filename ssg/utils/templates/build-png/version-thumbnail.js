/**
 * Slay the Spire 2 - Version Thumbnail Template (1000x1000)
 * Focused, enlarged elements for Google search results and social previews.
 */

export function getVersionThumbnailTemplate(version, minorVersionsCount, iconBase64) {
    const wins = version.wins;
    const losses = version.total - wins;
    const winRate = version.total > 0 ? ((wins / version.total) * 100).toFixed(1) : "0.0";

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
                // Large Version ID
                {
                    type: 'div',
                    props: {
                        style: {
                            fontSize: '130px',
                            fontWeight: '700',
                            color: '#ffd700',
                            textAlign: 'center',
                            lineHeight: '1.1'
                        },
                        children: version.id
                    }
                },
                // Enlarged Stats Icon (maintaining 262x151 ratio)
                {
                    type: 'img',
                    props: {
                        src: iconBase64,
                        style: {
                            width: '524px',
                            height: '302px'
                        }
                    }
                },
                // Core Stats
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
                                    children: `Build Tracks: ${minorVersionsCount}`
                                }
                            },
                            {
                                type: 'div',
                                props: {
                                    style: { fontSize: '110px', color: '#00ff89', fontWeight: '700' },
                                    children: `${winRate}% Winrate`
                                }
                            },
                            {
                                type: 'div',
                                props: {
                                    style: { display: 'flex', gap: '60px', fontSize: '60px' },
                                    children: [
                                        { type: 'span', props: { style: { color: '#00ff89' }, children: `Wins ${wins}` } },
                                        { type: 'span', props: { style: { color: '#ff4b4b' }, children: `Losses ${losses}` } }
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