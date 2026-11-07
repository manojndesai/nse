/**
 * NIFTY PRO TERMINAL - Drawing Tools Overlay
 * Supports: Trendlines, Horizontal Support/Resistance lines, Fibonacci Retracement, Clear & Undo.
 */

class DrawingOverlay {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.currentTool = 'cursor'; // cursor, trendline, horizontal, fibonacci
        this.drawings = [];
        this.activeDrawing = null;
        this.isDrawing = false;
        this.mousePos = { x: 0, y: 0 };

        this.init();
    }

    init() {
        this.resize();
        window.addEventListener('resize', () => this.resize());

        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));

        // Prevent right-click context menu on canvas
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    resize() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.render();
    }

    setTool(tool) {
        this.currentTool = tool;
        if (tool === 'cursor') {
            this.canvas.style.pointerEvents = 'none';
        } else {
            this.canvas.style.pointerEvents = 'auto';
            this.canvas.style.cursor = 'crosshair';
        }
        this.activeDrawing = null;
        this.render();
    }

    getCanvasCoordinates(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    onMouseDown(e) {
        if (this.currentTool === 'cursor') return;
        const coords = this.getCanvasCoordinates(e);

        if (this.currentTool === 'horizontal') {
            // Instant horizontal support/resistance line
            this.drawings.push({
                type: 'horizontal',
                y: coords.y,
                color: '#38bdf8'
            });
            this.render();
            return;
        }

        if (this.currentTool === 'trendline' || this.currentTool === 'fibonacci') {
            this.isDrawing = true;
            this.activeDrawing = {
                type: this.currentTool,
                startX: coords.x,
                startY: coords.y,
                endX: coords.x,
                endY: coords.y,
                color: this.currentTool === 'trendline' ? '#fbbf24' : '#a855f7'
            };
        }
    }

    onMouseMove(e) {
        const coords = this.getCanvasCoordinates(e);
        this.mousePos = coords;

        if (this.isDrawing && this.activeDrawing) {
            this.activeDrawing.endX = coords.x;
            this.activeDrawing.endY = coords.y;
            this.render();
        }
    }

    onMouseUp(e) {
        if (!this.isDrawing) return;
        this.isDrawing = false;
        if (this.activeDrawing) {
            this.drawings.push(this.activeDrawing);
            this.activeDrawing = null;
            this.render();
        }
    }

    undo() {
        if (this.drawings.length > 0) {
            this.drawings.pop();
            this.render();
        }
    }

    clear() {
        this.drawings = [];
        this.activeDrawing = null;
        this.render();
    }

    render() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Render saved drawings
        for (const item of this.drawings) {
            this.drawItem(item);
        }

        // Render active drawing in progress
        if (this.activeDrawing) {
            this.drawItem(this.activeDrawing);
        }
    }

    drawItem(item) {
        const ctx = this.ctx;

        if (item.type === 'horizontal') {
            ctx.beginPath();
            ctx.strokeStyle = item.color || '#38bdf8';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
            ctx.moveTo(0, item.y);
            ctx.lineTo(this.canvas.width, item.y);
            ctx.stroke();
            ctx.setLineDash([]);

            // Draw badge
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(this.canvas.width - 60, item.y - 10, 56, 20);
            ctx.strokeStyle = item.color;
            ctx.strokeRect(this.canvas.width - 60, item.y - 10, 56, 20);
            ctx.fillStyle = '#ffffff';
            ctx.font = '10px monospace';
            ctx.fillText('LEVEL', this.canvas.width - 50, item.y + 4);
        } else if (item.type === 'trendline') {
            ctx.beginPath();
            ctx.strokeStyle = item.color || '#fbbf24';
            ctx.lineWidth = 2;
            ctx.setLineDash([]);
            ctx.moveTo(item.startX, item.startY);
            ctx.lineTo(item.endX, item.endY);
            ctx.stroke();

            // End nodes
            ctx.fillStyle = item.color;
            ctx.beginPath();
            ctx.arc(item.startX, item.startY, 4, 0, Math.PI * 2);
            ctx.arc(item.endX, item.endY, 4, 0, Math.PI * 2);
            ctx.fill();
        } else if (item.type === 'fibonacci') {
            const startY = item.startY;
            const endY = item.endY;
            const diffY = endY - startY;

            const fibLevels = [
                { ratio: 0.0, label: '0.0% (Swing Low)', color: '#94a3b8' },
                { ratio: 0.236, label: '23.6%', color: '#f87171' },
                { ratio: 0.382, label: '38.2%', color: '#fbbf24' },
                { ratio: 0.50, label: '50.0% (Golden Mean)', color: '#34d399' },
                { ratio: 0.618, label: '61.8% (Golden Ratio)', color: '#60a5fa' },
                { ratio: 0.786, label: '78.6%', color: '#a78bfa' },
                { ratio: 1.0, label: '100.0% (Swing High)', color: '#f43f5e' }
            ];

            const left = Math.min(item.startX, item.endX);
            const right = Math.max(item.startX, item.endX, left + 150);

            for (const f of fibLevels) {
                const currentY = startY + (diffY * f.ratio);

                ctx.beginPath();
                ctx.strokeStyle = f.color;
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 3]);
                ctx.moveTo(left, currentY);
                ctx.lineTo(this.canvas.width, currentY);
                ctx.stroke();

                // Label
                ctx.fillStyle = f.color;
                ctx.font = '10px Inter, sans-serif';
                ctx.fillText(f.label, left + 8, currentY - 4);
            }
            ctx.setLineDash([]);
        }
    }
}

window.DrawingOverlay = DrawingOverlay;
