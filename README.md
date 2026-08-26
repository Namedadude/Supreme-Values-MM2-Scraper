# MM2 Supreme Values Scraper & In-Game Displayer

A system to automatically scrape Murder Mystery 2 (MM2) item values from Supreme Values and display them inside the Roblox game client in real-time.

## Architecture

The project consists of two core components:

1. **Scraper**: A Node.js application using Puppeteer to scrape the latest value list, demand, stability, and rarity details from `https://supremevalues.com`. It processes data, normalizes item names to handle duplicates and variants (e.g. by year, type, and rarity), and outputs them to a structured JSON file (`values.json`).
2. **Luau Client Script**: An in-game Roblox script that:
   - Fetches the compiled `values.json` from the repository at startup.
   - Synchronizes with the game's internal `Sync` metadata module to map raw assets and internal IDs back to their corresponding names.
   - Handles item name collisions and year-based variants (e.g. various *Gingerbread* items) to match them.
   - Overlays the resulting value, demand, and stability indicators onto the Player GUI, supporting both Desktop and Mobile interfaces (Inventories, Profiles, and Active Trades).
   - Dynamically calculates active trade balances while filtering out non-numeric values (e.g. tier-based multipliers).

## Installation & Usage

### 1. Scraper
To run the scraper locally:
```bash
# Install dependencies
npm install

# Run the scraper
node scraper/scrape.js
```
The scraper output will be saved to `public/values.json` and `public/index.html`.

### 2. In-Game Script
To load the value displayer in a Roblox execution environment, run the following script:
```lua
loadstring(game:HttpGet("https://pastebin.com/raw/JG7ZCSJK"))()
```

## Features
- **Accurate matching**: Resolves complex name collisions (e.g., *Snowflake*, *Gingerbread*) using exact word matching, year extraction, and item-type validation.
- **Mobile Support**: Works on both Desktop and Mobile (Phones/Tablets) layouts.
- **Robust Asset Matching**: Matches game asset IDs to the `Sync` database using an offset range search (resolving minor differences in Roblox Image/Decal IDs).
- **Auto-Calculations**: Dynamically computes trade differences without letting non-numeric values corrupt the calculations.
