/**
 * NIFTY PRO TERMINAL - Main Application Controller
 * Connects all modules, handles user interactions, manages state and views.
 */

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initialize Core Services
    const dataService = new DataService();
    const chartEngine = new ChartEngine('main-chart-container');
    const drawingOverlay = new DrawingOverlay('drawing-canvas');
    const techSummaryPanel = new TechnicalSummaryPanel();
    const niftyStrategy = new NiftyStrategyManager();

    let currentSymbolInfo = {
        symbol: '^NSEI',
        displayName: 'NIFTY 50',
        sector: 'Index',
        type: 'Index',
        basePrice: 23960.60
    };

    let isDateRangeActive = false;

    // 2. Initialize Search Modal
    const searchModal = new SearchModal({
        onSelect: (selected) => {
            selectSymbol(selected);
        }
    });

    // 3. Connect Crosshair Move to Top HUD
    chartEngine.onCrosshairMoveCallback = (candle) => {
        updateTopHUD(candle);
    };

    // 4. Connect Live Tick Stream
    dataService.startLiveStreaming((tick) => {
        if (isDateRangeActive) return; // Don't stream live ticks if viewing a historical date range!

        chartEngine.updateLiveTick(tick);
        updateLiveHeaderPrice(tick);

        // Update active watchlist item
        updateWatchlistItemPrice(currentSymbolInfo.symbol, tick);

        // Forward live ticks to Nifty Strategy Manager
        niftyStrategy.handleLiveTick(tick);

        // Update Pro Control Deck Benchmark Live Pulse
        const sideSpotPrice = document.getElementById('sidebar-spot-price');
        const sideSpotChg = document.getElementById('sidebar-spot-chg');
        const sideFutPrice = document.getElementById('sidebar-fut-price');
        const sideFutBasis = document.getElementById('sidebar-fut-basis');

        if (sideSpotPrice && (tick.symbol === '^NSEI' || currentSymbolInfo.symbol === '^NSEI')) {
            sideSpotPrice.innerText = `₹${tick.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            if (sideSpotChg) {
                const isUp = tick.change >= 0;
                sideSpotChg.innerText = `${isUp ? '+' : ''}${tick.change.toFixed(2)} (${isUp ? '+' : ''}${tick.changePercent.toFixed(2)}%)`;
                sideSpotChg.className = `price-change-pill ${isUp ? 'pill-up' : 'pill-down'}`;
            }
            const basis = (niftyStrategy && niftyStrategy.liveFutureBasis) ? niftyStrategy.liveFutureBasis : 10.10;
            if (sideFutPrice) {
                sideFutPrice.innerText = `₹${(tick.price + basis).toFixed(2)}`;
            }
            if (sideFutBasis) {
                sideFutBasis.innerText = `+${basis.toFixed(2)} pts`;
            }
        }
    });

    // 5. Connect Market Status
    async function refreshMarketStatus() {
        const status = await dataService.fetchMarketStatus();
        if (status) {
            const statusEl = document.getElementById('market-status-pill');
            const timeEl = document.getElementById('ist-clock');
            if (statusEl) {
                if (status.isOpen) {
                    statusEl.className = 'status-pill open';
                    statusEl.innerHTML = '<span class="pulse-dot"></span> LIVE MARKET';
                } else {
                    statusEl.className = 'status-pill closed';
                    statusEl.innerHTML = '<span class="pulse-dot-amber"></span> MARKET CLOSED (09:15 - 15:30 IST)';
                }
            }
            if (timeEl && status.istTime) {
                timeEl.innerText = status.istTime;
            }
        }
    }
    refreshMarketStatus();
    setInterval(refreshMarketStatus, 15000);

    // Refresh live indices from Official NSE India Feed
    async function refreshMarketIndices() {
        const res = await dataService.fetchMarketIndices();
        if (res && res.indices) {
            res.indices.forEach(item => {
                const isUp = item.change >= 0;
                const sign = isUp ? '+' : '';
                const pctStr = `${sign}${item.changePercent.toFixed(2)}%`;
                const priceStr = item.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

                if (item.symbol === '^NSEI') {
                    const p = document.getElementById('ticker-price-nifty');
                    const c = document.getElementById('ticker-chg-nifty');
                    if (p) p.innerText = priceStr;
                    if (c) { c.innerText = pctStr; c.className = `ticker-sub font-mono ${isUp ? 'text-up' : 'text-down'}`; }
                } else if (item.symbol === '^NSEBANK') {
                    const p = document.getElementById('ticker-price-bank');
                    const c = document.getElementById('ticker-chg-bank');
                    if (p) p.innerText = priceStr;
                    if (c) { c.innerText = pctStr; c.className = `ticker-sub font-mono ${isUp ? 'text-up' : 'text-down'}`; }
                } else if (item.symbol === '^CNXIT') {
                    const p = document.getElementById('ticker-price-it');
                    const c = document.getElementById('ticker-chg-it');
                    if (p) p.innerText = priceStr;
                    if (c) { c.innerText = pctStr; c.className = `ticker-sub font-mono ${isUp ? 'text-up' : 'text-down'}`; }
                } else if (item.symbol === '^INDIAVIX') {
                    const p = document.getElementById('ticker-price-vix');
                    const c = document.getElementById('ticker-chg-vix');
                    if (p) p.innerText = priceStr;
                    if (c) { c.innerText = pctStr; c.className = `ticker-sub font-mono ${isUp ? 'text-up' : 'text-down'}`; }
                }
            });
        }
    }
    refreshMarketIndices();
    setInterval(refreshMarketIndices, 30000);

    // 6. Main Data Loading Function
    async function loadChart(params = {}) {
        showLoading(true);
        try {
            const data = await dataService.fetchChartData({
                symbol: currentSymbolInfo.symbol,
                interval: dataService.currentInterval,
                range: params.range || (isDateRangeActive ? null : dataService.currentRange),
                date: params.date !== undefined ? params.date : dataService.currentDate,
                from: params.from !== undefined ? params.from : (dataService.customRange ? dataService.customRange.from : null),
                to: params.to !== undefined ? params.to : (dataService.customRange ? dataService.customRange.to : null)
            });

            if (data && data.candles) {
                chartEngine.setData(data.candles, data, !!params.clearDrawings);
                techSummaryPanel.render(data.candles, data);
                updateSymbolHeader(data);
                updateHistoricalSessionBanner(data);
                updateDataSourceBadge(data);

                // Clear drawings when symbol changes
                if (params.clearDrawings) {
                    drawingOverlay.clear();
                }
            }
        } catch (err) {
            console.error("Failed to load chart:", err);
            showNotification("Failed to fetch chart data. Using simulation fallback.", "warning");
        } finally {
            showLoading(false);
        }
    }

    // 7. Symbol Selection Handler
    async function selectSymbol(sym) {
        currentSymbolInfo = sym;
        dataService.currentSymbol = sym.symbol;
        dataService.currentDisplayName = sym.displayName;

        // Reset historical date range back to live session on symbol change
        isDateRangeActive = false;
        dataService.currentDate = null;
        dataService.customRange = null;
        resetDateInputs();

        // Update UI headers
        const dispEl = document.getElementById('active-symbol-display');
        const nameEl = document.getElementById('active-symbol-fullname');
        const badgeEl = document.getElementById('active-symbol-sector');
        if (dispEl) dispEl.innerText = sym.displayName;
        if (nameEl) nameEl.innerText = sym.name || sym.displayName;
        if (badgeEl) {
            badgeEl.innerText = sym.sector || sym.type;
            badgeEl.className = `sector-pill ${sym.type === 'Index' ? 'badge-index' : 'badge-equity'}`;
        }

        // Highlight in watchlist if present
        highlightWatchlistItem(sym.symbol);

        await loadChart({ clearDrawings: true });
    }

    // 8. Update Top HUD on Crosshair Move
    function updateTopHUD(candle) {
        if (!candle) return;
        const dateEl = document.getElementById('hud-date');
        const timeEl = document.getElementById('hud-time');
        const oEl = document.getElementById('hud-o');
        const hEl = document.getElementById('hud-h');
        const lEl = document.getElementById('hud-l');
        const cEl = document.getElementById('hud-c');
        const chgEl = document.getElementById('hud-chg');
        const volEl = document.getElementById('hud-vol');
        const vwapEl = document.getElementById('hud-vwap');
        const stEl = document.getElementById('hud-supertrend');
        const pivotsEl = document.getElementById('hud-pivots');

        // 1. Precise Date and Time in Indian Standard Time (IST)
        if (candle && candle.time) {
            let dayStr = '--', timeStr = '--:-- IST';

            if (typeof candle.time === 'number') {
                const d = new Date(candle.time * 1000);
                dayStr = d.toLocaleDateString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric'
                });

                if (dataService.currentInterval === '1d' || dataService.currentInterval === '1wk') {
                    timeStr = 'Daily (EOD)';
                } else {
                    timeStr = d.toLocaleTimeString('en-IN', {
                        timeZone: 'Asia/Kolkata',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                    }) + ' IST';
                }
            } else if (typeof candle.time === 'string') {
                const parts = candle.time.split('-');
                if (parts.length === 3) {
                    const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                    dayStr = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
                } else {
                    dayStr = candle.time;
                }
                timeStr = 'Daily (EOD)';
            } else if (candle.time && candle.time.year) {
                const d = new Date(candle.time.year, candle.time.month - 1, candle.time.day || 1);
                dayStr = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
                timeStr = 'Daily (EOD)';
            }

            if (dateEl) dateEl.innerText = dayStr;
            if (timeEl) timeEl.innerText = timeStr;
        }

        const chg = candle.close - candle.open;
        const pct = candle.open ? ((chg / candle.open) * 100).toFixed(2) : '0.00';
        const isUp = chg >= 0;

        if (oEl) oEl.innerText = candle.open.toFixed(2);
        if (hEl) hEl.innerText = candle.high.toFixed(2);
        if (lEl) lEl.innerText = candle.low.toFixed(2);
        if (cEl) {
            cEl.innerText = candle.close.toFixed(2);
            cEl.className = isUp ? 'text-up' : 'text-down';
        }
        if (chgEl) {
            chgEl.innerText = `${isUp ? '+' : ''}${chg.toFixed(2)} (${isUp ? '+' : ''}${pct}%)`;
            chgEl.className = isUp ? 'text-up' : 'text-down';
        }
        if (volEl) {
            volEl.innerText = formatVolume(candle.volume);
        }

        // 2. Live VWAP HUD value
        if (vwapEl && chartEngine.currentCandles.length > 0) {
            const vwapData = Indicators.calculateVWAP(chartEngine.currentCandles);
            if (vwapData.length > 0) {
                const foundVWAP = candle.time ? vwapData.find(v => v.time === candle.time) : null;
                const vwapVal = foundVWAP ? foundVWAP.value : vwapData[vwapData.length - 1].value;
                vwapEl.innerText = `₹${vwapVal.toFixed(2)}`;
                vwapEl.style.color = candle.close >= vwapVal ? 'var(--color-up)' : 'var(--color-down)';
            }
        }

        // 3. Live Supertrend (10, 3) HUD value
        if (stEl && chartEngine.currentSupertrend) {
            const st = chartEngine.currentSupertrend;
            const isSTUp = st.direction === 'UP';
            stEl.innerText = `₹${st.value.toFixed(2)} (${isSTUp ? 'BUY' : 'SELL'})`;
            stEl.className = isSTUp ? 'text-up' : 'text-down';
        }

        // 4. Key Pivot Points (P, R1, S1, R2, S2) HUD values
        if (pivotsEl && chartEngine.currentPivots) {
            const p = chartEngine.currentPivots;
            pivotsEl.innerText = `P: ${p.pivot} | R1: ${p.r1} | S1: ${p.s1} | R2: ${p.r2} | S2: ${p.s2}`;
        }

        // 5. Live Apex Quantum Matrix™ HUD value
        const apexEl = document.getElementById('hud-apex');
        if (apexEl && chartEngine.currentApex) {
            const ap = chartEngine.currentApex;
            const isBuy = ap.regime.includes('BULLISH');
            let txt = `${ap.regime} (CMI: ${ap.cmi})`;
            if (ap.isSqueeze) txt += ' [SQZ]';
            apexEl.innerText = txt;
            apexEl.className = isBuy ? 'text-up' : 'text-down';
        }
    }

    function updateSymbolHeader(data) {
        const priceEl = document.getElementById('header-live-price');
        const chgEl = document.getElementById('header-live-change');
        if (!priceEl) return;

        const price = data.regularMarketPrice || data.candles[data.candles.length - 1].close;
        const chg = data.change || (price - (data.previousClose || price));
        const pct = data.changePercent || ((chg / (data.previousClose || price)) * 100);
        const isUp = chg >= 0;

        priceEl.innerText = `₹${price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        if (chgEl) {
            chgEl.innerText = `${isUp ? '+' : ''}${chg.toFixed(2)} (${isUp ? '+' : ''}${pct.toFixed(2)}%)`;
            chgEl.className = `price-change-pill ${isUp ? 'pill-up' : 'pill-down'}`;
        }

        // Also update Sidebar Live Pulse on chart load
        const sideSpot = document.getElementById('sidebar-spot-price');
        const sideChg = document.getElementById('sidebar-spot-chg');
        const sideFut = document.getElementById('sidebar-fut-price');
        const sideBasis = document.getElementById('sidebar-fut-basis');
        if (sideSpot && (data.symbol === '^NSEI' || !data.symbol)) {
            sideSpot.innerText = `₹${price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            if (sideChg) {
                sideChg.innerText = `${isUp ? '+' : ''}${chg.toFixed(2)} (${isUp ? '+' : ''}${pct.toFixed(2)}%)`;
                sideChg.className = `price-change-pill ${isUp ? 'pill-up' : 'pill-down'}`;
            }
            const b = (niftyStrategy && niftyStrategy.liveFutureBasis) ? niftyStrategy.liveFutureBasis : 10.10;
            if (sideFut) sideFut.innerText = `₹${(price + b).toFixed(2)}`;
            if (sideBasis) sideBasis.innerText = `+${b.toFixed(2)} pts`;
        }
    }

    function updateLiveHeaderPrice(tick) {
        const priceEl = document.getElementById('header-live-price');
        const chgEl = document.getElementById('header-live-change');
        if (!priceEl) return;

        priceEl.innerText = `₹${tick.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        // Micro-flash ONLY if market is open and active
        priceEl.classList.remove('flash-green', 'flash-red');
        if (tick.tickDirection !== 'flat' && !tick.isMarketClosed) {
            void priceEl.offsetWidth; // trigger reflow
            priceEl.classList.add(tick.tickDirection === 'up' ? 'flash-green' : 'flash-red');
        }

        if (chgEl) {
            const isUp = tick.change >= 0;
            chgEl.innerText = `${isUp ? '+' : ''}${tick.change.toFixed(2)} (${isUp ? '+' : ''}${tick.changePercent.toFixed(2)}%)`;
            chgEl.className = `price-change-pill ${isUp ? 'pill-up' : 'pill-down'}`;
        }
    }

    function updateDataSourceBadge(data) {
        const badge = document.getElementById('data-source-pill');
        const label = document.getElementById('data-source-label');
        if (!badge || !label) return;

        if (data && data.isSimulated) {
            badge.className = 'data-source-pill sim-mode';
            badge.title = 'Synthetic fallback candles generated for offline or testing mode';
            label.innerText = 'Simulation Mode';
        } else {
            badge.className = 'data-source-pill live-mode';
            badge.title = data && data.dataSource ? data.dataSource : 'Connected to Official NSE India Feed (nseindia.com)';
            label.innerText = data && data.dataSource ? data.dataSource : 'NSE Official Feed';
        }
    }

    // 9. Timeframe Selector Buttons
    const tfButtons = document.querySelectorAll('.tf-btn');
    tfButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            tfButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const interval = btn.dataset.interval;
            dataService.currentInterval = interval;

            // If timeframe is daily or weekly, set range to 1y
            if (interval === '1d' || interval === '1D') {
                dataService.currentRange = '1y';
            } else if (interval === '1wk') {
                dataService.currentRange = '2y';
            } else {
                if (!isDateRangeActive) dataService.currentRange = '1d';
            }

            loadChart();
        });
    });

    // 10. Date, Old Intraday & Custom Range Controls
    const todayStr = new Date().toISOString().split('T')[0];

    // Helper: Compute previous or next trading day (skipping Sat & Sun)
    function getTradingDayOffset(baseDateStr, offset) {
        if (!baseDateStr) baseDateStr = todayStr;
        const parts = baseDateStr.split('-');
        let d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        
        let step = offset > 0 ? 1 : -1;
        let count = Math.abs(offset);
        while (count > 0) {
            d.setDate(d.getDate() + step);
            const dayOfWeek = d.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) { // skip Sun & Sat
                count--;
            }
        }
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    // Helper: Format date for elegant display (e.g. Wednesday, 10 Apr 2024)
    function formatDateDisplay(dateStr) {
        if (!dateStr) return '--';
        try {
            const parts = dateStr.split('-');
            const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
            return d.toLocaleDateString('en-IN', {
                weekday: 'short',
                day: '2-digit',
                month: 'short',
                year: 'numeric'
            });
        } catch (e) {
            return dateStr;
        }
    }

    function setActiveTfButton(interval) {
        tfButtons.forEach(b => {
            if (b.dataset.interval.toLowerCase() === interval.toLowerCase()) {
                b.classList.add('active');
            } else {
                b.classList.remove('active');
            }
        });
    }

    function resetDateInputs() {
        const singleDatePicker = document.getElementById('single-date-picker');
        const toolbarSingleDate = document.getElementById('toolbar-single-date');
        const bannerDatePicker = document.getElementById('banner-date-picker');
        const sideSingleDate = document.getElementById('sidebar-single-date');
        if (singleDatePicker) singleDatePicker.value = todayStr;
        if (toolbarSingleDate) toolbarSingleDate.value = todayStr;
        if (bannerDatePicker) bannerDatePicker.value = todayStr;
        if (sideSingleDate) sideSingleDate.value = todayStr;
    }

    // Update the Historical Session Navigator Banner above the chart
    function updateHistoricalSessionBanner(data) {
        const banner = document.getElementById('historical-session-banner');
        if (!banner) return;

        const badgeType = document.getElementById('session-badge-type');
        const bannerInfo = document.getElementById('session-banner-info');
        const bannerNav = document.getElementById('session-banner-nav');
        const bannerPicker = document.getElementById('banner-date-picker');

        if (isDateRangeActive) {
            banner.style.display = 'flex';

            if (dataService.currentDate) {
                if (badgeType) badgeType.innerText = 'HISTORICAL INTRADAY';
                const candleCount = data && data.candles ? data.candles.length : 75;
                if (bannerInfo) {
                    bannerInfo.innerHTML = `<b>${formatDateDisplay(dataService.currentDate)}</b> • ${candleCount} Candles (${dataService.currentInterval}) • Full 09:15 - 15:30 IST Session`;
                }
                if (bannerNav) bannerNav.style.display = 'flex';
                if (bannerPicker) bannerPicker.value = dataService.currentDate;

                // Sync inputs
                const tInput = document.getElementById('toolbar-single-date');
                const sInput = document.getElementById('single-date-picker');
                if (tInput) tInput.value = dataService.currentDate;
                if (sInput) sInput.value = dataService.currentDate;
            } else if (dataService.customRange) {
                if (badgeType) badgeType.innerText = 'CUSTOM DATE RANGE';
                const candleCount = data && data.candles ? data.candles.length : '';
                if (bannerInfo) {
                    bannerInfo.innerHTML = `<b>${dataService.customRange.from}</b> to <b>${dataService.customRange.to}</b> • ${candleCount} Candles (${dataService.currentInterval})`;
                }
                if (bannerNav) bannerNav.style.display = 'none';
            } else {
                if (badgeType) badgeType.innerText = 'HISTORICAL RANGE';
                if (bannerInfo) {
                    bannerInfo.innerHTML = `Historical Preset: <b>${(dataService.currentRange || '').toUpperCase()}</b> (${dataService.currentInterval})`;
                }
                if (bannerNav) bannerNav.style.display = 'none';
            }
        } else {
            banner.style.display = 'none';
        }
    }

    // Central function to load an Old Intraday session for any single date
    async function loadSingleDateIntraday(selectedDate, interval = null) {
        if (!selectedDate) {
            showNotification("Please select a date", "warning");
            return;
        }

        // Close any open popover
        if (customDatePanel) customDatePanel.style.display = 'none';

        isDateRangeActive = true;
        dataService.currentDate = selectedDate;
        dataService.customRange = null;

        // Deselect quick range buttons
        rangeButtons.forEach(b => b.classList.remove('active'));

        const tf = interval || dataService.currentInterval || '5m';
        dataService.currentInterval = (tf === '1d' || tf === '1wk') ? '5m' : tf;
        setActiveTfButton(dataService.currentInterval);

        // Sync inputs
        const tInput = document.getElementById('toolbar-single-date');
        const sInput = document.getElementById('single-date-picker');
        const bInput = document.getElementById('banner-date-picker');
        if (tInput) tInput.value = selectedDate;
        if (sInput) sInput.value = selectedDate;
        if (bInput) bInput.value = selectedDate;

        showNotification(`Loading full intraday session for ${formatDateDisplay(selectedDate)}...`, "info");
        await loadChart({ date: selectedDate });
    }

    // Central function to load a custom date range
    async function loadDateRange(from, to, interval = null) {
        if (!from || !to) {
            showNotification("Please select both From and To dates", "warning");
            return;
        }
        if (new Date(from) > new Date(to)) {
            showNotification("From date must be earlier than To date", "warning");
            return;
        }

        if (customDatePanel) customDatePanel.style.display = 'none';

        isDateRangeActive = true;
        dataService.customRange = { from, to };
        dataService.currentDate = null;
        rangeButtons.forEach(b => b.classList.remove('active'));

        const tf = interval || (new Date(to) - new Date(from) > 7 * 86400000 ? '1d' : '15m');
        dataService.currentInterval = tf;
        setActiveTfButton(tf);

        showNotification(`Loading historical range ${from} to ${to} on full scale...`, "info");
        await loadChart({ from, to });
    }

    // Central function to restore live today session
    async function returnToLive() {
        isDateRangeActive = false;
        dataService.currentDate = null;
        dataService.customRange = null;
        resetDateInputs();

        dataService.currentInterval = '5m';
        dataService.currentRange = '1d';
        setActiveTfButton('5m');

        rangeButtons.forEach(b => {
            if (b.dataset.range === '1d') b.classList.add('active');
            else b.classList.remove('active');
        });

        const banner = document.getElementById('historical-session-banner');
        if (banner) banner.style.display = 'none';

        showNotification("Restored to Live Today Intraday Market", "success");
        await loadChart({ range: '1d' });
    }

    // Initialize date pickers max attribute to today
    const singleDatePicker = document.getElementById('single-date-picker');
    const toolbarSingleDate = document.getElementById('toolbar-single-date');
    const bannerDatePicker = document.getElementById('banner-date-picker');
    const dateFromInput = document.getElementById('date-range-from');
    const dateToInput = document.getElementById('date-range-to');

    [singleDatePicker, toolbarSingleDate, bannerDatePicker, dateFromInput, dateToInput].forEach(inp => {
        if (inp) {
            inp.max = todayStr;
            if (!inp.value) inp.value = todayStr;
        }
    });

    if (dateFromInput && dateToInput) {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        dateFromInput.value = d.toISOString().split('T')[0];
        dateToInput.value = todayStr;
    }

    // 1. Direct Inline Toolbar Date Picker & Go Button
    const toolbarGoDateBtn = document.getElementById('toolbar-go-date-btn');
    if (toolbarGoDateBtn && toolbarSingleDate) {
        toolbarGoDateBtn.addEventListener('click', () => {
            loadSingleDateIntraday(toolbarSingleDate.value);
        });
        toolbarSingleDate.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                loadSingleDateIntraday(toolbarSingleDate.value);
            }
        });
    }

    // 2. Quick Range Buttons (Today, Yesterday, 5D, 1M, 3M, 6M, 1Y, ALL)
    const rangeButtons = document.querySelectorAll('.range-btn');
    rangeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            rangeButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const r = btn.dataset.range;
            if (r === 'yesterday') {
                const prev = getTradingDayOffset(todayStr, -1);
                loadSingleDateIntraday(prev);
                return;
            }

            isDateRangeActive = (r !== '1d');
            resetDateInputs();
            dataService.currentDate = null;
            dataService.customRange = null;

            if (r === '1d') {
                returnToLive();
                return;
            } else if (r === '5d') {
                dataService.currentInterval = '15m';
                dataService.currentRange = '5d';
                setActiveTfButton('15m');
            } else if (r === '1mo') {
                dataService.currentInterval = '60m';
                dataService.currentRange = '1mo';
                setActiveTfButton('1h');
            } else {
                dataService.currentInterval = '1d';
                dataService.currentRange = r;
                setActiveTfButton('1D');
            }

            loadChart({ range: dataService.currentRange });
        });
    });

    // 3. Tab Navigation in Date Popover Modal
    const dateTabButtons = document.querySelectorAll('.date-tab-btn');
    const tabSingleDate = document.getElementById('tab-single-date');
    const tabDateRange = document.getElementById('tab-date-range');

    dateTabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            dateTabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const targetTab = btn.dataset.tab;

            if (targetTab === 'single-date') {
                if (tabSingleDate) tabSingleDate.style.display = 'flex';
                if (tabDateRange) tabDateRange.style.display = 'none';
            } else {
                if (tabSingleDate) tabSingleDate.style.display = 'none';
                if (tabDateRange) tabDateRange.style.display = 'flex';
            }
        });
    });

    // Timeframe choice chips inside popover
    let selectedIntradayTf = '5m';
    const intradayTfChips = document.querySelectorAll('#intraday-tf-choice .chip-tf-btn');
    intradayTfChips.forEach(btn => {
        btn.addEventListener('click', () => {
            intradayTfChips.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedIntradayTf = btn.dataset.tf;
        });
    });

    let selectedRangeTf = '1d';
    const rangeTfChips = document.querySelectorAll('#range-tf-choice .chip-tf-btn');
    rangeTfChips.forEach(btn => {
        btn.addEventListener('click', () => {
            rangeTfChips.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedRangeTf = btn.dataset.tf;
        });
    });

    // 4. Quick Date Preset Chips in Modal
    const chipYesterday = document.getElementById('chip-yesterday');
    if (chipYesterday) {
        chipYesterday.addEventListener('click', () => {
            const date = getTradingDayOffset(todayStr, -1);
            if (singleDatePicker) singleDatePicker.value = date;
            loadSingleDateIntraday(date, selectedIntradayTf);
        });
    }

    const chip2Days = document.getElementById('chip-2days');
    if (chip2Days) {
        chip2Days.addEventListener('click', () => {
            const date = getTradingDayOffset(todayStr, -2);
            if (singleDatePicker) singleDatePicker.value = date;
            loadSingleDateIntraday(date, selectedIntradayTf);
        });
    }

    const chipLastThu = document.getElementById('chip-last-thu');
    if (chipLastThu) {
        chipLastThu.addEventListener('click', () => {
            let d = new Date();
            d.setDate(d.getDate() - 1);
            while (d.getDay() !== 4) { // 4 is Thursday
                d.setDate(d.getDate() - 1);
            }
            const date = d.toISOString().split('T')[0];
            if (singleDatePicker) singleDatePicker.value = date;
            loadSingleDateIntraday(date, selectedIntradayTf);
        });
    }

    const chipLastFri = document.getElementById('chip-last-fri');
    if (chipLastFri) {
        chipLastFri.addEventListener('click', () => {
            let d = new Date();
            d.setDate(d.getDate() - 1);
            while (d.getDay() !== 5) { // 5 is Friday
                d.setDate(d.getDate() - 1);
            }
            const date = d.toISOString().split('T')[0];
            if (singleDatePicker) singleDatePicker.value = date;
            loadSingleDateIntraday(date, selectedIntradayTf);
        });
    }

    const chip1Week = document.getElementById('chip-1week');
    if (chip1Week) {
        chip1Week.addEventListener('click', () => {
            const date = getTradingDayOffset(todayStr, -5);
            if (singleDatePicker) singleDatePicker.value = date;
            loadSingleDateIntraday(date, selectedIntradayTf);
        });
    }

    // 5. Quick Range Preset Chips in Modal
    function setAndApplyRange(daysAgo, defaultTf = '1d') {
        const d = new Date();
        d.setDate(d.getDate() - daysAgo);
        const from = d.toISOString().split('T')[0];
        const to = todayStr;
        if (dateFromInput) dateFromInput.value = from;
        if (dateToInput) dateToInput.value = to;
        loadDateRange(from, to, defaultTf);
    }

    const chipRange5d = document.getElementById('chip-range-5d');
    if (chipRange5d) chipRange5d.addEventListener('click', () => setAndApplyRange(5, '15m'));
    const chipRange15d = document.getElementById('chip-range-15d');
    if (chipRange15d) chipRange15d.addEventListener('click', () => setAndApplyRange(15, '60m'));
    const chipRange1m = document.getElementById('chip-range-1m');
    if (chipRange1m) chipRange1m.addEventListener('click', () => setAndApplyRange(30, '1d'));
    const chipRange3m = document.getElementById('chip-range-3m');
    if (chipRange3m) chipRange3m.addEventListener('click', () => setAndApplyRange(90, '1d'));
    const chipRange6m = document.getElementById('chip-range-6m');
    if (chipRange6m) chipRange6m.addEventListener('click', () => setAndApplyRange(180, '1d'));
    const chipRange1y = document.getElementById('chip-range-1y');
    if (chipRange1y) chipRange1y.addEventListener('click', () => setAndApplyRange(365, '1d'));
    const chipRangeYtd = document.getElementById('chip-range-ytd');
    if (chipRangeYtd) {
        chipRangeYtd.addEventListener('click', () => {
            const ytdFrom = `${new Date().getFullYear()}-01-01`;
            if (dateFromInput) dateFromInput.value = ytdFrom;
            if (dateToInput) dateToInput.value = todayStr;
            loadDateRange(ytdFrom, todayStr, '1d');
        });
    }

    // 6. Modal Apply Buttons
    const singleDateBtn = document.getElementById('apply-single-date-btn');
    if (singleDateBtn && singleDatePicker) {
        singleDateBtn.addEventListener('click', () => {
            loadSingleDateIntraday(singleDatePicker.value, selectedIntradayTf);
        });
    }

    const applyRangeBtn = document.getElementById('apply-range-btn');
    if (applyRangeBtn && dateFromInput && dateToInput) {
        applyRangeBtn.addEventListener('click', () => {
            loadDateRange(dateFromInput.value, dateToInput.value, selectedRangeTf);
        });
    }

    // 7. Reset Live Button
    const resetLiveBtn = document.getElementById('reset-live-btn');
    if (resetLiveBtn) {
        resetLiveBtn.addEventListener('click', () => {
            returnToLive();
        });
    }

    // 8. Historical Session Navigator Banner Controls
    const bannerPrevBtn = document.getElementById('banner-prev-day-btn');
    if (bannerPrevBtn) {
        bannerPrevBtn.addEventListener('click', () => {
            const cur = dataService.currentDate || todayStr;
            const prev = getTradingDayOffset(cur, -1);
            loadSingleDateIntraday(prev);
        });
    }

    const bannerNextBtn = document.getElementById('banner-next-day-btn');
    if (bannerNextBtn) {
        bannerNextBtn.addEventListener('click', () => {
            const cur = dataService.currentDate || todayStr;
            const next = getTradingDayOffset(cur, 1);
            if (next >= todayStr) {
                returnToLive();
            } else {
                loadSingleDateIntraday(next);
            }
        });
    }

    if (bannerDatePicker) {
        bannerDatePicker.addEventListener('change', (e) => {
            loadSingleDateIntraday(e.target.value);
        });
    }

    const bannerLiveBtn = document.getElementById('banner-live-btn');
    if (bannerLiveBtn) {
        bannerLiveBtn.addEventListener('click', () => {
            returnToLive();
        });
    }

    // 9. Floating Popovers & Header Button Trigger
    const customDateTrigger = document.getElementById('custom-date-trigger-btn');
    const headerDateBtn = document.getElementById('header-date-btn');
    const customDatePanel = document.getElementById('custom-date-panel');
    const closeCustomDateBtn = document.getElementById('close-custom-date-panel-btn');

    function toggleCustomDatePanel(e) {
        if (e) e.stopPropagation();
        if (!customDatePanel) return;
        const isOpen = customDatePanel.style.display === 'flex' || customDatePanel.style.display === 'block';
        customDatePanel.style.display = isOpen ? 'none' : 'flex';
        if (indMenuPanel) indMenuPanel.style.display = 'none';
    }

    if (customDateTrigger) customDateTrigger.addEventListener('click', toggleCustomDatePanel);
    if (headerDateBtn) headerDateBtn.addEventListener('click', toggleCustomDatePanel);
    if (closeCustomDateBtn) {
        closeCustomDateBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (customDatePanel) customDatePanel.style.display = 'none';
        });
    }

    // Keyboard Shortcut 'D' to open date modal
    document.addEventListener('keydown', (e) => {
        const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
        if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;
        if (e.key === 'd' || e.key === 'D') {
            e.preventDefault();
            toggleCustomDatePanel();
        }
    });

    // 11. Chart Type Selector (Candlestick, Hollow, Line)
    const chartTypeSelector = document.getElementById('chart-type-selector');
    if (chartTypeSelector) {
        chartTypeSelector.addEventListener('change', (e) => {
            chartEngine.setChartType(e.target.value);
        });
    }

    // Indicators Dropdown Menu Triggers
    const indMenuTrigger = document.getElementById('indicators-dropdown-trigger');
    const indMenuPanel = document.getElementById('indicators-dropdown-panel');
    const closeIndPopupBtn = document.getElementById('close-ind-popup-btn');

    if (indMenuTrigger && indMenuPanel) {
        indMenuTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = indMenuPanel.style.display === 'block';
            indMenuPanel.style.display = isOpen ? 'none' : 'block';
            if (customDatePanel) customDatePanel.style.display = 'none';
        });

        if (closeIndPopupBtn) {
            closeIndPopupBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                indMenuPanel.style.display = 'none';
            });
        }
    }

    // Close floating popovers when clicking outside
    document.addEventListener('click', (e) => {
        if (indMenuPanel && !indMenuPanel.contains(e.target) && e.target !== indMenuTrigger) {
            indMenuPanel.style.display = 'none';
        }
        if (customDatePanel && !customDatePanel.contains(e.target) && e.target !== customDateTrigger && e.target !== headerDateBtn) {
            customDatePanel.style.display = 'none';
        }
    });

    // 12. Technical Indicator Toggles (Synchronized across Quick Chips and Popover Menu)
    function updateActiveIndCounter() {
        const count = Object.values(chartEngine.activeIndicators).filter(Boolean).length;
        const badge = document.getElementById('ind-active-count-badge');
        if (badge) badge.innerText = count;
        const sideBadge = document.getElementById('sidebar-ind-active-count');
        if (sideBadge) sideBadge.innerText = `${count} Active`;
    }
    updateActiveIndCounter();

    const indToggles = document.querySelectorAll('.ind-toggle-btn');
    indToggles.forEach(btn => {
        btn.addEventListener('click', () => {
            const indName = btn.dataset.indicator;
            const isActive = chartEngine.toggleIndicator(indName);

            // Synchronize all buttons & menu items for this indicator
            document.querySelectorAll(`.ind-toggle-btn[data-indicator="${indName}"]`).forEach(el => {
                if (isActive) {
                    el.classList.add('active');
                } else {
                    el.classList.remove('active');
                }
            });

            updateActiveIndCounter();

            // Sync HUD visibility
            if (indName === 'supertrend') {
                const el = document.getElementById('hud-supertrend');
                if (el && el.parentElement) el.parentElement.style.display = isActive ? 'inline-block' : 'none';
            } else if (indName === 'pivots') {
                const el = document.getElementById('hud-pivots');
                if (el && el.parentElement) el.parentElement.style.display = isActive ? 'inline-block' : 'none';
            } else if (indName === 'vwap') {
                const el = document.getElementById('hud-vwap');
                if (el && el.parentElement) el.parentElement.style.display = isActive ? 'inline-block' : 'none';
            } else if (indName === 'apex') {
                const el = document.getElementById('hud-apex');
                if (el && el.parentElement) el.parentElement.style.display = isActive ? 'inline-block' : 'none';
            }
        });
    });

    // 13. Drawing Tools
    const drawingToolButtons = document.querySelectorAll('.drawing-tool-btn');
    drawingToolButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tool = btn.dataset.tool;
            if (tool === 'clear') {
                drawingOverlay.clear();
                showNotification("All drawings cleared", "info");
                return;
            }
            if (tool === 'undo') {
                drawingOverlay.undo();
                return;
            }

            drawingToolButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            drawingOverlay.setTool(tool);
        });
    });

    // 14. Scale & Fullscreen Controls
    const fitScaleBtn = document.getElementById('fit-scale-btn');
    if (fitScaleBtn) {
        fitScaleBtn.addEventListener('click', () => {
            chartEngine.fitScale();
            showNotification("Full Chart Scale Fitted", "info");
        });
    }

    const fullscreenBtn = document.getElementById('fullscreen-btn');
    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', () => {
            chartEngine.toggleFullScreen();
        });
    }

    const exportBtn = document.getElementById('export-chart-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            chartEngine.exportChartImage();
            showNotification("Chart exported as image", "success");
        });
    }

    // 15. Sidebar Toggle Controls
    const toggleWatchlistBtn = document.getElementById('toggle-watchlist-btn');
    const watchlistSidebar = document.getElementById('watchlist-sidebar');
    if (toggleWatchlistBtn && watchlistSidebar) {
        toggleWatchlistBtn.addEventListener('click', () => {
            watchlistSidebar.classList.toggle('collapsed');
            setTimeout(() => chartEngine.resize(), 200);
        });
    }

    const toggleTechPanelBtn = document.getElementById('toggle-tech-panel-btn');
    const techPanel = document.getElementById('tech-study-panel');
    if (toggleTechPanelBtn && techPanel) {
        toggleTechPanelBtn.addEventListener('click', () => {
            techPanel.classList.toggle('collapsed');
            setTimeout(() => chartEngine.resize(), 200);
        });
    }

    // 16. Pro Control Deck (Sidebar) Wiring
    function getPastDateStr(daysAgo) {
        const d = new Date();
        d.setDate(d.getDate() - daysAgo);
        return d.toISOString().split('T')[0];
    }

    function getLastDayOfWeek(targetDay) {
        let d = new Date();
        d.setDate(d.getDate() - 1);
        while (d.getDay() !== targetDay) {
            d.setDate(d.getDate() - 1);
        }
        return d.toISOString().split('T')[0];
    }

    function initProControlDeck() {
        // 1. Nifty Strategy Sidebar Buttons
        const sideStratBuy = document.getElementById('sidebar-strat-buy-btn');
        const sideStratSell = document.getElementById('sidebar-strat-sell-btn');
        const sideStratModal = document.getElementById('sidebar-open-strategy-modal');

        if (sideStratBuy) sideStratBuy.addEventListener('click', () => niftyStrategy.openModal('BUY'));
        if (sideStratSell) sideStratSell.addEventListener('click', () => niftyStrategy.openModal('SELL'));
        if (sideStratModal) sideStratModal.addEventListener('click', () => niftyStrategy.openModal('BUY'));

        // 2. Old Intraday Date Controls in Sidebar
        const sideSingleDateInput = document.getElementById('sidebar-single-date');
        if (sideSingleDateInput) sideSingleDateInput.value = todayStr;

        let sideSelectedIntradayTf = '5m';
        const sideTfChips = document.querySelectorAll('#sidebar-intraday-tf-chips .deck-tf-btn');
        sideTfChips.forEach(chip => {
            chip.addEventListener('click', () => {
                sideTfChips.forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                sideSelectedIntradayTf = chip.dataset.tf;
            });
        });

        // Quick presets
        const chipYest = document.getElementById('sidebar-chip-yesterday');
        if (chipYest) chipYest.addEventListener('click', () => {
            const dt = getTradingDayOffset(todayStr, -1);
            if (sideSingleDateInput) sideSingleDateInput.value = dt;
            loadSingleDateIntraday(dt, sideSelectedIntradayTf);
        });

        const chip2d = document.getElementById('sidebar-chip-2days');
        if (chip2d) chip2d.addEventListener('click', () => {
            const dt = getTradingDayOffset(todayStr, -2);
            if (sideSingleDateInput) sideSingleDateInput.value = dt;
            loadSingleDateIntraday(dt, sideSelectedIntradayTf);
        });

        const chipThu = document.getElementById('sidebar-chip-last-thu');
        if (chipThu) chipThu.addEventListener('click', () => {
            const dt = getLastDayOfWeek(4);
            if (sideSingleDateInput) sideSingleDateInput.value = dt;
            loadSingleDateIntraday(dt, sideSelectedIntradayTf);
        });

        const chipFri = document.getElementById('sidebar-chip-last-fri');
        if (chipFri) chipFri.addEventListener('click', () => {
            const dt = getLastDayOfWeek(5);
            if (sideSingleDateInput) sideSingleDateInput.value = dt;
            loadSingleDateIntraday(dt, sideSelectedIntradayTf);
        });

        const chip1w = document.getElementById('sidebar-chip-1week');
        if (chip1w) chip1w.addEventListener('click', () => {
            const dt = getTradingDayOffset(todayStr, -5);
            if (sideSingleDateInput) sideSingleDateInput.value = dt;
            loadSingleDateIntraday(dt, sideSelectedIntradayTf);
        });

        const sideApplyIntraday = document.getElementById('sidebar-apply-intraday-btn');
        if (sideApplyIntraday) {
            sideApplyIntraday.addEventListener('click', () => {
                const dt = sideSingleDateInput ? sideSingleDateInput.value : todayStr;
                loadSingleDateIntraday(dt, sideSelectedIntradayTf);
            });
        }

        const sideResetLive = document.getElementById('sidebar-reset-live-btn');
        if (sideResetLive) {
            sideResetLive.addEventListener('click', () => returnToLive());
        }

        // 3. Date Range Controls in Sidebar
        const sideDateFrom = document.getElementById('sidebar-date-from');
        const sideDateTo = document.getElementById('sidebar-date-to');
        if (sideDateFrom) sideDateFrom.value = getPastDateStr(30);
        if (sideDateTo) sideDateTo.value = todayStr;

        let sideSelectedRangeTf = '1d';
        const sideRangeTfChips = document.querySelectorAll('#sidebar-range-tf-chips .deck-tf-btn');
        sideRangeTfChips.forEach(chip => {
            chip.addEventListener('click', () => {
                sideRangeTfChips.forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                sideSelectedRangeTf = chip.dataset.tf;
            });
        });

        function sideSetAndApplyRange(days, tf) {
            const from = getPastDateStr(days);
            if (sideDateFrom) sideDateFrom.value = from;
            if (sideDateTo) sideDateTo.value = todayStr;
            sideRangeTfChips.forEach(c => {
                c.classList.toggle('active', c.dataset.tf === tf);
            });
            sideSelectedRangeTf = tf;
            loadDateRange(from, todayStr, tf);
        }

        const sideR5d = document.getElementById('sidebar-chip-range-5d');
        if (sideR5d) sideR5d.addEventListener('click', () => sideSetAndApplyRange(5, '15m'));
        const sideR15d = document.getElementById('sidebar-chip-range-15d');
        if (sideR15d) sideR15d.addEventListener('click', () => sideSetAndApplyRange(15, '60m'));
        const sideR1m = document.getElementById('sidebar-chip-range-1m');
        if (sideR1m) sideR1m.addEventListener('click', () => sideSetAndApplyRange(30, '1d'));
        const sideR3m = document.getElementById('sidebar-chip-range-3m');
        if (sideR3m) sideR3m.addEventListener('click', () => sideSetAndApplyRange(90, '1d'));
        const sideR6m = document.getElementById('sidebar-chip-range-6m');
        if (sideR6m) sideR6m.addEventListener('click', () => sideSetAndApplyRange(180, '1d'));
        const sideR1y = document.getElementById('sidebar-chip-range-1y');
        if (sideR1y) sideR1y.addEventListener('click', () => sideSetAndApplyRange(365, '1d'));
        const sideRytd = document.getElementById('sidebar-chip-range-ytd');
        if (sideRytd) sideRytd.addEventListener('click', () => {
            const from = `${new Date().getFullYear()}-01-01`;
            if (sideDateFrom) sideDateFrom.value = from;
            if (sideDateTo) sideDateTo.value = todayStr;
            loadDateRange(from, todayStr, '1d');
        });

        const sideApplyRange = document.getElementById('sidebar-apply-range-btn');
        if (sideApplyRange && sideDateFrom && sideDateTo) {
            sideApplyRange.addEventListener('click', () => {
                loadDateRange(sideDateFrom.value, sideDateTo.value, sideSelectedRangeTf);
            });
        }

        // 4. Apex Blueprint Button in Sidebar
        const sideApexBp = document.getElementById('sidebar-apex-blueprint-btn');
        if (sideApexBp) {
            sideApexBp.addEventListener('click', (e) => {
                e.stopPropagation();
                openBlueprint();
            });
        }
    }
    initProControlDeck();

    // 17. Watchlist Search & Item Click Handling
    const watchlistSearchInput = document.getElementById('watchlist-search');
    if (watchlistSearchInput) {
        watchlistSearchInput.addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase().trim();
            const items = document.querySelectorAll('.watchlist-item');
            items.forEach(it => {
                const text = it.innerText.toLowerCase();
                it.style.display = text.includes(q) ? 'flex' : 'none';
            });
        });
    }

    const watchlistItems = document.querySelectorAll('.watchlist-item');
    watchlistItems.forEach(it => {
        it.addEventListener('click', () => {
            const sym = it.dataset.symbol;
            const disp = it.dataset.display || sym;
            const sec = it.dataset.sector || 'Equity';
            const typ = it.dataset.type || 'Equity';

            selectSymbol({
                symbol: sym,
                displayName: disp,
                sector: sec,
                type: typ
            });
        });
    });

    function highlightWatchlistItem(symbol) {
        watchlistItems.forEach(it => {
            if (it.dataset.symbol === symbol) {
                it.classList.add('active');
            } else {
                it.classList.remove('active');
            }
        });
    }

    function updateWatchlistItemPrice(symbol, tick) {
        watchlistItems.forEach(it => {
            if (it.dataset.symbol === symbol) {
                const priceEl = it.querySelector('.item-price');
                const chgEl = it.querySelector('.item-chg');
                if (priceEl) priceEl.innerText = `₹${tick.price.toFixed(2)}`;
                if (chgEl) {
                    const isUp = tick.change >= 0;
                    chgEl.innerText = `${isUp ? '+' : ''}${tick.changePercent.toFixed(2)}%`;
                    chgEl.className = `item-chg font-mono ${isUp ? 'text-up' : 'text-down'}`;
                }
            }
        });
    }

    // 17. Helper Utilities
    function formatVolume(val) {
        if (!val) return '0';
        if (val >= 10000000) return (val / 10000000).toFixed(2) + ' Cr';
        if (val >= 100000) return (val / 100000).toFixed(2) + ' L';
        if (val >= 1000) return (val / 1000).toFixed(1) + ' K';
        return val.toString();
    }

    function showLoading(show) {
        const loader = document.getElementById('chart-loading-overlay');
        if (loader) {
            loader.style.display = show ? 'flex' : 'none';
        }
    }

    function showNotification(msg, type = 'info') {
        const notifContainer = document.getElementById('notifications-container');
        if (!notifContainer) return;

        const notif = document.createElement('div');
        notif.className = `toast-notification toast-${type}`;
        notif.innerHTML = `
            <span class="toast-dot"></span>
            <span class="toast-text">${msg}</span>
        `;
        notifContainer.appendChild(notif);

        setTimeout(() => {
            notif.classList.add('fade-out');
            setTimeout(() => notif.remove(), 300);
        }, 3200);
    }

    // 16. Apex Quantum Matrix™ Blueprint Modal
    const openBlueprintBtn = document.getElementById('open-apex-blueprint-btn');
    const blueprintModal = document.getElementById('apex-blueprint-modal');
    const blueprintBackdrop = document.getElementById('apex-blueprint-backdrop');
    const closeBlueprintBtn = document.getElementById('close-apex-blueprint-btn');
    const modalToggleApexBtn = document.getElementById('toggle-apex-from-modal-btn');

    function openBlueprint() {
        if (blueprintModal && blueprintBackdrop) {
            blueprintModal.style.display = 'block';
            blueprintBackdrop.style.display = 'block';
            updateModalApexButton();
        }
    }

    function closeBlueprint() {
        if (blueprintModal && blueprintBackdrop) {
            blueprintModal.style.display = 'none';
            blueprintBackdrop.style.display = 'none';
        }
    }

    function updateModalApexButton() {
        if (modalToggleApexBtn) {
            const isActive = chartEngine.activeIndicators.apex;
            modalToggleApexBtn.innerText = isActive ? 'Disable Apex on Chart' : 'Enable Apex on Chart';
            modalToggleApexBtn.style.background = isActive ? 'rgba(239, 68, 68, 0.85)' : 'var(--color-cyan)';
            modalToggleApexBtn.style.color = isActive ? '#ffffff' : '#0a0d14';
        }
    }

    if (openBlueprintBtn) openBlueprintBtn.addEventListener('click', openBlueprint);
    if (closeBlueprintBtn) closeBlueprintBtn.addEventListener('click', closeBlueprint);
    if (blueprintBackdrop) blueprintBackdrop.addEventListener('click', closeBlueprint);

    if (modalToggleApexBtn) {
        modalToggleApexBtn.addEventListener('click', () => {
            const isActive = chartEngine.toggleIndicator('apex');
            document.querySelectorAll('.ind-toggle-btn[data-indicator="apex"]').forEach(el => {
                if (isActive) el.classList.add('active');
                else el.classList.remove('active');
            });
            updateActiveIndCounter();
            updateModalApexButton();
            const el = document.getElementById('hud-apex');
            if (el && el.parentElement) el.parentElement.style.display = isActive ? 'inline-block' : 'none';
            showNotification(isActive ? "Apex Quantum Matrix™ Activated" : "Apex Quantum Matrix™ Deactivated", "info");
        });
    }

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeBlueprint();
        }
    });

    // 17. Initial Load
    await loadChart();
});
