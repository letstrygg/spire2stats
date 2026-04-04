import { wrapLayout, generateItemSummaryBox, generateItemJsonLd, formatDescription } from './shared.js';

export function eventDetailTemplate(event, stats, averagesHtml, videosHtml) {
    const options = JSON.parse(event.options || '[]');
    let optionsHtml = '';
    if (options.length > 0) {
        optionsHtml = `
        <div class="options-section">
            <h3>Choices & Outcomes</h3>
            <div class="options-grid">
                ${options.map(opt => `
                    <div class="option-card">
                        <div class="option-title">${opt.title || opt.id}</div>
                        <div class="option-desc">${formatDescription(opt.description)}</div>
                    </div>
                `).join('')}
            </div>
        </div>`;
    }

    return wrapLayout(
        event.name, 
        `
        ${generateItemSummaryBox(event.name, stats)}
        ${averagesHtml}
        <div class="event-box">
            <div class="subtitle">${event.act || 'Unknown Act'} • ${event.type || 'Event'}</div>
            <div class="description">${formatDescription(event.description)}</div>
        </div>
        ${optionsHtml}
        ${videosHtml}`,
        [{ name: 'events', url: '/events/' }, { name: event.name, url: '' }],
        `${event.name} ${stats.formatted}% winrate across ${stats.seen} runs on Slay the Spire 2.`,
        generateItemJsonLd(event.name, "Event", stats)
    );
}