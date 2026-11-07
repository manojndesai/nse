/**
 * Technical Indicators Calculation Engine
 * Mathematical algorithms for:
 * EMA, SMA, Bollinger Bands, RSI, MACD, VWAP, Supertrend (10, 3), Pivot Points, Technical Summary Gauge
 */

const Indicators = {
    /**
     * Simple Moving Average (SMA)
     */
    calculateSMA(candles, period = 20) {
        if (!candles || candles.length < period) return [];
        const result = [];
        let sum = 0;

        for (let i = 0; i < candles.length; i++) {
            sum += candles[i].close;
            if (i >= period) {
                sum -= candles[i - period].close;
            }
            if (i >= period - 1) {
                result.push({
                    time: candles[i].time,
                    value: parseFloat((sum / period).toFixed(2))
                });
            }
        }
        return result;
    },

    /**
     * Exponential Moving Average (EMA)
     */
    calculateEMA(candles, period = 9) {
        if (!candles || candles.length < period) return [];
        const result = [];
        const k = 2 / (period + 1);

        // Initial SMA as the starting seed
        let sum = 0;
        for (let i = 0; i < period; i++) {
            sum += candles[i].close;
        }
        let ema = sum / period;
        result.push({
            time: candles[period - 1].time,
            value: parseFloat(ema.toFixed(2))
        });

        // Compute subsequent EMAs
        for (let i = period; i < candles.length; i++) {
            ema = (candles[i].close * k) + (ema * (1 - k));
            result.push({
                time: candles[i].time,
                value: parseFloat(ema.toFixed(2))
            });
        }
        return result;
    },

    /**
     * Bollinger Bands (20, 2)
     */
    calculateBollingerBands(candles, period = 20, stdDevMult = 2) {
        if (!candles || candles.length < period) {
            return { upper: [], middle: [], lower: [] };
        }

        const upper = [];
        const middle = [];
        const lower = [];

        for (let i = period - 1; i < candles.length; i++) {
            let sum = 0;
            for (let j = 0; j < period; j++) {
                sum += candles[i - j].close;
            }
            const mean = sum / period;

            let varianceSum = 0;
            for (let j = 0; j < period; j++) {
                varianceSum += Math.pow(candles[i - j].close - mean, 2);
            }
            const stdDev = Math.sqrt(varianceSum / period);

            const t = candles[i].time;
            const midVal = parseFloat(mean.toFixed(2));
            const upVal = parseFloat((mean + (stdDevMult * stdDev)).toFixed(2));
            const lowVal = parseFloat((mean - (stdDevMult * stdDev)).toFixed(2));

            middle.push({ time: t, value: midVal });
            upper.push({ time: t, value: upVal });
            lower.push({ time: t, value: lowVal });
        }

        return { upper, middle, lower };
    },

    /**
     * Relative Strength Index (RSI 14)
     */
    calculateRSI(candles, period = 14) {
        if (!candles || candles.length <= period) return [];
        const result = [];

        let gains = 0;
        let losses = 0;

        // First average gain/loss
        for (let i = 1; i <= period; i++) {
            const diff = candles[i].close - candles[i - 1].close;
            if (diff >= 0) gains += diff;
            else losses += Math.abs(diff);
        }

        let avgGain = gains / period;
        let avgLoss = losses / period;

        let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        let rsi = 100 - (100 / (1 + rs));

        result.push({
            time: candles[period].time,
            value: parseFloat(rsi.toFixed(2))
        });

        // Wilder's smoothing
        for (let i = period + 1; i < candles.length; i++) {
            const diff = candles[i].close - candles[i - 1].close;
            const currentGain = diff >= 0 ? diff : 0;
            const currentLoss = diff < 0 ? Math.abs(diff) : 0;

            avgGain = ((avgGain * (period - 1)) + currentGain) / period;
            avgLoss = ((avgLoss * (period - 1)) + currentLoss) / period;

            rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
            rsi = 100 - (100 / (1 + rs));

            result.push({
                time: candles[i].time,
                value: parseFloat(rsi.toFixed(2))
            });
        }

        return result;
    },

    /**
     * Moving Average Convergence Divergence (MACD 12, 26, 9)
     */
    calculateMACD(candles, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
        if (!candles || candles.length < slowPeriod + signalPeriod) {
            return { macdLine: [], signalLine: [], histogram: [] };
        }

        const fastEMA = this.calculateEMA(candles, fastPeriod);
        const slowEMA = this.calculateEMA(candles, slowPeriod);

        // Align fast and slow by time
        const slowMap = new Map();
        slowEMA.forEach(item => slowMap.set(item.time, item.value));

        const macdPoints = [];
        for (const f of fastEMA) {
            if (slowMap.has(f.time)) {
                const macdVal = f.value - slowMap.get(f.time);
                macdPoints.push({
                    time: f.time,
                    value: parseFloat(macdVal.toFixed(2)),
                    close: macdVal
                });
            }
        }

        // Calculate Signal Line (9 EMA of MACD)
        const signalLine = this.calculateEMA(macdPoints, signalPeriod);
        const signalMap = new Map();
        signalLine.forEach(item => signalMap.set(item.time, item.value));

        const macdLine = [];
        const histogram = [];

        for (const m of macdPoints) {
            if (signalMap.has(m.time)) {
                const sigVal = signalMap.get(m.time);
                const histVal = parseFloat((m.value - sigVal).toFixed(2));
                
                macdLine.push({ time: m.time, value: m.value });
                histogram.push({
                    time: m.time,
                    value: histVal,
                    color: histVal >= 0 ? '#10b981' : '#ef4444'
                });
            }
        }

        return { macdLine, signalLine, histogram };
    },

    /**
     * Volume Weighted Average Price (VWAP)
     * Resets daily at session opening in Indian Standard Time (IST)
     */
    calculateVWAP(candles) {
        if (!candles || candles.length === 0) return [];
        const result = [];

        let cumulativePV = 0;
        let cumulativeVol = 0;
        let lastDay = null;

        for (const c of candles) {
            let dayKey;
            if (typeof c.time === 'number') {
                const date = new Date(c.time * 1000);
                dayKey = date.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
            } else {
                dayKey = String(c.time);
            }

            // Reset VWAP at new session boundary in IST
            if (dayKey !== lastDay) {
                cumulativePV = 0;
                cumulativeVol = 0;
                lastDay = dayKey;
            }

            const typicalPrice = (c.high + c.low + c.close) / 3;
            const volume = c.volume > 0 ? c.volume : 1;

            cumulativePV += typicalPrice * volume;
            cumulativeVol += volume;

            const vwap = cumulativeVol > 0 ? cumulativePV / cumulativeVol : c.close;
            result.push({
                time: c.time,
                value: parseFloat(vwap.toFixed(2))
            });
        }

        return result;
    },

    /**
     * Supertrend (10, 3)
     * Period: 10, Multiplier: 3
     * Returns points, trend direction (UP / DOWN), and reversal signals
     */
    calculateSupertrend(candles, period = 10, multiplier = 3) {
        if (!candles || candles.length < period) return { series: [], signals: [], current: null };
        const series = [];
        const signals = [];

        // 1. Calculate True Range (TR)
        const tr = [];
        for (let i = 0; i < candles.length; i++) {
            if (i === 0) {
                tr.push(candles[i].high - candles[i].low);
            } else {
                const hl = candles[i].high - candles[i].low;
                const hc = Math.abs(candles[i].high - candles[i - 1].close);
                const lc = Math.abs(candles[i].low - candles[i - 1].close);
                tr.push(Math.max(hl, hc, lc));
            }
        }

        // 2. Wilder's Smoothed Average True Range (ATR)
        let atr = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
        const atrArr = [atr];

        for (let i = period; i < tr.length; i++) {
            atr = ((atr * (period - 1)) + tr[i]) / period;
            atrArr.push(atr);
        }

        let inUptrend = true;
        let upperBand = 0;
        let lowerBand = 0;
        let prevSupertrend = 0;

        for (let i = period - 1; i < candles.length; i++) {
            const currentATR = atrArr[i - (period - 1)] || atr;
            const c = candles[i];
            const prevC = candles[i - 1];

            const basicUpper = ((c.high + c.low) / 2) + (multiplier * currentATR);
            const basicLower = ((c.high + c.low) / 2) - (multiplier * currentATR);

            if (i === period - 1) {
                upperBand = basicUpper;
                lowerBand = basicLower;
                prevSupertrend = c.close >= basicUpper ? basicLower : basicUpper;
                inUptrend = c.close >= basicUpper;
            } else {
                upperBand = (basicUpper < upperBand || prevC.close > upperBand) ? basicUpper : upperBand;
                lowerBand = (basicLower > lowerBand || prevC.close < lowerBand) ? basicLower : lowerBand;

                const prevTrend = inUptrend;
                if (inUptrend && c.close < lowerBand) {
                    inUptrend = false;
                } else if (!inUptrend && c.close > upperBand) {
                    inUptrend = true;
                }

                // Check for trend flip reversal signal
                if (prevTrend !== inUptrend) {
                    signals.push({
                        time: c.time,
                        position: inUptrend ? 'belowBar' : 'aboveBar',
                        color: inUptrend ? '#10b981' : '#ef4444',
                        shape: inUptrend ? 'arrowUp' : 'arrowDown',
                        text: inUptrend ? 'ST BUY (10,3)' : 'ST SELL (10,3)',
                        type: inUptrend ? 'BUY' : 'SELL',
                        price: c.close
                    });
                }
            }

            const stValue = inUptrend ? lowerBand : upperBand;
            const pt = {
                time: c.time,
                value: parseFloat(stValue.toFixed(2)),
                color: inUptrend ? '#10b981' : '#ef4444',
                direction: inUptrend ? 'UP' : 'DOWN'
            };
            series.push(pt);
            prevSupertrend = stValue;
        }

        const current = series.length > 0 ? series[series.length - 1] : null;

        return {
            series,
            signals,
            current
        };
    },

    /**
     * Pivot Points (Classic Levels: P, S1, S2, S3, R1, R2, R3)
     */
    calculatePivots(candles) {
        if (!candles || candles.length === 0) return null;
        
        let h = -Infinity;
        let l = Infinity;
        let c = candles[candles.length - 1].close;

        for (const candle of candles) {
            if (candle.high > h) h = candle.high;
            if (candle.low < l) l = candle.low;
        }

        const p = (h + l + c) / 3;
        const diff = h - l;

        return {
            pivot: parseFloat(p.toFixed(2)),
            r1: parseFloat(((2 * p) - l).toFixed(2)),
            s1: parseFloat(((2 * p) - h).toFixed(2)),
            r2: parseFloat((p + diff).toFixed(2)),
            s2: parseFloat((p - diff).toFixed(2)),
            r3: parseFloat((h + 2 * (p - l)).toFixed(2)),
            s3: parseFloat((l - 2 * (h - p)).toFixed(2)),
            high: parseFloat(h.toFixed(2)),
            low: parseFloat(l.toFixed(2)),
            close: parseFloat(c.toFixed(2))
        };
    },

    /**
     * Weighted Moving Average (WMA)
     */
    calculateWMA(values, period) {
        if (!values || values.length < period) return [];
        const result = [];
        const weightSum = (period * (period + 1)) / 2;

        for (let i = period - 1; i < values.length; i++) {
            let sum = 0;
            for (let j = 0; j < period; j++) {
                sum += values[i - j] * (period - j);
            }
            result.push({
                index: i,
                value: sum / weightSum
            });
        }
        return result;
    },

    /**
     * Hull Moving Average (HMA) - Zero-lag, responsive directional trend filter
     */
    calculateHMA(candles, period = 16) {
        if (!candles || candles.length < period) return [];
        const closes = candles.map(c => c.close);
        const halfPeriod = Math.max(Math.floor(period / 2), 1);
        const sqrtPeriod = Math.max(Math.floor(Math.sqrt(period)), 1);

        const wmaHalf = this.calculateWMA(closes, halfPeriod);
        const wmaFull = this.calculateWMA(closes, period);

        const halfMap = new Map();
        wmaHalf.forEach(item => halfMap.set(item.index, item.value));

        const diffValues = [];
        const diffIndices = [];

        for (const item of wmaFull) {
            if (halfMap.has(item.index)) {
                const diff = (2 * halfMap.get(item.index)) - item.value;
                diffValues.push(diff);
                diffIndices.push(item.index);
            }
        }

        const hmaWMA = this.calculateWMA(diffValues, sqrtPeriod);
        const result = [];

        for (const item of hmaWMA) {
            const originalIndex = diffIndices[item.index];
            result.push({
                time: candles[originalIndex].time,
                value: parseFloat(item.value.toFixed(2))
            });
        }

        return result;
    },

    /**
     * Average True Range (ATR)
     */
    calculateATR(candles, period = 14) {
        if (!candles || candles.length < 2) return [];
        const tr = [];
        for (let i = 0; i < candles.length; i++) {
            if (i === 0) {
                tr.push(candles[i].high - candles[i].low);
            } else {
                const hl = candles[i].high - candles[i].low;
                const hc = Math.abs(candles[i].high - candles[i - 1].close);
                const lc = Math.abs(candles[i].low - candles[i - 1].close);
                tr.push(Math.max(hl, hc, lc));
            }
        }

        let atr = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
        const result = [{ time: candles[period - 1].time, value: atr }];

        for (let i = period; i < candles.length; i++) {
            atr = ((atr * (period - 1)) + tr[i]) / period;
            result.push({
                time: candles[i].time,
                value: parseFloat(atr.toFixed(2))
            });
        }
        return result;
    },

    /**
     * Keltner Channels (EMA 20 ± multiplier * ATR 14)
     */
    calculateKeltnerChannels(candles, period = 20, atrMultiplier = 1.5) {
        if (!candles || candles.length < period) return { upper: [], middle: [], lower: [] };
        const emaData = this.calculateEMA(candles, period);
        const atrData = this.calculateATR(candles, 14);

        const atrMap = new Map();
        atrData.forEach(a => atrMap.set(a.time, a.value));

        const upper = [];
        const middle = [];
        const lower = [];

        for (const e of emaData) {
            if (atrMap.has(e.time)) {
                const atrVal = atrMap.get(e.time);
                const mid = e.value;
                const up = parseFloat((mid + (atrMultiplier * atrVal)).toFixed(2));
                const low = parseFloat((mid - (atrMultiplier * atrVal)).toFixed(2));

                middle.push({ time: e.time, value: mid });
                upper.push({ time: e.time, value: up });
                lower.push({ time: e.time, value: low });
            }
        }
        return { upper, middle, lower };
    },

    /**
     * APEX QUANTUM MATRIX™ (AQM)
     * Proprietary 4-pillar algorithmic indicator synthesizing:
     * 1. Adaptive Hull-VWAP Trend Baseline
     * 2. Golden Ratio Dynamic Volatility Channels (±1.618σ ATR)
     * 3. Squeeze & Volatility Expansion Engine (Bollinger Band vs Keltner Channel)
     * 4. Composite Momentum Index (CMI 0-100) & Momentum Energy Histogram
     * 5. High-Confluence Algorithmic Ignition Signals (APEX BUY / APEX SELL) with dynamic R:R
     */
    calculateApexMatrix(candles, options = {}) {
        if (!candles || candles.length < 25) {
            return {
                baseline: [],
                upperBand: [],
                lowerBand: [],
                trailingStop: [],
                squeeze: [],
                momentumHistogram: [],
                cmi: [],
                signals: [],
                current: null
            };
        }

        const hmaData = this.calculateHMA(candles, 16);
        const vwapData = this.calculateVWAP(candles);
        const bbData = this.calculateBollingerBands(candles, 20, 2.0);
        const kcData = this.calculateKeltnerChannels(candles, 20, 1.5);
        const atrData = this.calculateATR(candles, 14);
        const rsiData = this.calculateRSI(candles, 14);

        // Map data by time for fast lookups
        const hmaMap = new Map();
        hmaData.forEach(h => hmaMap.set(h.time, h.value));

        const vwapMap = new Map();
        vwapData.forEach(v => vwapMap.set(v.time, v.value));

        const bbUpperMap = new Map();
        const bbLowerMap = new Map();
        bbData.upper.forEach(b => bbUpperMap.set(b.time, b.value));
        bbData.lower.forEach(b => bbLowerMap.set(b.time, b.value));

        const kcUpperMap = new Map();
        const kcLowerMap = new Map();
        kcData.upper.forEach(k => kcUpperMap.set(k.time, k.value));
        kcData.lower.forEach(k => kcLowerMap.set(k.time, k.value));

        const atrMap = new Map();
        atrData.forEach(a => atrMap.set(a.time, a.value));

        const rsiMap = new Map();
        rsiData.forEach(r => rsiMap.set(r.time, r.value));

        // Volume 20-SMA for volume confirmation
        const volPeriod = 20;
        const volAverages = [];
        let volSum = 0;
        for (let i = 0; i < candles.length; i++) {
            volSum += (candles[i].volume || 1);
            if (i >= volPeriod) volSum -= (candles[i - volPeriod].volume || 1);
            if (i >= volPeriod - 1) {
                volAverages.push({ time: candles[i].time, avg: volSum / volPeriod });
            }
        }
        const volMap = new Map();
        volAverages.forEach(v => volMap.set(v.time, v.avg));

        const baselineSeries = [];
        const upperBandSeries = [];
        const lowerBandSeries = [];
        const trailingStopSeries = [];
        const squeezeSeries = [];
        const momentumHistSeries = [];
        const cmiSeries = [];
        const signals = [];

        let inUptrend = true;
        let trailingStop = candles[0].close;
        let wasInSqueeze = false;
        let prevMom = 0;

        for (let i = 20; i < candles.length; i++) {
            const c = candles[i];
            const t = c.time;

            const hmaVal = hmaMap.get(t) || c.close;
            const vwapVal = vwapMap.get(t) || hmaVal;
            const atrVal = atrMap.get(t) || (c.high - c.low);
            const rsiVal = rsiMap.get(t) || 50;

            // 1. Adaptive Baseline: Blends Hull Moving Average with Volume-Weighted Price
            const baselineVal = parseFloat(((0.6 * hmaVal) + (0.4 * vwapVal)).toFixed(2));
            baselineSeries.push({ time: t, value: baselineVal });

            // 2. Golden Ratio Volatility Envelope (1.618 x ATR)
            const upperVal = parseFloat((baselineVal + (1.618 * atrVal)).toFixed(2));
            const lowerVal = parseFloat((baselineVal - (1.618 * atrVal)).toFixed(2));
            upperBandSeries.push({ time: t, value: upperVal });
            lowerBandSeries.push({ time: t, value: lowerVal });

            // 3. Volatility Squeeze Gatekeeper (Bollinger inside Keltner)
            const bbUp = bbUpperMap.get(t);
            const bbLow = bbLowerMap.get(t);
            const kcUp = kcUpperMap.get(t);
            const kcLow = kcLowerMap.get(t);

            const isSqueeze = (bbUp !== undefined && kcUp !== undefined) 
                ? (bbUp < kcUp && bbLow > kcLow)
                : false;

            const squeezeFired = wasInSqueeze && !isSqueeze;
            wasInSqueeze = isSqueeze;

            // 4. Momentum Histogram Engine (Smoothed price displacement)
            const midPrice = (bbUp && bbLow) ? (bbUp + bbLow) / 2 : baselineVal;
            const rawMom = c.close - midPrice;
            const momVal = parseFloat(rawMom.toFixed(2));

            let momColor = '#10b981'; // vibrant green (bullish expanding)
            if (momVal >= 0) {
                momColor = momVal >= prevMom ? '#10b981' : '#047857'; // decelerating green
            } else {
                momColor = momVal <= prevMom ? '#ef4444' : '#b91c1c'; // decelerating red
            }
            prevMom = momVal;

            momentumHistSeries.push({
                time: t,
                value: momVal,
                color: momColor
            });

            // Squeeze Dots on the Zero Line
            let squeezeDotColor = 'rgba(255, 255, 255, 0.2)'; // normal gray
            let squeezeStatus = 'NORMAL';
            if (isSqueeze) {
                squeezeDotColor = '#f59e0b'; // amber/orange (Squeeze ON)
                squeezeStatus = 'SQUEEZE_ON';
            } else if (squeezeFired) {
                squeezeDotColor = momVal >= 0 ? '#00d4ff' : '#f43f5e'; // Fired ignition
                squeezeStatus = momVal >= 0 ? 'FIRED_BULLISH' : 'FIRED_BEARISH';
            }

            squeezeSeries.push({
                time: t,
                value: 0,
                color: squeezeDotColor,
                status: squeezeStatus
            });

            // 5. Composite Momentum Index (CMI 0-100)
            const vwapSpreadNorm = Math.tanh((c.close - vwapVal) / Math.max(atrVal, 1));
            const vwapScore = 50 + (vwapSpreadNorm * 50);
            const cmiVal = parseFloat(Math.min(Math.max((0.65 * rsiVal) + (0.35 * vwapScore), 0), 100).toFixed(1));

            cmiSeries.push({
                time: t,
                value: cmiVal
            });

            // 6. Adaptive Trailing Stop
            const prevTrend = inUptrend;
            if (inUptrend) {
                const newStop = c.close - (1.618 * atrVal);
                trailingStop = Math.max(trailingStop, newStop);
                if (c.close < trailingStop && !isSqueeze) {
                    inUptrend = false;
                    trailingStop = c.close + (1.618 * atrVal);
                }
            } else {
                const newStop = c.close + (1.618 * atrVal);
                trailingStop = Math.min(trailingStop, newStop);
                if (c.close > trailingStop && !isSqueeze) {
                    inUptrend = true;
                    trailingStop = c.close - (1.618 * atrVal);
                }
            }

            trailingStopSeries.push({
                time: t,
                value: parseFloat(trailingStop.toFixed(2)),
                direction: inUptrend ? 'UP' : 'DOWN',
                color: inUptrend ? '#10b981' : '#ef4444'
            });

            // 7. High Confluence Signal Triggers (APEX BUY & APEX SELL)
            const volAvg = volMap.get(t) || 1;
            const hasVolConfirmation = (c.volume || 1) >= (0.85 * volAvg);

            const isBullishFlip = !prevTrend && inUptrend;
            const isBearishFlip = prevTrend && !inUptrend;

            // Confluence BUY
            if (isBullishFlip || (squeezeFired && momVal > 0 && cmiVal > 52)) {
                if (c.close >= baselineVal && cmiVal >= 50 && hasVolConfirmation) {
                    const slPrice = parseFloat((c.close - (1.5 * atrVal)).toFixed(2));
                    const t1Price = parseFloat((c.close + (1.5 * atrVal)).toFixed(2));
                    const t2Price = parseFloat((c.close + (3.0 * atrVal)).toFixed(2));

                    signals.push({
                        time: t,
                        position: 'belowBar',
                        color: '#00d4ff',
                        shape: 'arrowUp',
                        text: `APEX BUY • SL: ₹${slPrice} | T1: ₹${t1Price}`,
                        type: 'BUY',
                        price: c.close,
                        sl: slPrice,
                        t1: t1Price,
                        t2: t2Price,
                        cmi: cmiVal,
                        atr: parseFloat(atrVal.toFixed(2))
                    });
                }
            }
            // Confluence SELL
            else if (isBearishFlip || (squeezeFired && momVal < 0 && cmiVal < 48)) {
                if (c.close <= baselineVal && cmiVal <= 50 && hasVolConfirmation) {
                    const slPrice = parseFloat((c.close + (1.5 * atrVal)).toFixed(2));
                    const t1Price = parseFloat((c.close - (1.5 * atrVal)).toFixed(2));
                    const t2Price = parseFloat((c.close - (3.0 * atrVal)).toFixed(2));

                    signals.push({
                        time: t,
                        position: 'aboveBar',
                        color: '#f43f5e',
                        shape: 'arrowDown',
                        text: `APEX SELL • SL: ₹${slPrice} | T1: ₹${t1Price}`,
                        type: 'SELL',
                        price: c.close,
                        sl: slPrice,
                        t1: t1Price,
                        t2: t2Price,
                        cmi: cmiVal,
                        atr: parseFloat(atrVal.toFixed(2))
                    });
                }
            }
        }

        const lastCandle = candles[candles.length - 1];
        const lastBaseline = baselineSeries.length > 0 ? baselineSeries[baselineSeries.length - 1].value : lastCandle.close;
        const lastStop = trailingStopSeries.length > 0 ? trailingStopSeries[trailingStopSeries.length - 1] : null;
        const lastSqueeze = squeezeSeries.length > 0 ? squeezeSeries[squeezeSeries.length - 1] : null;
        const lastMom = momentumHistSeries.length > 0 ? momentumHistSeries[momentumHistSeries.length - 1] : null;
        const lastCmi = cmiSeries.length > 0 ? cmiSeries[cmiSeries.length - 1].value : 50;

        let currentRegime = 'NEUTRAL';
        if (inUptrend && lastMom && lastMom.value > 0) currentRegime = 'STRONG BULLISH';
        else if (inUptrend) currentRegime = 'BULLISH';
        else if (!inUptrend && lastMom && lastMom.value < 0) currentRegime = 'STRONG BEARISH';
        else currentRegime = 'BEARISH';

        const current = {
            regime: currentRegime,
            inUptrend,
            baseline: lastBaseline,
            trailingStop: lastStop ? lastStop.value : lastBaseline,
            cmi: lastCmi,
            momentum: lastMom ? lastMom.value : 0,
            isSqueeze: lastSqueeze ? lastSqueeze.status === 'SQUEEZE_ON' : false,
            squeezeStatus: lastSqueeze ? lastSqueeze.status : 'NORMAL',
            latestSignal: signals.length > 0 ? signals[signals.length - 1] : null
        };

        return {
            baseline: baselineSeries,
            upperBand: upperBandSeries,
            lowerBand: lowerBandSeries,
            trailingStop: trailingStopSeries,
            squeeze: squeezeSeries,
            momentumHistogram: momentumHistSeries,
            cmi: cmiSeries,
            signals,
            current
        };
    },

    /**
     * Technical Summary Score (-100 to +100)
     */
    getTechnicalSummary(candles) {
        if (!candles || candles.length < 20) {
            return {
                overall: 'NEUTRAL',
                score: 0,
                bullishCount: 0,
                bearishCount: 0,
                neutralCount: 0,
                indicators: []
            };
        }

        const last = candles[candles.length - 1];
        const currentPrice = last.close;

        let bullish = 0;
        let bearish = 0;
        let neutral = 0;
        const details = [];

        // 1. RSI
        const rsiData = this.calculateRSI(candles, 14);
        if (rsiData.length > 0) {
            const currentRSI = rsiData[rsiData.length - 1].value;
            let signal = 'NEUTRAL';
            if (currentRSI > 70) {
                signal = 'OVERBOUGHT (SELL)';
                bearish++;
            } else if (currentRSI < 30) {
                signal = 'OVERSOLD (BUY)';
                bullish++;
            } else if (currentRSI > 55) {
                signal = 'BULLISH';
                bullish++;
            } else if (currentRSI < 45) {
                signal = 'BEARISH';
                bearish++;
            } else {
                neutral++;
            }
            details.push({ name: 'RSI (14)', value: currentRSI, signal });
        }

        // 2. MACD
        const macdData = this.calculateMACD(candles, 12, 26, 9);
        if (macdData.histogram.length > 0) {
            const hist = macdData.histogram[macdData.histogram.length - 1].value;
            const signal = hist > 0 ? 'BULLISH' : 'BEARISH';
            if (hist > 0) bullish++; else bearish++;
            details.push({ name: 'MACD (12,26,9)', value: hist, signal });
        }

        // 3. Supertrend (10, 3)
        const stResult = this.calculateSupertrend(candles, 10, 3);
        if (stResult.current) {
            const isUp = stResult.current.direction === 'UP';
            const signal = isUp ? 'BULLISH (BUY)' : 'BEARISH (SELL)';
            if (isUp) bullish++; else bearish++;
            details.push({ name: 'Supertrend (10,3)', value: `₹${stResult.current.value}`, signal });
        }

        // 4. VWAP
        const vwapData = this.calculateVWAP(candles);
        if (vwapData.length > 0) {
            const lastVWAP = vwapData[vwapData.length - 1].value;
            const isAbove = currentPrice >= lastVWAP;
            const signal = isAbove ? 'BULLISH (Above VWAP)' : 'BEARISH (Below VWAP)';
            if (isAbove) bullish++; else bearish++;
            details.push({ name: 'VWAP', value: `₹${lastVWAP}`, signal });
        }

        // 5. EMA 9
        const ema9 = this.calculateEMA(candles, 9);
        if (ema9.length > 0) {
            const val = ema9[ema9.length - 1].value;
            const signal = currentPrice >= val ? 'BULLISH' : 'BEARISH';
            if (currentPrice >= val) bullish++; else bearish++;
            details.push({ name: 'EMA (9)', value: `₹${val}`, signal });
        }

        // 6. EMA 21
        const ema21 = this.calculateEMA(candles, 21);
        if (ema21.length > 0) {
            const val = ema21[ema21.length - 1].value;
            const signal = currentPrice >= val ? 'BULLISH' : 'BEARISH';
            if (currentPrice >= val) bullish++; else bearish++;
            details.push({ name: 'EMA (21)', value: `₹${val}`, signal });
        }

        // 7. Pivots Level Check
        const pivots = this.calculatePivots(candles);
        if (pivots) {
            let pSignal = 'NEUTRAL';
            if (currentPrice > pivots.r1) {
                pSignal = 'BULLISH (Above R1)';
                bullish++;
            } else if (currentPrice < pivots.s1) {
                pSignal = 'BEARISH (Below S1)';
                bearish++;
            } else if (currentPrice > pivots.pivot) {
                pSignal = 'MILD BULLISH (> P)';
                bullish++;
            } else {
                pSignal = 'MILD BEARISH (< P)';
                bearish++;
            }
            details.push({ name: 'Pivots S/R', value: `P: ₹${pivots.pivot}`, signal: pSignal });
        }

        // 8. Apex Quantum Matrix (Proprietary Quant Engine)
        const apexResult = this.calculateApexMatrix(candles);
        if (apexResult.current) {
            const cur = apexResult.current;
            let apexSignal = 'NEUTRAL';
            if (cur.regime === 'STRONG BULLISH') {
                apexSignal = 'STRONG BUY (Apex Momentum)';
                bullish += 2; // weighted higher due to multi-confluence
            } else if (cur.regime === 'BULLISH') {
                apexSignal = 'BULLISH (Above Baseline)';
                bullish += 1;
            } else if (cur.regime === 'STRONG BEARISH') {
                apexSignal = 'STRONG SELL (Apex Expansion)';
                bearish += 2;
            } else if (cur.regime === 'BEARISH') {
                apexSignal = 'BEARISH (Below Baseline)';
                bearish += 1;
            }
            if (cur.isSqueeze) {
                apexSignal += ' [Squeeze Compression]';
            }
            details.push({ 
                name: 'Apex Matrix™', 
                value: `CMI: ${cur.cmi} | Base: ₹${cur.baseline}`, 
                signal: apexSignal 
            });
        }

        const totalSignals = bullish + bearish + neutral;
        const score = totalSignals > 0 ? Math.round(((bullish - bearish) / totalSignals) * 100) : 0;

        let overall = 'NEUTRAL';
        if (score >= 45) overall = 'STRONG BUY';
        else if (score >= 15) overall = 'BUY';
        else if (score <= -45) overall = 'STRONG SELL';
        else if (score <= -15) overall = 'SELL';

        return {
            overall,
            score,
            bullishCount: bullish,
            bearishCount: bearish,
            neutralCount: neutral,
            totalSignals,
            indicators: details
        };
    }
};

window.Indicators = Indicators;
