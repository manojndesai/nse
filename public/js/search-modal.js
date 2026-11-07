/**
 * NIFTY PRO TERMINAL - Symbol Search & Command Palette Modal
 * Fast fuzzy search across Indian indices and Nifty 50 constituent equities.
 */

class SearchModal {
    constructor(options = {}) {
        this.onSelectCallback = options.onSelect || (() => {});
        this.modal = document.getElementById('search-modal');
        this.backdrop = document.getElementById('search-backdrop');
        this.input = document.getElementById('search-input');
        this.resultsList = document.getElementById('search-results');
        this.filterTabs = document.querySelectorAll('.search-filter-chip');
        this.allSymbols = [];
        this.filteredResults = [];
        this.selectedIndex = 0;
        this.currentCategory = 'all';
        this.recentSymbols = JSON.parse(localStorage.getItem('nifty_recent_symbols') || '[]');

        this.init();
    }

    async init() {
        // Fetch full symbols registry from server
        try {
            const res = await fetch('/api/symbols');
            const data = await res.json();
            if (data.status === 'success') {
                this.allSymbols = data.symbols;
            }
        } catch (e) {
            console.error("Failed to load symbols:", e);
        }

        // Global hotkeys: Ctrl+K or /
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey && e.key.toLowerCase() === 'k') || (e.key === '/' && document.activeElement.tagName !== 'INPUT')) {
                e.preventDefault();
                this.open();
            } else if (e.key === 'Escape' && this.isOpen()) {
                this.close();
            }
        });

        if (this.backdrop) {
            this.backdrop.addEventListener('click', () => this.close());
        }

        const closeBtn = document.getElementById('close-search-modal');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }

        const triggerInput = document.getElementById('header-search-trigger');
        if (triggerInput) {
            triggerInput.addEventListener('click', () => this.open());
        }

        if (this.input) {
            this.input.addEventListener('input', () => this.handleInput());
            this.input.addEventListener('keydown', (e) => this.handleKeyDown(e));
        }

        // Filter chips
        this.filterTabs.forEach(chip => {
            chip.addEventListener('click', () => {
                this.filterTabs.forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                this.currentCategory = chip.dataset.category || 'all';
                this.filter();
            });
        });
    }

    isOpen() {
        return this.modal && this.modal.classList.contains('active');
    }

    open() {
        if (!this.modal) return;
        this.modal.classList.add('active');
        if (this.backdrop) this.backdrop.classList.add('active');
        if (this.input) {
            this.input.value = '';
            setTimeout(() => this.input.focus(), 50);
        }
        this.selectedIndex = 0;
        this.filter();
    }

    close() {
        if (!this.modal) return;
        this.modal.classList.remove('active');
        if (this.backdrop) this.backdrop.classList.remove('active');
    }

    handleInput() {
        this.selectedIndex = 0;
        this.filter();
    }

    filter() {
        const query = (this.input ? this.input.value : '').trim().toLowerCase();
        let list = this.allSymbols;

        // Apply category filter
        if (this.currentCategory === 'indices') {
            list = list.filter(s => s.type === 'Index');
        } else if (this.currentCategory === 'equities') {
            list = list.filter(s => s.type === 'Equity');
        } else if (this.currentCategory !== 'all') {
            list = list.filter(s => s.sector.toLowerCase().includes(this.currentCategory));
        }

        // Apply text query
        if (query) {
            this.filteredResults = list.filter(s => 
                s.symbol.toLowerCase().includes(query) ||
                s.displayName.toLowerCase().includes(query) ||
                s.name.toLowerCase().includes(query) ||
                s.sector.toLowerCase().includes(query)
            );
        } else {
            // If empty, show popular or recent
            this.filteredResults = list;
        }

        this.renderResults();
    }

    renderResults() {
        if (!this.resultsList) return;
        this.resultsList.innerHTML = '';

        if (this.filteredResults.length === 0) {
            this.resultsList.innerHTML = `
                <div class="search-empty-state">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                    <p>No symbols found matching your criteria</p>
                </div>
            `;
            return;
        }

        this.filteredResults.slice(0, 25).forEach((item, index) => {
            const isSelected = index === this.selectedIndex;
            const li = document.createElement('li');
            li.className = `search-result-item ${isSelected ? 'selected' : ''}`;
            
            const isIndex = item.type === 'Index';
            const badgeClass = isIndex ? 'badge-index' : 'badge-equity';

            li.innerHTML = `
                <div class="search-item-left">
                    <div class="symbol-icon ${isIndex ? 'icon-index' : 'icon-equity'}">
                        ${isIndex ? 'IDX' : 'EQ'}
                    </div>
                    <div class="symbol-meta">
                        <div class="symbol-name-row">
                            <span class="symbol-display">${item.displayName}</span>
                            <span class="symbol-ticker">${item.symbol}</span>
                            <span class="sector-pill ${badgeClass}">${item.sector}</span>
                        </div>
                        <div class="symbol-full-name">${item.name}</div>
                    </div>
                </div>
                <div class="search-item-right">
                    <div class="item-price">₹${item.basePrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                    <div class="item-badge-pill">Select ↵</div>
                </div>
            `;

            li.addEventListener('click', () => {
                this.selectSymbol(item);
            });

            this.resultsList.appendChild(li);
        });

        // Scroll selected into view
        const selectedEl = this.resultsList.querySelector('.selected');
        if (selectedEl) {
            selectedEl.scrollIntoView({ block: 'nearest' });
        }
    }

    handleKeyDown(e) {
        const count = Math.min(this.filteredResults.length, 25);
        if (count === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.selectedIndex = (this.selectedIndex + 1) % count;
            this.updateSelection();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.selectedIndex = (this.selectedIndex - 1 + count) % count;
            this.updateSelection();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (this.filteredResults[this.selectedIndex]) {
                this.selectSymbol(this.filteredResults[this.selectedIndex]);
            }
        }
    }

    updateSelection() {
        const items = this.resultsList.querySelectorAll('.search-result-item');
        items.forEach((item, idx) => {
            if (idx === this.selectedIndex) {
                item.classList.add('selected');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('selected');
            }
        });
    }

    selectSymbol(symbolObj) {
        // Save to recents
        this.recentSymbols = [symbolObj.symbol, ...this.recentSymbols.filter(s => s !== symbolObj.symbol)].slice(0, 8);
        localStorage.setItem('nifty_recent_symbols', JSON.stringify(this.recentSymbols));

        this.close();
        if (this.onSelectCallback) {
            this.onSelectCallback(symbolObj);
        }
    }
}

window.SearchModal = SearchModal;
