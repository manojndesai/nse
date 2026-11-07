/**
 * NIFTY PRO TERMINAL - Technical Study Summary Panel
 * Renders technical sentiment meters, oscillators, moving averages, and pivot points.
 */

class TechnicalSummaryPanel {
    constructor() {
        this.container = document.getElementById('tech-summary-container');
    }

    render(candles, quoteData = {}) {
        if (!this.container || !candles || candles.length === 0) return;

        const summary = Indicators.getTechnicalSummary(candles);
        const pivots = Indicators.calculatePivots(candles);
        const lastCandle = candles[candles.length - 1];
        const currentPrice = quoteData.price || lastCandle.close;

        // Sentiment badge styling
        let badgeColor = '#94a3b8';
        let gaugeAngle = 0; // -90 to +90 deg

        if (summary.overall === 'STRONG BUY') {
            badgeColor = '#10b981';
            gaugeAngle = 70;
        } else if (summary.overall === 'BUY') {
            badgeColor = '#34d399';
            gaugeAngle = 35;
        } else if (summary.overall === 'NEUTRAL') {
            badgeColor = '#fbbf24';
            gaugeAngle = 0;
        } else if (summary.overall === 'SELL') {
            badgeColor = '#f87171';
            gaugeAngle = -35;
        } else if (summary.overall === 'STRONG SELL') {
            badgeColor = '#ef4444';
            gaugeAngle = -70;
        }

        // Intraday range calculation
        const dayLow = quoteData.low || Math.min(...candles.slice(-75).map(c => c.low));
        const dayHigh = quoteData.high || Math.max(...candles.slice(-75).map(c => c.high));
        const rangeSpread = Math.max(dayHigh - dayLow, 0.01);
        const rangeProgress = Math.min(Math.max(((currentPrice - dayLow) / rangeSpread) * 100, 0), 100);

        this.container.innerHTML = `
            <!-- Speedometer Technical Sentiment Meter -->
            <div class="tech-card">
                <div class="tech-card-header">
                    <span class="tech-card-title">Technical Sentiment</span>
                    <span class="sentiment-badge" style="background: ${badgeColor}20; color: ${badgeColor}; border: 1px solid ${badgeColor}40">
                        ${summary.overall}
                    </span>
                </div>
                
                <div class="gauge-wrapper">
                    <div class="gauge-semi-circle">
                        <div class="gauge-track"></div>
                        <div class="gauge-needle" style="transform: rotate(${gaugeAngle}deg)"></div>
                        <div class="gauge-center-cap"></div>
                    </div>
                    <div class="gauge-labels">
                        <span class="label-sell">SELL</span>
                        <span class="label-neutral">NEUTRAL</span>
                        <span class="label-buy">BUY</span>
                    </div>
                </div>

                <div class="signal-breakdown-row">
                    <div class="signal-stat buy-stat">
                        <span class="stat-count">${summary.bullishCount}</span>
                        <span class="stat-text">Bullish</span>
                    </div>
                    <div class="signal-stat neutral-stat">
                        <span class="stat-count">${summary.neutralCount}</span>
                        <span class="stat-text">Neutral</span>
                    </div>
                    <div class="signal-stat sell-stat">
                        <span class="stat-count">${summary.bearishCount}</span>
                        <span class="stat-text">Bearish</span>
                    </div>
                </div>
            </div>

            <!-- Day's Range Visual Bar -->
            <div class="tech-card">
                <div class="tech-card-header">
                    <span class="tech-card-title">Intraday Session Range</span>
                    <span class="range-spread">Spread: ₹${(dayHigh - dayLow).toFixed(2)}</span>
                </div>
                <div class="range-bar-container">
                    <div class="range-bounds">
                        <div class="bound-item">
                            <span class="bound-label">L: Low</span>
                            <span class="bound-val">₹${dayLow.toFixed(2)}</span>
                        </div>
                        <div class="bound-item text-right">
                            <span class="bound-label">H: High</span>
                            <span class="bound-val">₹${dayHigh.toFixed(2)}</span>
                        </div>
                    </div>
                    <div class="range-progress-track">
                        <div class="range-progress-fill" style="width: ${rangeProgress}%"></div>
                        <div class="range-thumb-marker" style="left: ${rangeProgress}%" title="Current: ₹${currentPrice.toFixed(2)}"></div>
                    </div>
                </div>
            </div>

            <!-- Indicators Signals Table -->
            <div class="tech-card">
                <div class="tech-card-header">
                    <span class="tech-card-title">Indicator Signals</span>
                </div>
                <div class="indicator-table-wrapper">
                    <table class="tech-table">
                        <thead>
                            <tr>
                                <th>Indicator</th>
                                <th>Value</th>
                                <th class="text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${summary.indicators.map(ind => {
                                const isBull = ind.signal.includes('BULLISH') || ind.signal.includes('BUY');
                                const isBear = ind.signal.includes('BEARISH') || ind.signal.includes('SELL');
                                const sigClass = isBull ? 'badge-bull' : (isBear ? 'badge-bear' : 'badge-neutral');
                                return `
                                    <tr>
                                        <td class="ind-name">${ind.name}</td>
                                        <td class="ind-val font-mono">${ind.value}</td>
                                        <td class="text-right">
                                            <span class="signal-tag ${sigClass}">${ind.signal}</span>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Classic Pivot Points Table -->
            ${pivots ? `
            <div class="tech-card">
                <div class="tech-card-header">
                    <span class="tech-card-title">Key Pivot Levels</span>
                    <span class="pivot-badge">Classic</span>
                </div>
                <div class="pivot-list">
                    <div class="pivot-row res-level">
                        <span class="pivot-tag tag-res">R3</span>
                        <span class="pivot-price font-mono">₹${pivots.r3.toFixed(2)}</span>
                        <span class="pivot-diff ${pivots.r3 >= currentPrice ? 'text-up' : 'text-down'} font-mono">
                            ${((pivots.r3 - currentPrice) >= 0 ? '+' : '')}${(pivots.r3 - currentPrice).toFixed(1)}
                        </span>
                    </div>
                    <div class="pivot-row res-level">
                        <span class="pivot-tag tag-res">R2</span>
                        <span class="pivot-price font-mono">₹${pivots.r2.toFixed(2)}</span>
                        <span class="pivot-diff ${pivots.r2 >= currentPrice ? 'text-up' : 'text-down'} font-mono">
                            ${((pivots.r2 - currentPrice) >= 0 ? '+' : '')}${(pivots.r2 - currentPrice).toFixed(1)}
                        </span>
                    </div>
                    <div class="pivot-row res-level">
                        <span class="pivot-tag tag-res">R1</span>
                        <span class="pivot-price font-mono">₹${pivots.r1.toFixed(2)}</span>
                        <span class="pivot-diff ${pivots.r1 >= currentPrice ? 'text-up' : 'text-down'} font-mono">
                            ${((pivots.r1 - currentPrice) >= 0 ? '+' : '')}${(pivots.r1 - currentPrice).toFixed(1)}
                        </span>
                    </div>
                    <div class="pivot-row pivot-main">
                        <span class="pivot-tag tag-p">PIVOT (P)</span>
                        <span class="pivot-price font-mono font-bold">₹${pivots.pivot.toFixed(2)}</span>
                        <span class="pivot-diff font-mono">
                            ${((pivots.pivot - currentPrice) >= 0 ? '+' : '')}${(pivots.pivot - currentPrice).toFixed(1)}
                        </span>
                    </div>
                    <div class="pivot-row sup-level">
                        <span class="pivot-tag tag-sup">S1</span>
                        <span class="pivot-price font-mono">₹${pivots.s1.toFixed(2)}</span>
                        <span class="pivot-diff ${pivots.s1 >= currentPrice ? 'text-up' : 'text-down'} font-mono">
                            ${((pivots.s1 - currentPrice) >= 0 ? '+' : '')}${(pivots.s1 - currentPrice).toFixed(1)}
                        </span>
                    </div>
                    <div class="pivot-row sup-level">
                        <span class="pivot-tag tag-sup">S2</span>
                        <span class="pivot-price font-mono">₹${pivots.s2.toFixed(2)}</span>
                        <span class="pivot-diff ${pivots.s2 >= currentPrice ? 'text-up' : 'text-down'} font-mono">
                            ${((pivots.s2 - currentPrice) >= 0 ? '+' : '')}${(pivots.s2 - currentPrice).toFixed(1)}
                        </span>
                    </div>
                    <div class="pivot-row sup-level">
                        <span class="pivot-tag tag-sup">S3</span>
                        <span class="pivot-price font-mono">₹${pivots.s3.toFixed(2)}</span>
                        <span class="pivot-diff ${pivots.s3 >= currentPrice ? 'text-up' : 'text-down'} font-mono">
                            ${((pivots.s3 - currentPrice) >= 0 ? '+' : '')}${(pivots.s3 - currentPrice).toFixed(1)}
                        </span>
                    </div>
                </div>
            </div>
            ` : ''}
        `;
    }
}

window.TechnicalSummaryPanel = TechnicalSummaryPanel;
