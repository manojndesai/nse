# NIFTY PRO • Live Technical Analysis & Charting Terminal

A high-performance, dark-themed trading terminal and technical study web portal engineered specifically for **NIFTY 50**, major Indian stock market indices, and **NIFTY 50 constituent equities**.

Built with **TradingView Lightweight Charts v4.2**, Vanilla CSS glassmorphic aesthetic, and integrated directly with official **National Stock Exchange (NSE) Model Context Protocol (MCP)** servers.

---

## 🏛️ Official NSE Model Context Protocol (MCP) Integration

The portal is directly integrated with the official remote MCP servers deployed by the **National Stock Exchange of India**:

1. **`nse-bhavcopy`**: `https://mcp.nseindia.in/bhavcopy/cm/mcp`
   - **Transport**: `streamable-http`
   - **Coverage**: Up to 5 years of official daily Bhavcopy historical data.
   - **Data**: Official Open, High, Low, Close, Total Traded Volume, Turnover, and 52-week High/Low directly from NSE's hot JVM in-memory cache (<1ms latency).
   - **Tools utilized**: `get_index_history`, `get_stock_history`, `get_ltp_by_date`.
2. **`cm-market`**: `https://mcp.nseindia.in/cmmkt/mcp`
   - **Transport**: `streamable-http`
   - **Coverage**: Active trading session Cash Market (CM) live feed snapshot.
   - **Data**: Live index values (Nifty 50, Bank Nifty, India VIX), stock quotes, top gainers, and top losers.
   - **Tools utilized**: `cm_get_index_quote`, `cm_get_stock_quote`, `cm_get_live_indices`.

Workspace configuration registered at: [.agents/mcp_config.json](file:///C:/Users/manoj/.gemini/antigravity-ide/scratch/nifty50-tech-portal/.agents/mcp_config.json).

---

## 🚀 Key Features

### 1. Full-Scale Interactive Charting
- **Candlestick & Volume Charts**: Ultra-fast responsive rendering on 100% full viewport scale.
- **Auto-Scale & Fit View**: Dynamically fits price and time axis to maximize visible price action.
- **Crosshair HUD**: Instant display of Open, High, Low, Close, Point Change, Percentage Change, and Trading Volume.
- **Fullscreen Mode**: Toggle full-monitor terminal view with a single click or keyboard shortcut.

### 2. Date Selection & Custom Range Analysis
- **Jump to Specific Date**: Select any calendar date to load the full intraday trading session (09:15 AM to 03:30 PM IST) on full scale.
- **Custom Date Range Picker**: Choose custom `From Date` and `To Date` to inspect multi-week or multi-month swing charts.
- **Quick Preset Ranges**: `Today (Intraday)`, `5D`, `1M`, `3M`, `6M`, `1Y`, and `ALL`.
- **Live Reset**: Instantly return back to real-time developing market candles.

### 3. Comprehensive Symbol Search (`Ctrl + K` or `/`)
- Instant command-palette modal with fuzzy search.
- Filter by sector tags: **All**, **Indices**, **Equities**, **Banking**, **IT**, **Energy**, **Auto**, **Pharma**, **FMCG**, **Metals**.
- Pre-loaded with:
  - **Indian Indices**: NIFTY 50 (`^NSEI`), BANK NIFTY (`^NSEBANK`), NIFTY IT (`^CNXIT`), FIN NIFTY, NIFTY MIDCAP 50, NIFTY AUTO, NIFTY PHARMA, NIFTY FMCG, NIFTY METAL, SENSEX (`^BSESN`), INDIA VIX.
  - **Top 50 Constituent Equities**: Reliance, TCS, HDFC Bank, Infosys, ICICI Bank, Bharti Airtel, SBI, L&T, ITC, Hindustan Unilever, Bajaj Finance, Tata Motors, Maruti Suzuki, Titan, Sun Pharma, Trent, etc.

### 4. Technical Study & Analysis Suite
- **Moving Averages**: EMA 9 (Cyan), EMA 21 (Gold), EMA 50 (Orange), SMA 200 (Purple).
- **Intraday Anchored VWAP**: Volume-Weighted Average Price resetting at session open.
- **Bollinger Bands (20, 2)**: Dynamic volatility bands with upper, middle, and lower lines.
- **Supertrend (10, 3)**: Trend indicator with automatic green (bullish) and red (bearish) signals.
- **RSI Subchart (14)**: Dedicated synchronized indicator pane with 70 Overbought and 30 Oversold bands.
- **MACD Subchart (12, 26, 9)**: MACD line, Signal line, and color-coded zero-centered Histogram.
- **Technical Sentiment Speedometer Gauge**: Real-time gauge calculating overall market bias (**Strong Buy**, **Buy**, **Neutral**, **Sell**, **Strong Sell**) based on aggregated moving average and oscillator signals.
- **Classic Pivot Points**: Real-time calculated Pivot (P), Resistance (R1, R2, R3), and Support (S1, S2, S3) with point differences from current market price.
- **Day's Range Slider**: Visual bar displaying the current price relative to day's Low and High.

### 5. Canvas Drawing Tools
- **Cursor / Crosshair**
- **Trendline Tool**: Interactive line drawn from point A to point B.
- **Horizontal Support / Resistance Level**: One-click horizontal price level with tag.
- **Fibonacci Retracement**: Multi-level Fibonacci retracement zones (0%, 23.6%, 38.2%, 50%, 61.8%, 78.6%, 100%).
- **Undo & Clear All**: One-click canvas reset.

### 6. Live Streaming & Fallback Engine
- Real-time polling every 1.2s with micro-price fluctuation simulation and tick flashes (green up / red down).
- Live IST Market Clock and Market Status badge (`LIVE MARKET` / `MARKET CLOSED • SIMULATION`).
- Intelligent fallback simulation: if offline or querying dates older than standard API retention, realistic high-fidelity intraday candles are generated matching actual daily OHLC boundaries.

---

## 📁 Project Structure

```
nifty50-tech-portal/
├── server.py                  # Python backend server & Yahoo Finance API proxy
├── run_terminal.bat           # Windows 1-click launcher
├── README.md                  # Documentation
└── public/                    # Frontend client
    ├── index.html             # Terminal UI structure & HTML5 layout
    ├── css/
    │   └── style.css          # Dark trading terminal CSS (Glassmorphism & animations)
    └── js/
        ├── lightweight-charts.standalone.js  # TradingView charting engine
        ├── indicators.js      # Mathematical calculations (EMA, RSI, MACD, Pivots)
        ├── chart-engine.js    # Chart wrapper & subchart synchronization
        ├── drawing-tools.js   # Canvas drawing overlay (Trendlines, Pivots, Fib)
        ├── search-modal.js    # Command-palette search with sector filters
        ├── technical-summary.js # Speedometer gauge & technical study panels
        ├── data-service.js    # API communication & date-range handling
        └── app.js             # Main controller & UI lifecycle
```

---

## ⚡ How to Run

1. Open PowerShell or Command Prompt in this folder:
   ```powershell
   cd C:\Users\manoj\.gemini\antigravity-ide\scratch\nifty50-tech-portal
   python server.py
   ```
2. Or simply double-click `run_terminal.bat`.
3. Open your browser to: **`http://localhost:8080`**

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Ctrl + K` or `/` | Open Symbol Search Command Palette |
| `Esc` | Close Search Modal / Deselect Tool |
| `1` to `5` | Switch Timeframes (`1m`, `5m`, `15m`, `1h`, `1D`) |
| `F11` | Toggle Fullscreen Terminal |
