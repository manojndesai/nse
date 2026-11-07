#!/usr/bin/env python3
"""
NIFTY PRO TERMINAL - Vercel Serverless Function API Entrypoint
Handles all /api/* routes for deployment on Vercel (@vercel/python runtime).
Zero external dependencies - standard Python library only.
"""

import os
import sys
import json
import urllib.parse
from http.server import BaseHTTPRequestHandler

# Ensure project root is in sys.path so server.py modules can be loaded
root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

import server


class handler(BaseHTTPRequestHandler):
    """
    Vercel Serverless Function Handler.
    Vercel requires a top-level class named 'handler' inheriting from BaseHTTPRequestHandler.
    """

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Max-Age", "86400")
        self.end_headers()

    def do_POST(self):
        # Route POST requests through standard handler
        return self.do_GET()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        query = urllib.parse.parse_qs(parsed.query)

        # 1. Determine clean route name from query, headers, or URL path
        raw_route = query.get("__route", [None])[0]
        if raw_route:
            clean_route = raw_route.split("?")[0].strip("/").lower()
        else:
            matched = self.headers.get("x-matched-path") or self.headers.get("x-vercel-matched-path")
            if matched and "/api/" in matched:
                clean_route = matched.split("/api/", 1)[1].split("?")[0].strip("/").lower()
            elif "/api/" in parsed.path:
                clean_route = parsed.path.split("/api/", 1)[1].split("?")[0].strip("/").lower()
            else:
                clean_route = parsed.path.strip("/").lower()

        # 2. Send standard API headers with open CORS
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        self.end_headers()

        # 3. Route to respective market data handler
        try:
            if clean_route in ["search", "search.py"]:
                server.NiftyTerminalHandler.handle_search(self, query)
            elif clean_route in ["symbols", "symbols.py"]:
                server.NiftyTerminalHandler.handle_symbols(self)
            elif clean_route in ["chart", "chart.py"]:
                server.NiftyTerminalHandler.handle_chart(self, query)
            elif clean_route in ["quote", "quote.py"]:
                server.NiftyTerminalHandler.handle_quote(self, query)
            elif clean_route in ["live-tick", "live_tick", "live-tick.py"]:
                server.NiftyTerminalHandler.handle_live_tick(self, query)
            elif clean_route in ["market-status", "market_status", "market-status.py"]:
                server.NiftyTerminalHandler.handle_market_status(self)
            elif clean_route in ["market-indices", "market_indices", "market-indices.py"]:
                server.NiftyTerminalHandler.handle_market_indices(self)
            elif clean_route in ["nifty-strategy", "nifty_strategy", "nifty-strategy.py"]:
                server.NiftyTerminalHandler.handle_nifty_strategy(self, query)
            else:
                self.wfile.write(json.dumps({
                    "status": "online",
                    "service": "NIFTY PRO TERMINAL API (Vercel Serverless)",
                    "route": clean_route,
                    "endpoints": [
                        "/api/symbols",
                        "/api/search",
                        "/api/chart",
                        "/api/quote",
                        "/api/live-tick",
                        "/api/market-status",
                        "/api/market-indices",
                        "/api/nifty-strategy"
                    ]
                }).encode("utf-8"))
        except Exception as e:
            self.wfile.write(json.dumps({
                "status": "error",
                "message": str(e),
                "route": clean_route
            }).encode("utf-8"))
