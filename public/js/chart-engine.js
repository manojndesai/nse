/**
 * NIFTY PRO TERMINAL - Chart Engine
 * Wrapper around TradingView Lightweight Charts
 * Provides IST time axis formatting, Supertrend (10,3), Pivots (S1/S2/R1/R2/P), VWAP,
 * full chart scaling, crosshair HUD, and live candle updates.
 */

class ChartEngine {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        this.options = options;
        this.chart = null;
        this.candleSeries = null;
        this.volumeSeries = null;

        // Indicator series map
        this.indicatorSeries = {
            ema9: null,
            ema21: null,
            ema50: null,
            sma200: null,
            vwap: null,
            bbUpper: null,
            bbMiddle: null,
            bbLower: null,
            supertrendUp: null,
            supertrendDown: null,
            apexBaseline: null,
            apexUpper: null,
            apexLower: null,
            apexStop: null
        };

        // Pivot horizontal price lines
        this.pivotPriceLines = [];

        // Sub-charts
        this.rsiChart = null;
        this.rsiSeries = null;
        this.macdChart = null;
        this.macdLineSeries = null;
        this.macdSignalSeries = null;
        this.macdHistSeries = null;
        this.apexChart = null;
        this.apexHistSeries = null;
        this.apexCmiSeries = null;

        // Active indicator visibility states (Supertrend, Pivots, VWAP, Volume, Apex Matrix active by default)
        this.activeIndicators = {
            volume: true,
            vwap: true,
            supertrend: true,
            pivots: true,
            apex: true,
            ema9: false,
            ema21: false,
            ema50: false,
            sma200: false,
            bollinger: false,
            rsi: false,
            macd: false
        };

        this.currentCandles = [];
        this.lastCandle = null;
        this.currentPivots = null;
        this.currentSupertrend = null;
        this.currentApex = null;
        this.chartType = 'candlestick';
        this.onCrosshairMoveCallback = null;
        this.isMouseInsideChart = false;
        this.isInternalUpdating = false;
        this.currentHoverCandle = null;

        // Zoom preservation state
        // true = user has manually panned/zoomed; don't auto-fitContent on refresh
        this._userHasZoomed = false;
        this._isFirstLoad = true;

        this.init();
    }

    init() {
        if (!this.container) {
            console.error("Chart container not found");
            return;
        }

        // Initialize main chart with IST (Asia/Kolkata) time axis & crosshair
        this.chart = LightweightCharts.createChart(this.container, {
            layout: {
                background: { type: 'solid', color: '#0d1117' },
                textColor: '#8b949e',
                fontSize: 12,
                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            },
            localization: {
                locale: 'en-IN',
                dateFormat: 'dd/MM/yyyy',
                timeFormatter: (time) => {
                    if (typeof time === 'number') {
                        const date = new Date(time * 1000);
                        const timeStr = date.toLocaleTimeString('en-IN', {
                            timeZone: 'Asia/Kolkata',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false
                        });
                        const dateStr = date.toLocaleDateString('en-IN', {
                            timeZone: 'Asia/Kolkata',
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric'
                        });
                        return `${dateStr} ${timeStr} IST`;
                    } else if (typeof time === 'string') {
                        return time;
                    } else if (time && time.year) {
                        return `${time.day}/${time.month}/${time.year}`;
                    }
                    return String(time);
                }
            },
            grid: {
                vertLines: { color: 'rgba(255, 255, 255, 0.05)', style: 1 },
                horzLines: { color: 'rgba(255, 255, 255, 0.05)', style: 1 },
            },
            crosshair: {
                mode: LightweightCharts.CrosshairMode.Normal,
                vertLine: {
                    color: 'rgba(56, 189, 248, 0.5)',
                    width: 1,
                    style: 2,
                    labelBackgroundColor: '#1f293d',
                },
                horzLine: {
                    color: 'rgba(56, 189, 248, 0.5)',
                    width: 1,
                    style: 2,
                    labelBackgroundColor: '#1f293d',
                },
            },
            rightPriceScale: {
                borderColor: 'rgba(255, 255, 255, 0.1)',
                scaleMargins: {
                    top: 0.08,
                    bottom: 0.22,
                },
                autoScale: true,
                alignLabels: true,
            },
            timeScale: {
                borderColor: 'rgba(255, 255, 255, 0.1)',
                timeVisible: true,
                secondsVisible: false,
                barSpacing: 10,
                minBarSpacing: 3,
                rightOffset: 5,
                // Format ticks in Indian Standard Time (IST)
                tickMarkFormatter: (time, tickMarkType, locale) => {
                    if (typeof time === 'number') {
                        const date = new Date(time * 1000);
                        if (tickMarkType >= 3) {
                            // Intraday hours and minutes: 09:15, 10:00, 11:30, 13:00, 14:30, 15:30 IST
                            return date.toLocaleTimeString('en-IN', {
                                timeZone: 'Asia/Kolkata',
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: false
                            });
                        } else if (tickMarkType === 2) {
                            // Day of month: e.g. "22 Oct" in IST
                            return date.toLocaleDateString('en-IN', {
                                timeZone: 'Asia/Kolkata',
                                day: '2-digit',
                                month: 'short'
                            });
                        } else if (tickMarkType === 1) {
                            // Month + Year: e.g. "Oct 2026"
                            return date.toLocaleDateString('en-IN', {
                                timeZone: 'Asia/Kolkata',
                                month: 'short',
                                year: 'numeric'
                            });
                        } else {
                            return date.toLocaleDateString('en-IN', {
                                timeZone: 'Asia/Kolkata',
                                year: 'numeric'
                            });
                        }
                    } else if (typeof time === 'string') {
                        return time;
                    } else if (time && time.year) {
                        return `${time.day}/${time.month}/${time.year}`;
                    }
                    return null;
                }
            },
            handleScroll: {
                mouseWheel: true,
                pressedMouseMove: true,
                horzTouchDrag: true,
                vertTouchDrag: true,
            },
            handleScale: {
                axisPressedMouseMove: true,
                mouseWheel: true,
                pinch: true,
            },
        });

        // Add Candlestick Series
        this.candleSeries = this.chart.addCandlestickSeries({
            upColor: '#089981',
            downColor: '#f23645',
            borderVisible: false,
            wickUpColor: '#089981',
            wickDownColor: '#f23645',
            priceFormat: {
                type: 'price',
                precision: 2,
                minMove: 0.05,
            },
        });

        // Add Volume Series overlay
        this.volumeSeries = this.chart.addHistogramSeries({
            color: '#26a69a',
            priceFormat: {
                type: 'volume',
            },
            priceScaleId: 'volume',
        });

        this.chart.priceScale('volume').applyOptions({
            scaleMargins: {
                top: 0.8,
                bottom: 0,
            },
            alignLabels: false,
        });

        // Create indicator series
        this.createIndicatorSeries();

        // Crosshair move handler
        this.chart.subscribeCrosshairMove(param => {
            this.handleCrosshairMove(param);
        });

        // Track real mouse cursor entry/movement/exit on chart viewport container
        const chartViewport = this.container.closest('.chart-viewport') || this.container.parentElement || this.container;
        if (chartViewport) {
            chartViewport.addEventListener('mouseenter', () => {
                this.isMouseInsideChart = true;
            });
            chartViewport.addEventListener('mousemove', () => {
                this.isMouseInsideChart = true;
            });
            chartViewport.addEventListener('mouseleave', () => {
                this.isMouseInsideChart = false;
                this.currentHoverCandle = null;
                if (this.onCrosshairMoveCallback && this.lastCandle) {
                    this.onCrosshairMoveCallback(this.lastCandle);
                }
            });
        }
        this.container.addEventListener('mouseenter', () => {
            this.isMouseInsideChart = true;
        });
        this.container.addEventListener('mousemove', () => {
            this.isMouseInsideChart = true;
        });

        // Resize observer for responsive full scale
        this.resizeObserver = new ResizeObserver(() => {
            this.resize();
        });
        this.resizeObserver.observe(this.container);

        // Window resize event
        window.addEventListener('resize', () => this.resize());

        // Detect user-initiated pan/zoom interactions so we can preserve them
        this.chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
            // Only flag as user-zoomed when NOT doing an internal update
            if (!this.isInternalUpdating) {
                this._userHasZoomed = true;
            }
        });
    }

    createIndicatorSeries() {
        // 1. VWAP (Cyan / Teal) - Price line & last value
        this.indicatorSeries.vwap = this.chart.addLineSeries({
            color: '#00d4ff',
            lineWidth: 2,
            lineStyle: 0,
            title: 'VWAP',
            priceLineVisible: true,
            lastValueVisible: true,
        });

        // 2. Supertrend (10, 3) - Distinct Green UP & Red DOWN lines
        this.indicatorSeries.supertrendUp = this.chart.addLineSeries({
            color: '#10b981',
            lineWidth: 2,
            title: 'ST UP (10,3)',
            priceLineVisible: false,
            lastValueVisible: true,
        });

        this.indicatorSeries.supertrendDown = this.chart.addLineSeries({
            color: '#ef4444',
            lineWidth: 2,
            title: 'ST DOWN (10,3)',
            priceLineVisible: false,
            lastValueVisible: true,
        });

        // 3. EMA 9 (Cyan)
        this.indicatorSeries.ema9 = this.chart.addLineSeries({
            color: '#38bdf8',
            lineWidth: 1.5,
            title: 'EMA 9',
            priceLineVisible: false,
            lastValueVisible: false,
        });

        // 4. EMA 21 (Gold)
        this.indicatorSeries.ema21 = this.chart.addLineSeries({
            color: '#ffd166',
            lineWidth: 1.5,
            title: 'EMA 21',
            priceLineVisible: false,
            lastValueVisible: false,
        });

        // 5. EMA 50 (Orange)
        this.indicatorSeries.ema50 = this.chart.addLineSeries({
            color: '#fb923c',
            lineWidth: 1.5,
            title: 'EMA 50',
            priceLineVisible: false,
            lastValueVisible: false,
        });

        // 6. SMA 200 (Purple)
        this.indicatorSeries.sma200 = this.chart.addLineSeries({
            color: '#c084fc',
            lineWidth: 1.5,
            title: 'SMA 200',
            priceLineVisible: false,
            lastValueVisible: false,
        });

        // 7. Bollinger Bands
        this.indicatorSeries.bbUpper = this.chart.addLineSeries({
            color: 'rgba(167, 139, 250, 0.75)',
            lineWidth: 1,
            lineStyle: 2,
            title: 'BB Upper',
            priceLineVisible: false,
            lastValueVisible: false,
        });
        this.indicatorSeries.bbMiddle = this.chart.addLineSeries({
            color: 'rgba(129, 140, 248, 0.85)',
            lineWidth: 1,
            title: 'BB Middle',
            priceLineVisible: false,
            lastValueVisible: false,
        });
        this.indicatorSeries.bbLower = this.chart.addLineSeries({
            color: 'rgba(167, 139, 250, 0.75)',
            lineWidth: 1,
            lineStyle: 2,
            title: 'BB Lower',
            priceLineVisible: false,
            lastValueVisible: false,
        });

        // 8. Apex Quantum Matrix™ Overlays
        this.indicatorSeries.apexBaseline = this.chart.addLineSeries({
            color: '#00d4ff',
            lineWidth: 2,
            title: 'Apex Baseline (Hull+VWAP)',
            priceLineVisible: false,
            lastValueVisible: true,
        });
        this.indicatorSeries.apexUpper = this.chart.addLineSeries({
            color: 'rgba(0, 212, 255, 0.5)',
            lineWidth: 1,
            lineStyle: 2,
            title: 'Apex Vol Upper (+1.618σ)',
            priceLineVisible: false,
            lastValueVisible: false,
        });
        this.indicatorSeries.apexLower = this.chart.addLineSeries({
            color: 'rgba(0, 212, 255, 0.5)',
            lineWidth: 1,
            lineStyle: 2,
            title: 'Apex Vol Lower (-1.618σ)',
            priceLineVisible: false,
            lastValueVisible: false,
        });
        this.indicatorSeries.apexStop = this.chart.addLineSeries({
            color: '#f59e0b',
            lineWidth: 1.5,
            lineStyle: 1,
            title: 'Apex Trailing Stop',
            priceLineVisible: false,
            lastValueVisible: true,
        });
    }

    setData(candles, meta = {}, resetZoom = false) {
        if (!candles || candles.length === 0) return;
        this.currentHoverCandle = null;
        this.currentCandles = candles;
        this.lastCandle = candles[candles.length - 1];

        // Capture current visible range BEFORE overwriting data, so we can restore it
        let savedLogicalRange = null;
        if (this._userHasZoomed && !resetZoom && !this._isFirstLoad) {
            try {
                savedLogicalRange = this.chart.timeScale().getVisibleLogicalRange();
            } catch (e) { }
        }

        this.isInternalUpdating = true;
        try {
            // Format candles for lightweight-charts
            const formattedCandles = candles.map(c => ({
                time: c.time,
                open: c.open,
                high: c.high,
                low: c.low,
                close: c.close,
            }));

            this.candleSeries.setData(formattedCandles);

            // Volume data
            if (this.activeIndicators.volume) {
                const volumeData = candles.map(c => ({
                    time: c.time,
                    value: c.volume,
                    color: c.close >= c.open ? 'rgba(8, 153, 129, 0.45)' : 'rgba(242, 54, 69, 0.45)',
                }));
                this.volumeSeries.setData(volumeData);
            } else {
                this.volumeSeries.setData([]);
            }

            // Recompute indicators & horizontal pivot levels
            this.updateIndicators();
            this.updatePivotPriceLines();

            if (savedLogicalRange) {
                // Restore the user's zoom/pan position
                this.chart.timeScale().setVisibleLogicalRange(savedLogicalRange);
            } else {
                // First load or explicit reset: fit everything into view
                this.fitScale();
            }

            if (resetZoom || this._isFirstLoad) {
                this._userHasZoomed = false;
            }
            this._isFirstLoad = false;
        } finally {
            this.isInternalUpdating = false;
        }

        // Trigger default crosshair with latest candle
        if (this.onCrosshairMoveCallback && this.lastCandle) {
            this.onCrosshairMoveCallback(this.lastCandle);
        }
    }

    updateIndicators() {
        const candles = this.currentCandles;
        if (!candles || candles.length === 0) return;

        // 1. VWAP (Anchored in IST)
        if (this.activeIndicators.vwap) {
            const vwapData = Indicators.calculateVWAP(candles);
            this.indicatorSeries.vwap.setData(vwapData);
        } else {
            this.indicatorSeries.vwap.setData([]);
        }

        // 2. Supertrend (10, 3)
        if (this.activeIndicators.supertrend) {
            const stResult = Indicators.calculateSupertrend(candles, 10, 3);
            this.currentSupertrend = stResult.current;

            // Separate points into UP and DOWN segments
            const upPoints = [];
            const downPoints = [];

            stResult.series.forEach(item => {
                if (item.direction === 'UP') {
                    upPoints.push({ time: item.time, value: item.value });
                } else {
                    downPoints.push({ time: item.time, value: item.value });
                }
            });

            this.indicatorSeries.supertrendUp.setData(upPoints);
            this.indicatorSeries.supertrendDown.setData(downPoints);

            // Set reversal arrow markers directly on candlestick bars!
            if (stResult.signals && stResult.signals.length > 0) {
                this.candleSeries.setMarkers(stResult.signals);
            } else {
                this.candleSeries.setMarkers([]);
            }
        } else {
            this.indicatorSeries.supertrendUp.setData([]);
            this.indicatorSeries.supertrendDown.setData([]);
            this.candleSeries.setMarkers([]);
        }

        // 3. EMA 9
        if (this.activeIndicators.ema9) {
            const ema9Data = Indicators.calculateEMA(candles, 9);
            this.indicatorSeries.ema9.setData(ema9Data);
        } else {
            this.indicatorSeries.ema9.setData([]);
        }

        // 4. EMA 21
        if (this.activeIndicators.ema21) {
            const ema21Data = Indicators.calculateEMA(candles, 21);
            this.indicatorSeries.ema21.setData(ema21Data);
        } else {
            this.indicatorSeries.ema21.setData([]);
        }

        // 5. EMA 50
        if (this.activeIndicators.ema50) {
            const ema50Data = Indicators.calculateEMA(candles, 50);
            this.indicatorSeries.ema50.setData(ema50Data);
        } else {
            this.indicatorSeries.ema50.setData([]);
        }

        // 6. SMA 200
        if (this.activeIndicators.sma200) {
            const sma200Data = Indicators.calculateSMA(candles, 200);
            this.indicatorSeries.sma200.setData(sma200Data);
        } else {
            this.indicatorSeries.sma200.setData([]);
        }

        // 7. Bollinger Bands
        if (this.activeIndicators.bollinger) {
            const bb = Indicators.calculateBollingerBands(candles, 20, 2);
            this.indicatorSeries.bbUpper.setData(bb.upper);
            this.indicatorSeries.bbMiddle.setData(bb.middle);
            this.indicatorSeries.bbLower.setData(bb.lower);
        } else {
            this.indicatorSeries.bbUpper.setData([]);
            this.indicatorSeries.bbMiddle.setData([]);
            this.indicatorSeries.bbLower.setData([]);
        }

        // 8. Subcharts: RSI & MACD
        if (this.activeIndicators.rsi) {
            this.renderRSIChart();
        }
        if (this.activeIndicators.macd) {
            this.renderMACDChart();
        }

        // 9. Apex Quantum Matrix™ (Proprietary Engine)
        if (this.activeIndicators.apex) {
            const apexData = Indicators.calculateApexMatrix(candles);
            this.currentApex = apexData.current;

            this.indicatorSeries.apexBaseline.setData(apexData.baseline);
            this.indicatorSeries.apexUpper.setData(apexData.upperBand);
            this.indicatorSeries.apexLower.setData(apexData.lowerBand);
            this.indicatorSeries.apexStop.setData(apexData.trailingStop);

            // Merge / overlay APEX signals on candlestick chart
            if (apexData.signals && apexData.signals.length > 0) {
                const stSignals = (this.activeIndicators.supertrend)
                    ? (Indicators.calculateSupertrend(candles, 10, 3).signals || [])
                    : [];
                this.candleSeries.setMarkers([...stSignals, ...apexData.signals]);
            }

            this.renderApexChart();
        } else {
            this.indicatorSeries.apexBaseline.setData([]);
            this.indicatorSeries.apexUpper.setData([]);
            this.indicatorSeries.apexLower.setData([]);
            this.indicatorSeries.apexStop.setData([]);
            const apexEl = document.getElementById('apex-chart-container');
            if (apexEl) apexEl.style.display = 'none';

            if (this.activeIndicators.supertrend) {
                const st = Indicators.calculateSupertrend(candles, 10, 3);
                this.candleSeries.setMarkers(st.signals || []);
            } else {
                this.candleSeries.setMarkers([]);
            }
        }
    }

    /**
     * Render Pivot Points (S1, S2, R1, R2, and Pivot P)
     * Directly as horizontal price lines on the main candlestick chart
     */
    updatePivotPriceLines() {
        // Clear existing pivot lines
        if (this.pivotPriceLines && this.pivotPriceLines.length > 0) {
            for (const line of this.pivotPriceLines) {
                try {
                    this.candleSeries.removePriceLine(line);
                } catch (e) { }
            }
            this.pivotPriceLines = [];
        }

        if (!this.activeIndicators.pivots || !this.currentCandles || this.currentCandles.length === 0) {
            return;
        }

        const pivots = Indicators.calculatePivots(this.currentCandles);
        if (!pivots) return;
        this.currentPivots = pivots;

        // R2 Resistance Level (Red)
        const r2Line = this.candleSeries.createPriceLine({
            price: pivots.r2,
            color: '#ef4444',
            lineWidth: 1,
            lineStyle: 2, // dashed
            axisLabelVisible: true,
            title: 'R2',
        });

        // R1 Resistance Level (Orange)
        const r1Line = this.candleSeries.createPriceLine({
            price: pivots.r1,
            color: '#f97316',
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: 'R1',
        });

        // PIVOT Main Level (Cyan)
        const pLine = this.candleSeries.createPriceLine({
            price: pivots.pivot,
            color: '#00d4ff',
            lineWidth: 1.5,
            lineStyle: 0, // solid
            axisLabelVisible: true,
            title: 'PIVOT (P)',
        });

        // S1 Support Level (Light Green)
        const s1Line = this.candleSeries.createPriceLine({
            price: pivots.s1,
            color: '#34d399',
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: 'S1',
        });

        // S2 Support Level (Emerald Green)
        const s2Line = this.candleSeries.createPriceLine({
            price: pivots.s2,
            color: '#10b981',
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: 'S2',
        });

        this.pivotPriceLines = [r2Line, r1Line, pLine, s1Line, s2Line];
    }

    renderRSIChart() {
        const rsiContainer = document.getElementById('rsi-chart-container');
        if (!rsiContainer) return;
        rsiContainer.style.display = 'block';

        if (!this.rsiChart) {
            this.rsiChart = LightweightCharts.createChart(rsiContainer, {
                height: 120,
                layout: {
                    background: { type: 'solid', color: '#090d14' },
                    textColor: '#8b949e',
                    fontSize: 10,
                },
                localization: {
                    locale: 'en-IN',
                    timeFormatter: (time) => {
                        if (typeof time === 'number') {
                            const date = new Date(time * 1000);
                            return date.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }) + ' IST';
                        }
                        return String(time);
                    }
                },
                grid: {
                    vertLines: { color: 'rgba(255, 255, 255, 0.04)' },
                    horzLines: { color: 'rgba(255, 255, 255, 0.04)' },
                },
                timeScale: {
                    visible: true,
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    tickMarkFormatter: (time, tickMarkType) => {
                        if (typeof time === 'number' && tickMarkType >= 3) {
                            return new Date(time * 1000).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
                        }
                        return null;
                    }
                },
                rightPriceScale: {
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                },
            });

            this.rsiSeries = this.rsiChart.addLineSeries({
                color: '#a855f7',
                lineWidth: 2,
                title: 'RSI 14',
            });

            this.rsiSeries.createPriceLine({
                price: 70,
                color: '#ef4444',
                lineWidth: 1,
                lineStyle: 2,
                axisLabelVisible: true,
                title: 'Overbought (70)',
            });
            this.rsiSeries.createPriceLine({
                price: 50,
                color: 'rgba(255,255,255,0.2)',
                lineWidth: 1,
                lineStyle: 3,
                axisLabelVisible: false,
            });
            this.rsiSeries.createPriceLine({
                price: 30,
                color: '#10b981',
                lineWidth: 1,
                lineStyle: 2,
                axisLabelVisible: true,
                title: 'Oversold (30)',
            });

            this.syncTimeScales(this.chart, this.rsiChart);
        }

        const rsiData = Indicators.calculateRSI(this.currentCandles, 14);
        this.rsiSeries.setData(rsiData);
        this.rsiChart.timeScale().fitContent();
    }

    renderMACDChart() {
        const macdContainer = document.getElementById('macd-chart-container');
        if (!macdContainer) return;
        macdContainer.style.display = 'block';

        if (!this.macdChart) {
            this.macdChart = LightweightCharts.createChart(macdContainer, {
                height: 130,
                layout: {
                    background: { type: 'solid', color: '#090d14' },
                    textColor: '#8b949e',
                    fontSize: 10,
                },
                localization: {
                    locale: 'en-IN',
                    timeFormatter: (time) => {
                        if (typeof time === 'number') {
                            const date = new Date(time * 1000);
                            return date.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }) + ' IST';
                        }
                        return String(time);
                    }
                },
                grid: {
                    vertLines: { color: 'rgba(255, 255, 255, 0.04)' },
                    horzLines: { color: 'rgba(255, 255, 255, 0.04)' },
                },
                timeScale: {
                    visible: true,
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    tickMarkFormatter: (time, tickMarkType) => {
                        if (typeof time === 'number' && tickMarkType >= 3) {
                            return new Date(time * 1000).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
                        }
                        return null;
                    }
                },
                rightPriceScale: {
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                },
            });

            this.macdHistSeries = this.macdChart.addHistogramSeries({
                title: 'Histogram',
                priceFormat: { type: 'volume' },
            });

            this.macdLineSeries = this.macdChart.addLineSeries({
                color: '#38bdf8',
                lineWidth: 2,
                title: 'MACD (12,26)',
            });

            this.macdSignalSeries = this.macdChart.addLineSeries({
                color: '#f59e0b',
                lineWidth: 2,
                title: 'Signal (9)',
            });

            this.macdLineSeries.createPriceLine({
                price: 0,
                color: 'rgba(255,255,255,0.2)',
                lineWidth: 1,
                lineStyle: 2,
                axisLabelVisible: false,
            });

            this.syncTimeScales(this.chart, this.macdChart);
        }

        const macdData = Indicators.calculateMACD(this.currentCandles, 12, 26, 9);
        this.macdLineSeries.setData(macdData.macdLine);
        this.macdSignalSeries.setData(macdData.signalLine);
        this.macdHistSeries.setData(macdData.histogram);
        this.macdChart.timeScale().fitContent();
    }

    renderApexChart() {
        const apexContainer = document.getElementById('apex-chart-container');
        if (!apexContainer) return;
        apexContainer.style.display = 'block';

        if (!this.apexChart) {
            this.apexChart = LightweightCharts.createChart(apexContainer, {
                height: 130,
                layout: {
                    background: { type: 'solid', color: '#090d14' },
                    textColor: '#8b949e',
                    fontSize: 10,
                },
                localization: {
                    locale: 'en-IN',
                    timeFormatter: (time) => {
                        if (typeof time === 'number') {
                            const date = new Date(time * 1000);
                            return date.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }) + ' IST';
                        }
                        return String(time);
                    }
                },
                grid: {
                    vertLines: { color: 'rgba(255, 255, 255, 0.04)' },
                    horzLines: { color: 'rgba(255, 255, 255, 0.04)' },
                },
                timeScale: {
                    visible: true,
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    tickMarkFormatter: (time, tickMarkType) => {
                        if (typeof time === 'number' && tickMarkType >= 3) {
                            return new Date(time * 1000).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
                        }
                        return null;
                    }
                },
                rightPriceScale: {
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                },
            });

            // 1. Momentum Energy Histogram
            this.apexHistSeries = this.apexChart.addHistogramSeries({
                title: 'Apex Momentum Wave',
                priceFormat: { type: 'volume' },
            });

            // 2. Composite Momentum Index (CMI 0-100)
            this.apexCmiSeries = this.apexChart.addLineSeries({
                color: '#00d4ff',
                lineWidth: 2,
                title: 'CMI (0-100)',
            });

            this.apexCmiSeries.createPriceLine({
                price: 75,
                color: '#ef4444',
                lineWidth: 1,
                lineStyle: 2,
                axisLabelVisible: true,
                title: 'Overbought (75)',
            });
            this.apexCmiSeries.createPriceLine({
                price: 50,
                color: 'rgba(255,255,255,0.25)',
                lineWidth: 1,
                lineStyle: 3,
                axisLabelVisible: false,
                title: 'Baseline (50)',
            });
            this.apexCmiSeries.createPriceLine({
                price: 25,
                color: '#10b981',
                lineWidth: 1,
                lineStyle: 2,
                axisLabelVisible: true,
                title: 'Oversold (25)',
            });

            this.syncTimeScales(this.chart, this.apexChart);
        }

        const apexData = Indicators.calculateApexMatrix(this.currentCandles);
        this.apexHistSeries.setData(apexData.momentumHistogram);
        this.apexCmiSeries.setData(apexData.cmi);
        this.apexChart.timeScale().fitContent();
    }

    syncTimeScales(mainChart, subChart) {
        if (!mainChart || !subChart) return;
        mainChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
            if (range) subChart.timeScale().setVisibleLogicalRange(range);
        });
        subChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
            if (range) mainChart.timeScale().setVisibleLogicalRange(range);
        });
    }

    updateLiveTick(tick) {
        if (!this.lastCandle || !this.candleSeries) return;
        if (tick.isMarketClosed || tick.tickDirection === 'flat') {
            // Market is closed - keep candles frozen at official closing prices
            return;
        }

        const price = tick.price;
        const last = this.lastCandle;

        const updatedCandle = {
            time: last.time,
            open: last.open,
            high: Math.max(last.high, price),
            low: Math.min(last.low, price),
            close: price,
            volume: last.volume + 100
        };

        this.isInternalUpdating = true;
        try {
            this.candleSeries.update(updatedCandle);
            this.lastCandle = updatedCandle;

            if (this.currentCandles.length > 0) {
                this.currentCandles[this.currentCandles.length - 1] = updatedCandle;
            }

            // Realtime update on VWAP
            if (this.activeIndicators.vwap && this.indicatorSeries.vwap) {
                const vwapData = Indicators.calculateVWAP(this.currentCandles);
                if (vwapData.length > 0) this.indicatorSeries.vwap.update(vwapData[vwapData.length - 1]);
            }
        } finally {
            this.isInternalUpdating = false;
        }

        // Only update HUD if the user is not actively inspecting candles inside the chart
        if (this.onCrosshairMoveCallback && !this.isMouseInsideChart) {
            this.onCrosshairMoveCallback(updatedCandle);
        }
    }

    setChartType(type) {
        this.chartType = type;
        if (type === 'hollow') {
            this.candleSeries.applyOptions({
                upColor: '#0d1117',
                downColor: '#f23645',
                borderVisible: true,
                borderUpColor: '#089981',
                borderDownColor: '#f23645',
                wickUpColor: '#089981',
                wickDownColor: '#f23645',
            });
        } else {
            this.candleSeries.applyOptions({
                upColor: '#089981',
                downColor: '#f23645',
                borderVisible: false,
                wickUpColor: '#089981',
                wickDownColor: '#f23645',
            });
        }
    }

    toggleIndicator(name) {
        if (this.activeIndicators.hasOwnProperty(name)) {
            this.activeIndicators[name] = !this.activeIndicators[name];

            if (name === 'pivots') {
                this.updatePivotPriceLines();
            } else if (name === 'rsi') {
                const el = document.getElementById('rsi-chart-container');
                if (el) el.style.display = this.activeIndicators.rsi ? 'block' : 'none';
                if (this.activeIndicators.rsi) this.renderRSIChart();
            } else if (name === 'macd') {
                const el = document.getElementById('macd-chart-container');
                if (el) el.style.display = this.activeIndicators.macd ? 'block' : 'none';
                if (this.activeIndicators.macd) this.renderMACDChart();
            } else if (name === 'apex') {
                const el = document.getElementById('apex-chart-container');
                if (el) el.style.display = this.activeIndicators.apex ? 'block' : 'none';
                if (this.activeIndicators.apex) this.renderApexChart();
                this.updateIndicators();
            } else {
                this.updateIndicators();
            }
            this.resize();
            return this.activeIndicators[name];
        }
        return false;
    }

    handleCrosshairMove(param) {
        // If this event was fired internally during series.update(), ignore it
        if (this.isInternalUpdating) return;

        // If the mouse is not currently over the chart viewport, ignore
        if (!this.isMouseInsideChart) return;

        if (!param || !param.time || !param.seriesData) {
            // Keep the currently hovered candle values locked!
            return;
        }

        const candleData = param.seriesData.get(this.candleSeries);
        if (candleData && candleData.open !== undefined && candleData.close !== undefined) {
            // Resolve volume for hovered candle
            let vol = 0;
            if (this.volumeSeries && param.seriesData.has(this.volumeSeries)) {
                const volData = param.seriesData.get(this.volumeSeries);
                if (volData && volData.value !== undefined) {
                    vol = volData.value;
                }
            }
            if (!vol && this.currentCandles.length > 0) {
                const found = this.currentCandles.find(c => c.time === param.time);
                if (found && found.volume !== undefined) {
                    vol = found.volume;
                }
            }
            if (!vol && this.lastCandle) {
                vol = this.lastCandle.volume;
            }

            const hovered = {
                time: param.time,
                open: candleData.open,
                high: candleData.high,
                low: candleData.low,
                close: candleData.close,
                volume: vol,
            };
            this.currentHoverCandle = hovered;

            if (this.onCrosshairMoveCallback) {
                this.onCrosshairMoveCallback(hovered);
            }
        }
    }

    fitScale() {
        if (this.chart) {
            this.chart.timeScale().fitContent();
            this.chart.priceScale('right').applyOptions({ autoScale: true });
            this._userHasZoomed = false;
        }
    }

    resetScale() {
        this._userHasZoomed = false;
        this.fitScale();
    }

    toggleFullScreen() {
        const elem = document.getElementById('chart-workspace-wrapper');
        if (!elem) return;

        if (!document.fullscreenElement) {
            if (elem.requestFullscreen) {
                elem.requestFullscreen();
            } else if (elem.webkitRequestFullscreen) {
                elem.webkitRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
        setTimeout(() => this.resize(), 150);
    }

    resize() {
        if (this.chart && this.container) {
            const width = this.container.clientWidth;
            const height = this.container.clientHeight;
            if (width > 0 && height > 0) {
                this.chart.applyOptions({ width, height });
            }
        }
        if (this.rsiChart) {
            const rsiEl = document.getElementById('rsi-chart-container');
            if (rsiEl && rsiEl.clientWidth > 0) {
                this.rsiChart.applyOptions({ width: rsiEl.clientWidth });
            }
        }
        if (this.macdChart) {
            const macdEl = document.getElementById('macd-chart-container');
            if (macdEl && macdEl.clientWidth > 0) {
                this.macdChart.applyOptions({ width: macdEl.clientWidth });
            }
        }
        if (this.apexChart) {
            const apexEl = document.getElementById('apex-chart-container');
            if (apexEl && apexEl.clientWidth > 0) {
                this.apexChart.applyOptions({ width: apexEl.clientWidth });
            }
        }
    }

    exportChartImage() {
        if (!this.chart) return;
        const canvas = this.chart.takeScreenshot();
        const link = document.createElement('a');
        link.download = `nifty-pro-chart-${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    }
}

window.ChartEngine = ChartEngine;
