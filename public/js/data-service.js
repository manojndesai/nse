/**
 * NIFTY PRO TERMINAL - Data Service
 * Coordinates API requests, caching, date range resolution, and live tick streaming.
 */

class DataService {
    constructor() {
        this.currentSymbol = '^NSEI';
        this.currentDisplayName = 'NIFTY 50';
        this.currentInterval = '5m';
        this.currentRange = '1d';
        this.currentDate = null;
        this.customRange = null; // { from, to }
        this.isLiveActive = true;
        this.liveIntervalId = null;
        this.onTickCallback = null;
        this.onStatusCallback = null;
        this.marketStatus = { isOpen: false, istTime: '' };
    }

    async fetchChartData(params = {}) {
        const symbol = params.symbol || this.currentSymbol;
        const interval = params.interval || this.currentInterval;
        const query = new URLSearchParams();

        query.set('symbol', symbol);
        query.set('interval', interval);

        const from = params.from || (this.customRange ? this.customRange.from : null);
        const to = params.to || (this.customRange ? this.customRange.to : null);
        const date = params.date || this.currentDate;

        if (date) {
            query.set('date', date);
        } else if (from && to) {
            query.set('from', from);
            query.set('to', to);
            // Construct precise timestamps for IST (09:00 to 16:00 IST)
            const p1 = Math.floor(new Date(from + 'T09:00:00+05:30').getTime() / 1000);
            const p2 = Math.floor(new Date(to + 'T16:00:00+05:30').getTime() / 1000);
            query.set('period1', p1);
            query.set('period2', p2);
        } else if (params.range) {
            query.set('range', params.range);
        } else {
            query.set('range', this.currentRange);
        }

        try {
            const res = await fetch(`/api/chart?${query.toString()}`);
            if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
            const data = await res.json();
            return data;
        } catch (err) {
            console.error("Error fetching chart data:", err);
            throw err;
        }
    }

    async fetchQuote(symbol) {
        try {
            const res = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol || this.currentSymbol)}`);
            return await res.json();
        } catch (e) {
            console.error("Error fetching quote:", e);
            return null;
        }
    }

    async fetchMarketStatus() {
        try {
            const res = await fetch('/api/market-status');
            const data = await res.json();
            this.marketStatus = data;
            if (this.onStatusCallback) {
                this.onStatusCallback(data);
            }
            return data;
        } catch (e) {
            console.error("Error fetching market status:", e);
            return null;
        }
    }

    async fetchMarketIndices() {
        try {
            const res = await fetch('/api/market-indices');
            return await res.json();
        } catch (e) {
            console.error("Error fetching market indices:", e);
            return null;
        }
    }

    startLiveStreaming(callback) {
        this.onTickCallback = callback;
        this.stopLiveStreaming();

        this.liveIntervalId = setInterval(async () => {
            if (!this.isLiveActive) return;
            try {
                const res = await fetch(`/api/live-tick?symbol=${encodeURIComponent(this.currentSymbol)}`);
                const tick = await res.json();
                if (tick.status === 'success' && this.onTickCallback) {
                    this.onTickCallback(tick);
                }
            } catch (e) {
                // silently retry
            }
        }, 1200);
    }

    stopLiveStreaming() {
        if (this.liveIntervalId) {
            clearInterval(this.liveIntervalId);
            this.liveIntervalId = null;
        }
    }

    toggleLive(enable) {
        this.isLiveActive = enable !== undefined ? enable : !this.isLiveActive;
        return this.isLiveActive;
    }
}

window.DataService = DataService;
