/**
 * NIFTY PRO TERMINAL - Nifty Strategy & Option Hedging Module
 * Simulates buying/selling current month Nifty Futures with option hedging (Protective Put / Protective Call)
 * Calculates institutional-grade Black-Scholes option pricing, guaranteed capped Maximum Loss,
 * Breakeven levels, scenario matrices, and interactive payoff visualizer.
 */

class NiftyStrategyManager {
    constructor() {
        this.action = 'BUY'; // 'BUY' (Long Fut + Long Put) or 'SELL' (Short Fut + Long Call)
        this.spotPrice = 25030.35;
        this.futureRate = 25040.45;
        this.liveFutureBasis = 10.10;
        this.contractName = 'NIFTY CURRENT FUT';
        this.expiryType = 'weekly'; // 'weekly' or 'monthly'
        this.expiryDate = '';
        this.expiryDisplay = '';
        this.weeklyExpiryDisplay = '';
        this.monthlyExpiryDisplay = '';
        this.weeklyDte = 4.5;
        this.monthlyDte = 22.0;
        this.daysToExpiry = 4.5;
        this.lotSize = 65;
        this.lots = 1;
        this.iv = 17.66; // %
        this.selectedStrike = null;
        this.strikesData = [];
        this.isOpen = false;
        this.isUserOverriddenPrice = false;
        this.customPremiumOverrides = {};

        // Virtual position tracker
        this.activeSimulations = [];
        this.loadSavedSimulations();

        this.initDOMElements();
        this.bindEvents();
    }

    initDOMElements() {
        this.modal = document.getElementById('nifty-strategy-modal');
        this.backdrop = document.getElementById('nifty-strategy-backdrop');
        this.closeBtn = document.getElementById('close-strategy-modal-btn');
        this.toolbarBuyBtn = document.getElementById('strategy-buy-trigger');
        this.toolbarSellBtn = document.getElementById('strategy-sell-trigger');
        this.headerStrategyBtn = document.getElementById('header-strategy-btn');
    }

    bindEvents() {
        if (this.toolbarBuyBtn) {
            this.toolbarBuyBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.openModal('BUY');
            });
        }

        if (this.toolbarSellBtn) {
            this.toolbarSellBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.openModal('SELL');
            });
        }

        if (this.headerStrategyBtn) {
            this.headerStrategyBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.openModal(this.action || 'BUY');
            });
        }

        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => this.closeModal());
        }

        if (this.backdrop) {
            this.backdrop.addEventListener('click', () => this.closeModal());
        }

        // Close on Esc key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.closeModal();
            }
        });
    }

    handleLiveTick(tick) {
        if (!tick) return;
        if (tick.symbol === '^NSEI' || tick.displayName === 'NIFTY 50' || tick.symbol === 'NIFTY 50') {
            this.spotPrice = tick.price;
            if (!this.isUserOverriddenPrice) {
                this.futureRate = Math.round((tick.price + this.liveFutureBasis) * 100) / 100;
            }
            const spotEl = document.getElementById('strat-spot-val');
            if (spotEl) {
                spotEl.innerText = `₹${this.spotPrice.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
            }
        }
    }

    loadSavedSimulations() {
        try {
            const saved = localStorage.getItem('nifty_simulated_hedges');
            if (saved) {
                this.activeSimulations = JSON.parse(saved);
            }
        } catch (e) {
            this.activeSimulations = [];
        }
    }

    saveSimulations() {
        try {
            localStorage.setItem('nifty_simulated_hedges', JSON.stringify(this.activeSimulations));
        } catch (e) {
            console.error("Failed saving simulations:", e);
        }
    }

    async openModal(action = 'BUY') {
        this.action = action;
        this.isOpen = true;
        this.isUserOverriddenPrice = false;

        if (this.modal && this.backdrop) {
            this.backdrop.style.display = 'block';
            this.modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }

        await this.fetchStrategyData();
    }

    closeModal() {
        this.isOpen = false;
        if (this.modal && this.backdrop) {
            this.backdrop.style.display = 'none';
            this.modal.style.display = 'none';
            document.body.style.overflow = '';
        }
    }

    async fetchStrategyData() {
        const modalBody = document.getElementById('strategy-modal-content');
        if (modalBody && this.strikesData.length === 0) {
            modalBody.innerHTML = `
                <div class="strategy-loading-state">
                    <div class="spinner"></div>
                    <span>Calculating Nifty institutional option hedge models...</span>
                </div>
            `;
        }

        try {
            const params = new URLSearchParams({
                action: this.action,
                lots: this.lots.toString(),
                lotSize: this.lotSize.toString(),
                iv: this.iv.toString(),
                expiryType: this.expiryType
            });

            if (this.isUserOverriddenPrice && this.futureRate) {
                params.set('futurePrice', this.futureRate.toString());
            }

            const res = await fetch(`/api/nifty-strategy?${params.toString()}`);
            if (!res.ok) throw new Error("Failed fetching strategy calculations");
            const data = await res.json();

            if (data.status === 'success') {
                this.spotPrice = data.spotPrice;
                if (!this.isUserOverriddenPrice) {
                    this.futureRate = data.futureRate;
                }
                this.liveFutureBasis = data.liveFutureBasis;
                this.contractName = data.contractName;
                this.expiryDate = data.expiryDate;
                this.expiryDisplay = data.expiryDisplay;
                this.weeklyExpiryDisplay = data.weeklyExpiryDisplay || data.expiryDisplay;
                this.monthlyExpiryDisplay = data.monthlyExpiryDisplay || '';
                this.weeklyDte = data.weeklyDte || data.daysToExpiry;
                this.monthlyDte = data.monthlyDte || 22.0;
                this.daysToExpiry = data.daysToExpiry;
                this.lotSize = data.lotSize;
                this.lots = data.lots;
                this.strikesData = data.strikes;

                // Apply any user custom premium overrides
                this.strikesData.forEach(item => {
                    if (this.customPremiumOverrides[item.strike] !== undefined) {
                        const customPrem = this.customPremiumOverrides[item.strike];
                        item.premium = customPrem;
                        item.totalHedgeCost = Math.round(customPrem * this.lotSize * this.lots * 100) / 100;
                        const futLoss = this.action === 'BUY' ? Math.max(0, this.futureRate - item.strike) : Math.max(0, item.strike - this.futureRate);
                        item.maxLossPerUnit = Math.round((futLoss + customPrem) * 100) / 100;
                        item.maxLossTotal = Math.round(item.maxLossPerUnit * this.lotSize * this.lots * 100) / 100;
                        item.breakeven = this.action === 'BUY' ? Math.round((this.futureRate + customPrem) * 100) / 100 : Math.round((this.futureRate - customPrem) * 100) / 100;
                    }
                });

                // Default selected strike to ATM or closest OTM
                if (!this.selectedStrike || !this.strikesData.find(s => s.strike === this.selectedStrike)) {
                    if (this.action === 'BUY') {
                        // For Long Future, pick ATM or 50 pts OTM Put (e.g. strike <= spot)
                        const otm = this.strikesData.filter(s => s.strike <= data.spotPrice);
                        this.selectedStrike = otm.length > 0 ? otm[otm.length - 1].strike : data.atmStrike;
                    } else {
                        // For Short Future, pick ATM or 50 pts OTM Call (e.g. strike >= spot)
                        const otm = this.strikesData.filter(s => s.strike >= data.spotPrice);
                        this.selectedStrike = otm.length > 0 ? otm[0].strike : data.atmStrike;
                    }
                }

                this.renderModal();
            }
        } catch (err) {
            console.error("Strategy Fetch Error:", err);
            // Fallback: calculate locally if network hiccup
            this.calculateLocalFallback();
            this.renderModal();
        }
    }

    calculateLocalFallback() {
        // Fallback generator in case of network issue
        const r = 0.065;
        const t = Math.max(0.001, this.daysToExpiry / 365.0);
        const atm = Math.round(this.spotPrice / 50) * 50;
        this.strikesData = [];

        for (let i = -6; i <= 6; i++) {
            const K = atm + (i * 50);
            const moneyness = K === atm ? "ATM" : ((this.action === 'BUY' ? K < atm : K > atm) ? "OTM" : "ITM");
            const estPrem = Math.max(10, Math.round((Math.abs(this.spotPrice - K) * 0.4 + 110) * 100) / 100);
            const maxLossPerUnit = this.action === 'BUY' ? (this.futureRate - K + estPrem) : (K - this.futureRate + estPrem);
            const qty = this.lotSize * this.lots;
            this.strikesData.push({
                strike: K,
                optionType: this.action === 'BUY' ? 'PE' : 'CE',
                moneyness: moneyness,
                isAtm: K === atm,
                premium: estPrem,
                totalHedgeCost: estPrem * qty,
                maxLossPerUnit: maxLossPerUnit,
                maxLossTotal: maxLossPerUnit * qty,
                breakeven: this.action === 'BUY' ? this.futureRate + estPrem : this.futureRate - estPrem,
                breakevenDiff: this.action === 'BUY' ? estPrem : -estPrem,
                maxProfit: this.action === 'BUY' ? 'Unlimited' : `+₹${((this.futureRate - estPrem) * qty).toLocaleString()}`,
                scenarios: {
                    "-3.0%": { underlying: this.spotPrice * 0.97, pnl: -maxLossPerUnit * qty, isProfit: false },
                    "-1.5%": { underlying: this.spotPrice * 0.985, pnl: -maxLossPerUnit * qty, isProfit: false },
                    "+0.0%": { underlying: this.spotPrice, pnl: -estPrem * qty, isProfit: false },
                    "+1.5%": { underlying: this.spotPrice * 1.015, pnl: (this.spotPrice * 0.015 - estPrem) * qty, isProfit: true },
                    "+3.0%": { underlying: this.spotPrice * 1.03, pnl: (this.spotPrice * 0.03 - estPrem) * qty, isProfit: true }
                }
            });
        }
    }

    renderModal() {
        const container = document.getElementById('strategy-modal-content');
        if (!container) return;

        const totalQty = this.lotSize * this.lots;
        const selectedItem = this.strikesData.find(s => s.strike === this.selectedStrike) || this.strikesData[0];

        const isBuy = this.action === 'BUY';
        const hedgeType = isBuy ? 'PUT (PE)' : 'CALL (CE)';
        const hedgeIcon = isBuy ? '🛡️' : '🎯';

        container.innerHTML = `
            <!-- Action Mode Tabs & Strategy Header -->
            <div class="strategy-banner-row">
                <div class="strategy-action-selector">
                    <button class="strat-tab-btn ${isBuy ? 'active buy-active' : ''}" id="tab-strat-buy">
                        <span class="action-symbol">▲</span>
                        <div class="tab-label-wrap">
                            <span class="tab-title">BUY NIFTY FUTURE (LONG)</span>
                            <span class="tab-subtitle">Hedge: Buy Protective Put Option (PE)</span>
                        </div>
                    </button>
                    <button class="strat-tab-btn ${!isBuy ? 'active sell-active' : ''}" id="tab-strat-sell">
                        <span class="action-symbol">▼</span>
                        <div class="tab-label-wrap">
                            <span class="tab-title">SELL NIFTY FUTURE (SHORT)</span>
                            <span class="tab-subtitle">Hedge: Buy Protective Call Option (CE)</span>
                        </div>
                    </button>
                </div>

                <div class="strategy-contract-meta-card">
                    <div class="meta-row">
                        <span class="meta-label">Contract:</span>
                        <span class="meta-val highlight-cyan">${this.contractName}</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-label">Expiry Mode:</span>
                        <div class="strat-expiry-toggle-group">
                            <button id="strat-exp-weekly" class="strat-exp-btn ${this.expiryType === 'weekly' ? 'active-exp' : ''}" title="Next Weekly Thursday Expiry (Most Active for Options)">
                                ⚡ Weekly (${this.weeklyExpiryDisplay || this.expiryDisplay} · ${this.weeklyDte || this.daysToExpiry}d)
                            </button>
                            <button id="strat-exp-monthly" class="strat-exp-btn ${this.expiryType === 'monthly' ? 'active-exp' : ''}" title="Current Month Final Thursday Expiry">
                                📅 Monthly (${this.monthlyExpiryDisplay || 'Month'} · ${this.monthlyDte || 22}d)
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Strategy Logic Explainer Callout -->
            <div class="strategy-callout-card ${isBuy ? 'callout-buy' : 'callout-sell'}">
                <div class="callout-icon">${isBuy ? '🛡️' : '🔒'}</div>
                <div class="callout-text">
                    ${isBuy ? `
                        <b>Long Future + Put Hedge Strategy:</b> You bought <b>${totalQty} units (${this.lots} lot)</b> of Nifty Future at <b>₹${this.futureRate.toLocaleString(undefined, {minimumFractionDigits: 2})}</b>. 
                        To safeguard against sudden market crashes, you buy a <b>Put Option (${hedgeType})</b>. If Nifty crashes, the Put option gives you the guaranteed right to sell at the strike price, strictly capping your <b>Maximum Loss</b> while keeping <b>Unlimited Upside Profit</b> intact!
                    ` : `
                        <b>Short Future + Call Hedge Strategy:</b> You sold <b>${totalQty} units (${this.lots} lot)</b> of Nifty Future at <b>₹${this.futureRate.toLocaleString(undefined, {minimumFractionDigits: 2})}</b>. 
                        To safeguard against unexpected market rallies or gaps up, you buy a <b>Call Option (${hedgeType})</b>. If Nifty rallies aggressively, the Call option covers your short future at the strike price, strictly capping your <b>Maximum Loss</b>!
                    `}
                </div>
            </div>

            <!-- Key Parameters Configuration Grid -->
            <div class="strategy-params-grid">
                <div class="param-card">
                    <span class="param-title">Nifty Spot Price</span>
                    <span class="param-val font-mono" id="strat-spot-val">₹${this.spotPrice.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                    <span class="param-hint">NSE Live Benchmark</span>
                </div>

                <div class="param-card active-param">
                    <div class="param-title-row">
                        <span class="param-title">${this.action} Future Rate</span>
                        <button id="strat-reset-live-rate" class="rate-reset-link" title="Reset to Live Calculated Futures Rate">↺ Live Rate</button>
                    </div>
                    <div class="param-input-wrap">
                        <span class="input-currency">₹</span>
                        <input type="number" step="0.05" id="strat-future-input" class="param-num-input font-mono" value="${this.futureRate.toFixed(2)}">
                    </div>
                    <span class="param-hint">Basis: +${this.liveFutureBasis.toFixed(2)} pts</span>
                </div>

                <div class="param-card">
                    <span class="param-title">Lot Size & Quantity</span>
                    <div class="param-stepper-row">
                        <select id="strat-lot-size" class="param-select">
                            <option value="65" ${this.lotSize === 65 ? 'selected' : ''}>65 (Standard Nifty 50)</option>
                            <option value="25" ${this.lotSize === 25 ? 'selected' : ''}>25 (Legacy Nifty)</option>
                            <option value="50" ${this.lotSize === 50 ? 'selected' : ''}>50 (Historic)</option>
                            <option value="75" ${this.lotSize === 75 ? 'selected' : ''}>75</option>
                        </select>
                        <div class="lots-stepper">
                            <label>Lots:</label>
                            <input type="number" id="strat-lots-count" min="1" max="100" value="${this.lots}" class="lots-input font-mono">
                        </div>
                    </div>
                    <span class="param-hint">= Total ${totalQty} units</span>
                </div>

                <div class="param-card">
                    <span class="param-title">India VIX / IV</span>
                    <div class="param-input-wrap">
                        <input type="number" step="0.1" id="strat-iv-input" class="param-num-input font-mono" value="${this.iv.toFixed(2)}">
                        <span class="input-unit">%</span>
                    </div>
                    <span class="param-hint">Implied Volatility</span>
                </div>
            </div>

            <!-- Focus Summary: Selected Strike Payoff Highlight -->
            <div class="selected-strike-hero-card">
                <div class="hero-left">
                    <div class="selected-badge-row">
                        <span class="hero-tag">SELECTED HEDGE STRIKE</span>
                        <span class="strike-pill ${selectedItem.moneyness.toLowerCase()}">${selectedItem.strike} ${selectedItem.optionType} (${selectedItem.moneyness})</span>
                    </div>
                    <div class="hero-strike-name">
                        NIFTY ${selectedItem.strike} ${isBuy ? 'PUT OPTION' : 'CALL OPTION'}
                    </div>
                    <div class="hero-stats-row">
                        <div class="hero-stat-item">
                            <span class="stat-lbl">${isBuy ? 'Put' : 'Call'} Option Premium:</span>
                            <div class="premium-edit-container" style="display: inline-flex; align-items: center; gap: 6px;">
                                <div class="param-input-wrap" style="padding: 2px 6px; width: 110px;">
                                    <span class="input-currency" style="font-size: 12px;">₹</span>
                                    <input type="number" step="0.05" id="strat-premium-override-input" class="param-num-input font-mono" value="${selectedItem.premium.toFixed(2)}" style="font-size: 13px; font-weight: 700; width: 80px;" title="Fine-tune option premium to match live market quotes">
                                </div>
                                <span class="stat-val font-mono"><small>(₹${selectedItem.totalHedgeCost.toLocaleString(undefined, {minimumFractionDigits: 2})} total)</small></span>
                            </div>
                        </div>
                        <div class="hero-stat-item">
                            <span class="stat-lbl">Breakeven Index Level:</span>
                            <span class="stat-val font-mono highlight-gold">₹${selectedItem.breakeven.toFixed(2)} <small>(${selectedItem.breakevenDiff > 0 ? '+' : ''}${selectedItem.breakevenDiff.toFixed(2)} pts)</small></span>
                        </div>
                    </div>
                </div>

                <div class="hero-right">
                    <!-- MAXIMUM LOSS CARD (The Critical Requirement) -->
                    <div class="max-loss-box">
                        <div class="max-loss-label">
                            <span class="shield-icon">🛡️</span>
                            <span>GUARANTEED MAXIMUM LOSS</span>
                        </div>
                        <div class="max-loss-amount font-mono">
                            -₹${Math.abs(selectedItem.maxLossTotal).toLocaleString(undefined, {minimumFractionDigits: 2})}
                        </div>
                        <div class="max-loss-points font-mono">
                            Capped at -${Math.abs(selectedItem.maxLossPerUnit).toFixed(2)} points
                        </div>
                        
                        <!-- Explicit Breakdown of Future Loss + Option Premium -->
                        <div class="max-loss-breakdown-box">
                            <div class="breakdown-row">
                                <span class="bd-label">1. Future Contract Loss (Entry to Strike):</span>
                                <span class="bd-val font-mono">-${Math.abs(isBuy ? Math.max(0, this.futureRate - selectedItem.strike) : Math.max(0, selectedItem.strike - this.futureRate)).toFixed(2)} pts (-₹${(Math.abs(isBuy ? Math.max(0, this.futureRate - selectedItem.strike) : Math.max(0, selectedItem.strike - this.futureRate)) * totalQty).toLocaleString(undefined, {minimumFractionDigits: 2})})</span>
                            </div>
                            <div class="breakdown-row">
                                <span class="bd-label">2. ${isBuy ? 'Put' : 'Call'} Option Premium Paid:</span>
                                <span class="bd-val font-mono">-${selectedItem.premium.toFixed(2)} pts (-₹${selectedItem.totalHedgeCost.toLocaleString(undefined, {minimumFractionDigits: 2})})</span>
                            </div>
                            <div class="breakdown-row breakdown-total">
                                <span class="bd-label"><b>= Total Combined Maximum Loss:</b></span>
                                <span class="bd-val font-mono font-bold text-down">-₹${Math.abs(selectedItem.maxLossTotal).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                            </div>
                        </div>

                        <div class="max-loss-reassurance">
                            <b>YES:</b> This guaranteed loss accounts for <b>BOTH</b> the Nifty Future adverse move to the strike <b>AND</b> the full ${isBuy ? 'Put' : 'Call'} premium paid. You can never lose more than this amount.
                        </div>
                    </div>
                </div>
            </div>

            <!-- Interactive Payoff Diagram Visualizer -->
            <div class="payoff-diagram-section">
                <div class="section-title-bar">
                    <span class="section-heading">📊 Interactive Payoff Curve Visualizer</span>
                    <div class="chart-legend">
                        <span class="legend-item"><span class="legend-color-line hedged"></span> Hedged Strategy (Capped Downside Risk)</span>
                        <span class="legend-item"><span class="legend-color-line unhedged"></span> Naked Future (Catastrophic Unlimited Risk)</span>
                    </div>
                </div>
                <div class="payoff-chart-container" id="payoff-chart-container">
                    ${this.generatePayoffSVG(selectedItem)}
                </div>
            </div>

            <!-- Comprehensive Table of Nearby Strikes and Probable Loss -->
            <div class="strikes-table-section">
                <div class="section-title-bar">
                    <span class="section-heading">⚡ Nearby Strike Prices & Probable Loss Comparison</span>
                    <span class="section-subtext">Click any strike row to inspect its risk profile and payoff curve</span>
                </div>

                <div class="table-responsive-wrapper">
                    <table class="strikes-comparison-table">
                        <thead>
                            <tr>
                                <th>Strike Price</th>
                                <th>Type</th>
                                <th>Moneyness</th>
                                <th>Hedge Premium (₹)</th>
                                <th>Total Premium</th>
                                <th class="col-highlight-risk">🛡️ MAXIMUM LOSS</th>
                                <th>Max Loss / Unit</th>
                                <th>Breakeven</th>
                                <th colspan="3" class="col-scenario-header">Probable P&L at Market Move</th>
                                <th>Action</th>
                            </tr>
                            <tr class="sub-header-row">
                                <th colspan="8"></th>
                                <th class="scen-col text-down">-3.0% Crash</th>
                                <th class="scen-col">0% Flat</th>
                                <th class="scen-col text-up">+3.0% Rally</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${this.renderStrikesTableRows(selectedItem)}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Virtual Position Simulator Action Footer -->
            <div class="strategy-modal-footer">
                <div class="footer-left-info">
                    <span>💡 <b>Pro Tip:</b> An ATM or slight OTM hedge (50 to 100 pts) balances affordable premium cost with tight max loss protection.</span>
                </div>
                <div class="footer-actions">
                    <button id="strat-simulate-btn" class="action-btn-simulate">
                        <span>⚡ Simulate & Track Virtual Position</span>
                    </button>
                    <button id="strat-close-footer-btn" class="action-btn-secondary">
                        Close
                    </button>
                </div>
            </div>

            <!-- Active Virtual Simulations Tracker Panel -->
            ${this.renderActiveSimulations()}
        `;

        this.bindModalInteractiveControls();
    }

    renderStrikesTableRows(selectedItem) {
        return this.strikesData.map(item => {
            const isSelected = item.strike === selectedItem.strike;
            const rowClass = `${isSelected ? 'row-selected' : ''} ${item.isAtm ? 'row-atm' : ''}`;

            const scenCrash = item.scenarios["-3.0%"] ? item.scenarios["-3.0%"].pnl : -item.maxLossTotal;
            const scenFlat = item.scenarios["0.0%"] ? item.scenarios["0.0%"].pnl : 0;
            const scenRally = item.scenarios["+3.0%"] ? item.scenarios["+3.0%"].pnl : 0;

            const formatPnl = (val) => {
                const isPos = val > 0;
                const isZero = Math.abs(val) < 0.01;
                const cls = isPos ? 'text-up' : (isZero ? 'text-flat' : 'text-down');
                const sign = isPos ? '+' : '';
                return `<span class="${cls} font-mono">${sign}₹${val.toLocaleString(undefined, {minimumFractionDigits: 1, maximumFractionDigits: 1})}</span>`;
            };

            return `
                <tr class="${rowClass}" data-strike="${item.strike}">
                    <td>
                        <span class="strike-value font-mono ${item.isAtm ? 'font-bold highlight-cyan' : ''}">${item.strike}</span>
                        ${item.isAtm ? '<span class="atm-badge">ATM</span>' : ''}
                    </td>
                    <td><span class="type-badge ${item.optionType === 'PE' ? 'pe-badge' : 'ce-badge'}">${item.optionType}</span></td>
                    <td><span class="moneyness-pill moneyness-${item.moneyness.toLowerCase()}">${item.moneyness}</span></td>
                    <td class="font-mono">₹${item.premium.toFixed(2)}</td>
                    <td class="font-mono">₹${item.totalHedgeCost.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                    <td class="col-highlight-risk">
                        <span class="max-loss-cell-val font-mono">
                            -₹${Math.abs(item.maxLossTotal).toLocaleString(undefined, {minimumFractionDigits: 2})}
                        </span>
                    </td>
                    <td class="font-mono text-down">-${Math.abs(item.maxLossPerUnit).toFixed(2)} pts</td>
                    <td class="font-mono highlight-gold">₹${item.breakeven.toFixed(2)}</td>
                    <td class="scen-cell font-mono">${formatPnl(scenCrash)}</td>
                    <td class="scen-cell font-mono">${formatPnl(scenFlat)}</td>
                    <td class="scen-cell font-mono">${formatPnl(scenRally)}</td>
                    <td>
                        <button class="btn-select-strike ${isSelected ? 'btn-selected' : ''}" data-strike="${item.strike}">
                            ${isSelected ? 'Active ✓' : 'Select'}
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    generatePayoffSVG(selectedItem) {
        const width = 840;
        const height = 260;
        const padding = { top: 25, right: 35, bottom: 40, left: 70 };

        const chartW = width - padding.left - padding.right;
        const chartH = height - padding.top - padding.bottom;

        const F0 = this.futureRate;
        const K = selectedItem.strike;
        const P = selectedItem.premium;
        const qty = this.lotSize * this.lots;
        const maxLoss = selectedItem.maxLossTotal;
        const breakeven = selectedItem.breakeven;

        // X-axis range: ±4.5% of spot
        const minX = Math.round(this.spotPrice * 0.955);
        const maxX = Math.round(this.spotPrice * 1.045);

        // Calculate Y values for range
        const numPoints = 60;
        const hedgedPoints = [];
        const unhedgedPoints = [];

        let minY = -Math.abs(maxLoss) * 1.4;
        let maxY = Math.abs(maxLoss) * 2.2;

        for (let i = 0; i <= numPoints; i++) {
            const st = minX + (i / numPoints) * (maxX - minX);
            let hPnl = 0;
            let uPnl = 0;

            if (this.action === 'BUY') {
                uPnl = (st - F0) * qty;
                const putPayoff = Math.max(0, K - st) - P;
                hPnl = ((st - F0) + putPayoff) * qty;
            } else {
                uPnl = (F0 - st) * qty;
                const callPayoff = Math.max(0, st - K) - P;
                hPnl = ((F0 - st) + callPayoff) * qty;
            }

            hedgedPoints.push({ x: st, y: hPnl });
            unhedgedPoints.push({ x: st, y: uPnl });

            if (uPnl < minY) minY = uPnl;
            if (uPnl > maxY && Math.abs(uPnl) < 100000) maxY = uPnl;
            if (hPnl > maxY) maxY = hPnl;
        }

        // Clamp min/max Y to reasonable chart bounds
        minY = Math.max(minY, -Math.abs(maxLoss) * 2.5);
        maxY = Math.min(maxY, Math.abs(maxLoss) * 3.0);
        if (maxY <= minY) maxY = minY + 1000;

        const scaleX = (x) => padding.left + ((x - minX) / (maxX - minX)) * chartW;
        const scaleY = (y) => padding.top + chartH - ((y - minY) / (maxY - minY)) * chartH;

        // Build SVG paths
        const hedgedPath = hedgedPoints.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(pt.x).toFixed(1)} ${scaleY(pt.y).toFixed(1)}`).join(' ');
        const unhedgedPath = unhedgedPoints.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(pt.x).toFixed(1)} ${scaleY(pt.y).toFixed(1)}`).join(' ');

        const zeroY = scaleY(0);
        const maxLossY = scaleY(-Math.abs(maxLoss));
        const spotX = scaleX(this.spotPrice);
        const strikeX = scaleX(K);
        const breakevenX = scaleX(breakeven);

        return `
            <svg viewBox="0 0 ${width} ${height}" class="payoff-svg" xmlns="http://www.w3.org/2000/svg">
                <!-- Background Grid -->
                <line x1="${padding.left}" y1="${zeroY}" x2="${width - padding.right}" y2="${zeroY}" stroke="rgba(255,255,255,0.25)" stroke-width="1.5" stroke-dasharray="3,3"/>
                <line x1="${padding.left}" y1="${maxLossY}" x2="${width - padding.right}" y2="${maxLossY}" stroke="rgba(242,54,69,0.7)" stroke-width="1.5" stroke-dasharray="4,4"/>

                <!-- Vertical Markers: Spot, Strike, Breakeven -->
                <line x1="${spotX}" y1="${padding.top}" x2="${spotX}" y2="${height - padding.bottom}" stroke="rgba(0, 212, 255, 0.4)" stroke-width="1" stroke-dasharray="2,2"/>
                <line x1="${strikeX}" y1="${padding.top}" x2="${strikeX}" y2="${height - padding.bottom}" stroke="rgba(255, 209, 102, 0.4)" stroke-width="1" stroke-dasharray="2,2"/>
                ${breakevenX >= padding.left && breakevenX <= width - padding.right ? `
                    <line x1="${breakevenX}" y1="${padding.top}" x2="${breakevenX}" y2="${height - padding.bottom}" stroke="rgba(8, 153, 129, 0.5)" stroke-width="1" stroke-dasharray="3,2"/>
                ` : ''}

                <!-- Unhedged Future Curve (Red/Grey Dashed) -->
                <path d="${unhedgedPath}" fill="none" stroke="rgba(242, 54, 69, 0.5)" stroke-width="2" stroke-dasharray="5,4"/>

                <!-- Hedged Strategy Curve (Glow Cyan / Green) -->
                <path d="${hedgedPath}" fill="none" stroke="var(--color-cyan)" stroke-width="3" filter="drop-shadow(0px 0px 4px rgba(0,212,255,0.6))"/>

                <!-- Max Loss Floor Label Banner -->
                <rect x="${padding.left + 5}" y="${maxLossY - 18}" width="260" height="16" rx="3" fill="rgba(242,54,69,0.2)" stroke="rgba(242,54,69,0.4)"/>
                <text x="${padding.left + 10}" y="${maxLossY - 6}" font-size="9" fill="#ff6b6b" font-weight="700">🛡️ GUARANTEED MAX LOSS FLOOR: -₹${Math.abs(maxLoss).toLocaleString(undefined, {minimumFractionDigits: 0})}</text>

                <!-- Zero Axis Text -->
                <text x="${width - padding.right + 4}" y="${zeroY + 3}" font-size="9" fill="rgba(255,255,255,0.6)">₹0 P&L</text>

                <!-- Key Pin Annotations -->
                <circle cx="${spotX}" cy="${scaleY(0)}" r="4" fill="var(--color-cyan)"/>
                <text x="${spotX}" y="${height - padding.bottom + 14}" text-anchor="middle" font-size="10" fill="var(--color-cyan)">Spot ₹${Math.round(this.spotPrice)}</text>

                <circle cx="${strikeX}" cy="${scaleY(0)}" r="4" fill="#ffd166"/>
                <text x="${strikeX}" y="${height - padding.bottom + 27}" text-anchor="middle" font-size="9" fill="#ffd166">Strike ${K}</text>

                ${breakevenX >= padding.left && breakevenX <= width - padding.right ? `
                    <circle cx="${breakevenX}" cy="${scaleY(0)}" r="4" fill="#089981"/>
                    <text x="${breakevenX}" y="${padding.top - 8}" text-anchor="middle" font-size="9" fill="#089981" font-weight="700">Breakeven: ₹${breakeven.toFixed(0)}</text>
                ` : ''}

                <!-- Axes Labels -->
                <text x="${width / 2}" y="${height - 6}" text-anchor="middle" font-size="10.5" fill="var(--text-secondary)">NIFTY Underlying Expiry Price (₹)</text>
                <text x="${12}" y="${height / 2}" text-anchor="middle" transform="rotate(-90 12,${height / 2})" font-size="10" fill="var(--text-secondary)">Net Payoff (₹)</text>
            </svg>
        `;
    }

    renderActiveSimulations() {
        if (!this.activeSimulations || this.activeSimulations.length === 0) {
            return `
                <div class="active-sims-panel empty-sims">
                    <span class="sims-empty-text">No active virtual positions currently tracked. Click "Simulate & Track Virtual Position" above to monitor live hedged P&L in real time.</span>
                </div>
            `;
        }

        const cards = this.activeSimulations.map((sim, idx) => {
            // Calculate current live P&L
            const isBuy = sim.action === 'BUY';
            const curSpot = this.spotPrice;
            const curFut = this.futureRate;

            // Future P&L
            const futPnl = (isBuy ? (curFut - sim.entryFuture) : (sim.entryFuture - curFut)) * sim.qty;

            // Estimate option live price using simple delta
            const distFromStrike = curSpot - sim.strike;
            let estCurOptionPrem = sim.premium;
            if (isBuy) { // Put
                estCurOptionPrem = Math.max(0.5, sim.premium - (distFromStrike * 0.45));
            } else { // Call
                estCurOptionPrem = Math.max(0.5, sim.premium + (distFromStrike * 0.45));
            }
            const optionPnl = (estCurOptionPrem - sim.premium) * sim.qty;
            const netPnl = futPnl + optionPnl;

            const isProfit = netPnl >= 0;

            return `
                <div class="sim-position-card ${isProfit ? 'sim-profit' : 'sim-loss'}">
                    <div class="sim-card-header">
                        <div class="sim-title-group">
                            <span class="sim-type-badge ${isBuy ? 'buy-badge' : 'sell-badge'}">${sim.action} FUT + ${sim.hedgeType}</span>
                            <span class="sim-contract-name">${sim.contractName} @ ₹${sim.entryFuture.toFixed(2)}</span>
                        </div>
                        <button class="sim-delete-btn" data-sim-index="${idx}" title="Close & Delete Simulation">✕</button>
                    </div>

                    <div class="sim-body-grid">
                        <div class="sim-body-col">
                            <span class="sim-lbl">Hedge Strike:</span>
                            <span class="sim-val font-mono">${sim.strike} ${sim.hedgeType} (Cost: ₹${sim.premium.toFixed(2)})</span>
                        </div>
                        <div class="sim-body-col">
                            <span class="sim-lbl">Guaranteed Max Loss:</span>
                            <span class="sim-val font-mono text-down">-₹${Math.abs(sim.maxLoss).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                        </div>
                        <div class="sim-body-col">
                            <span class="sim-lbl">Future P&L:</span>
                            <span class="sim-val font-mono ${futPnl >= 0 ? 'text-up' : 'text-down'}">${futPnl >= 0 ? '+' : ''}₹${futPnl.toFixed(1)}</span>
                        </div>
                        <div class="sim-body-col">
                            <span class="sim-lbl">Net Hedged P&L:</span>
                            <span class="sim-val font-mono font-bold ${isProfit ? 'text-up highlight-green-glow' : 'text-down'}">${isProfit ? '+' : ''}₹${netPnl.toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="active-sims-panel">
                <div class="sims-header">
                    <span class="sims-title">⚡ Active Virtual Hedged Positions (${this.activeSimulations.length})</span>
                    <button id="clear-all-sims-btn" class="clear-sims-btn">Clear All</button>
                </div>
                <div class="sims-cards-grid">
                    ${cards}
                </div>
            </div>
        `;
    }

    bindModalInteractiveControls() {
        // Tab buttons
        const tabBuy = document.getElementById('tab-strat-buy');
        const tabSell = document.getElementById('tab-strat-sell');
        if (tabBuy) tabBuy.addEventListener('click', () => { this.action = 'BUY'; this.fetchStrategyData(); });
        if (tabSell) tabSell.addEventListener('click', () => { this.action = 'SELL'; this.fetchStrategyData(); });

        // Reset to live rate
        const resetLiveBtn = document.getElementById('strat-reset-live-rate');
        if (resetLiveBtn) {
            resetLiveBtn.addEventListener('click', () => {
                this.isUserOverriddenPrice = false;
                this.fetchStrategyData();
            });
        }

        // Custom Future Rate Input
        const futInput = document.getElementById('strat-future-input');
        if (futInput) {
            futInput.addEventListener('change', (e) => {
                const val = parseFloat(e.target.value);
                if (!isNaN(val) && val > 0) {
                    this.futureRate = val;
                    this.isUserOverriddenPrice = true;
                    this.fetchStrategyData();
                }
            });
        }

        // Lot size selector
        const lotSizeSel = document.getElementById('strat-lot-size');
        if (lotSizeSel) {
            lotSizeSel.addEventListener('change', (e) => {
                this.lotSize = parseInt(e.target.value) || 65;
                this.fetchStrategyData();
            });
        }

        // Lots count input
        const lotsCountInput = document.getElementById('strat-lots-count');
        if (lotsCountInput) {
            lotsCountInput.addEventListener('change', (e) => {
                this.lots = Math.max(1, parseInt(e.target.value) || 1);
                this.fetchStrategyData();
            });
        }

        // IV Input
        const ivInput = document.getElementById('strat-iv-input');
        if (ivInput) {
            ivInput.addEventListener('change', (e) => {
                const val = parseFloat(e.target.value);
                if (!isNaN(val) && val > 0) {
                    this.iv = val;
                    this.fetchStrategyData();
                }
            });
        }

        // Expiry Toggle buttons
        const expWeekly = document.getElementById('strat-exp-weekly');
        const expMonthly = document.getElementById('strat-exp-monthly');
        if (expWeekly) {
            expWeekly.addEventListener('click', () => {
                if (this.expiryType !== 'weekly') {
                    this.expiryType = 'weekly';
                    this.fetchStrategyData();
                }
            });
        }
        if (expMonthly) {
            expMonthly.addEventListener('click', () => {
                if (this.expiryType !== 'monthly') {
                    this.expiryType = 'monthly';
                    this.fetchStrategyData();
                }
            });
        }

        // Option Premium Override Input
        const premOverrideInput = document.getElementById('strat-premium-override-input');
        if (premOverrideInput) {
            premOverrideInput.addEventListener('change', (e) => {
                const val = parseFloat(e.target.value);
                const selectedItem = this.strikesData.find(s => s.strike === this.selectedStrike);
                if (!isNaN(val) && val >= 0 && selectedItem) {
                    this.customPremiumOverrides[selectedItem.strike] = val;
                    selectedItem.premium = val;
                    const qty = this.lotSize * this.lots;
                    selectedItem.totalHedgeCost = Math.round(val * qty * 100) / 100;
                    const futLoss = this.action === 'BUY' ? Math.max(0, this.futureRate - selectedItem.strike) : Math.max(0, selectedItem.strike - this.futureRate);
                    selectedItem.maxLossPerUnit = Math.round((futLoss + val) * 100) / 100;
                    selectedItem.maxLossTotal = Math.round(selectedItem.maxLossPerUnit * qty * 100) / 100;
                    selectedItem.breakeven = this.action === 'BUY' ? Math.round((this.futureRate + val) * 100) / 100 : Math.round((this.futureRate - val) * 100) / 100;
                    selectedItem.breakevenDiff = Math.round((selectedItem.breakeven - this.futureRate) * 100) / 100;
                    this.renderModal();
                }
            });
        }

        // Select Strike rows or buttons
        const rows = document.querySelectorAll('.strikes-comparison-table tbody tr');
        rows.forEach(r => {
            r.addEventListener('click', (e) => {
                const strike = parseInt(r.getAttribute('data-strike'));
                if (strike) {
                    this.selectedStrike = strike;
                    this.renderModal();
                }
            });
        });

        // Close footer button
        const closeFooterBtn = document.getElementById('strat-close-footer-btn');
        if (closeFooterBtn) {
            closeFooterBtn.addEventListener('click', () => this.closeModal());
        }

        // Simulate Trade button
        const simBtn = document.getElementById('strat-simulate-btn');
        if (simBtn) {
            simBtn.addEventListener('click', () => {
                this.addSimulatedTrade();
            });
        }

        // Delete individual simulation
        const delBtns = document.querySelectorAll('.sim-delete-btn');
        delBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.getAttribute('data-sim-index'));
                if (!isNaN(idx)) {
                    this.activeSimulations.splice(idx, 1);
                    this.saveSimulations();
                    this.renderModal();
                }
            });
        });

        // Clear all simulations
        const clearAllBtn = document.getElementById('clear-all-sims-btn');
        if (clearAllBtn) {
            clearAllBtn.addEventListener('click', () => {
                this.activeSimulations = [];
                this.saveSimulations();
                this.renderModal();
            });
        }
    }

    addSimulatedTrade() {
        const selected = this.strikesData.find(s => s.strike === this.selectedStrike);
        if (!selected) return;

        const newSim = {
            id: 'sim_' + Date.now(),
            action: this.action,
            contractName: this.contractName,
            entryFuture: this.futureRate,
            strike: selected.strike,
            hedgeType: selected.optionType,
            premium: selected.premium,
            lotSize: this.lotSize,
            lots: this.lots,
            qty: this.lotSize * this.lots,
            maxLoss: selected.maxLossTotal,
            breakeven: selected.breakeven,
            timestamp: new Date().toLocaleTimeString()
        };

        this.activeSimulations.unshift(newSim);
        this.saveSimulations();
        this.renderModal();

        if (window.showToast) {
            window.showToast(`Simulated ${this.action} NIFTY FUT + ${selected.strike} ${selected.optionType} Hedge active! Max loss capped at ₹${Math.abs(selected.maxLossTotal).toLocaleString()}`, 'success');
        }
    }

    handleLiveTick(tick) {
        if (tick && tick.symbol === '^NSEI' && tick.price) {
            this.spotPrice = tick.price;
            if (!this.isUserOverriddenPrice) {
                // Keep future rate synchronized with basis
                this.futureRate = roundToTick(tick.price + this.liveFutureBasis, 0.05);
            }

            // Update live element if modal is currently open
            const spotEl = document.getElementById('strat-spot-val');
            if (spotEl) {
                spotEl.innerText = `₹${tick.price.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
            }

            if (this.isOpen && this.activeSimulations.length > 0) {
                // Re-render to update simulated live P&L
                const activePanel = document.querySelector('.active-sims-panel');
                if (activePanel) {
                    activePanel.outerHTML = this.renderActiveSimulations();
                    // Rebind simulation delete buttons
                    const delBtns = document.querySelectorAll('.sim-delete-btn');
                    delBtns.forEach(btn => {
                        btn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            const idx = parseInt(btn.getAttribute('data-sim-index'));
                            if (!isNaN(idx)) {
                                this.activeSimulations.splice(idx, 1);
                                this.saveSimulations();
                                this.renderModal();
                            }
                        });
                    });
                }
            }
        }
    }
}

function roundToTick(val, tick = 0.05) {
    return Math.round(val / tick) * tick;
}

window.NiftyStrategyManager = NiftyStrategyManager;
