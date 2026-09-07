const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");

const CATEGORIES = [
  { slug: "uniques", name: "uniques" },
  { slug: "ancients", name: "ancients" },
  { slug: "vintages", name: "vintages" },
  { slug: "chromas", name: "chromas" },
  { slug: "godlies", name: "godlies" },
  { slug: "legendaries", name: "legendaries" },
  { slug: "rares", name: "rares" },
  { slug: "uncommons", name: "uncommons" },
  { slug: "commons", name: "commons" },
  { slug: "pets", name: "pets" },
  { slug: "misc", name: "misc" },
  { slug: "miscellaneous", name: "misc" }
];

const BASE_URL = "https://supremevalues.com/mm2/";
const OUTPUT_DIR = __dirname;
const OUTPUT_FILE = path.join(OUTPUT_DIR, "values_beta.json");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function formatDate(d = new Date()) {
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const day = d.getUTCDate();
  const suffix =
    day % 10 === 1 && day !== 11 ? "st" :
    day % 10 === 2 && day !== 12 ? "nd" :
    day % 10 === 3 && day !== 13 ? "rd" : "th";
  let h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${months[d.getUTCMonth()]} ${day}${suffix}, ${d.getUTCFullYear()} at ${h}:${m} ${ampm} UTC`;
}

function convertXValue(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s || /^n\/?a$/i.test(s) || /^priceless$/i.test(s)) return null;
  const num = Number(String(s).replace(/,/g, ""));
  if (!Number.isNaN(num) && /^-?\d+(\.\d+)?$/.test(String(s).replace(/,/g, ""))) {
    return num;
  }
  return null; // For "x4 T1 Legendaries" or other non-numeric values
}

function pick(obj, ...keys) {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
  }
  return "N/A";
}

function determineType(displayName, category, info) {
  const n = displayName.toLowerCase();
  if (category === "pets" || n.includes("pet")) return "pet";
  if (category === "misc" || category === "sets") return "misc";

  const allText = (displayName + " " + (info?.wikiLink || "") + " " + (info?.imageKey || "")).toLowerCase();
  
  const isGun = allText.includes("gun") || 
                allText.includes("luger") || 
                allText.includes("revolver") || 
                allText.includes("blaster") || 
                allText.includes("pistol") || 
                allText.includes("cannon") || 
                allText.includes("shotgun") || 
                allText.includes("launcher") || 
                allText.includes("crossbow") || 
                allText.includes("harvester") ||
                allText.includes("laser") ||
                allText.includes("beam") ||
                allText.includes("scope") ||
                allText.includes("pew");

  if (isGun) {
    return "gun";
  }

  const isKnife = allText.includes("knife") || 
                  allText.includes("blade") || 
                  allText.includes("scythe") || 
                  allText.includes("dagger") || 
                  allText.includes("sword") || 
                  allText.includes("axe") || 
                  allText.includes("cleaver") || 
                  allText.includes("sickle") || 
                  allText.includes("cutter") || 
                  allText.includes("saw") || 
                  allText.includes("slasher") ||
                  allText.includes("fang") ||
                  allText.includes("edge");

  if (isKnife) {
    return "knife";
  }

  return "unknown";
}

function cleanDisplayName(rawName) {
  return String(rawName)
    .replace(/\s*\((Knife|Gun|Pet|Misc|\d{4})\)/gi, "")
    .replace(/\s*\[[^\]]+\]/gi, "")
    .trim();
}

function normalizeEntry(name, info, category) {
  const value = pick(info, "value", "Value", "val");
  const range = pick(info, "range", "Range", "rangedValue", "valueRange");
  const demand = pick(info, "demand", "Demand");
  const stability = pick(info, "stability", "Stability");
  const change = pick(info, "change", "Change");
  const origin = pick(info, "origin", "Origin");
  const aliases = pick(info, "aliases", "Aliases");

  let displayName = String(name).trim();
  if (category === "chromas" && !/^chroma\b/i.test(displayName)) {
    displayName = "Chroma " + displayName;
  }

  // Determine type (returns "gun", "knife", "pet", "misc", or "unknown")
  const type = determineType(displayName, category, info);

  // Determine rarity
  const categoryMap = {
    sets: "Set", uniques: "Unique", evos: "Evo", ancients: "Ancient",
    vintages: "Vintage", chromas: "Chroma", godlies: "Godly",
    legendaries: "Legendary", rares: "Rare", uncommons: "Uncommon",
    commons: "Common", pets: "Pet", misc: "Misc"
  };
  let rarityStr = categoryMap[category] || category;
  if (category === "pets" || category === "misc") {
    const parsedRarity = pick(info, "rarity", "Rarity");
    if (parsedRarity && parsedRarity !== "N/A" && parsedRarity !== "" && isNaN(parseInt(parsedRarity, 10))) {
      rarityStr = parsedRarity;
    }
  }

  // Extract year
  let year = null;
  const yearMatch = origin.match(/20\d\d/) || displayName.match(/20\d\d/);
  if (yearMatch) {
    year = parseInt(yearMatch[0], 10);
  } else {
    const shortYearMatch = origin.match(/'(\d\d)/);
    if (shortYearMatch) {
      year = 2000 + parseInt(shortYearMatch[1], 10);
    }
  }

  // Extract tier
  let tier = null;
  if (info && info.tier) {
    tier = info.tier;
  } else if (typeof value === "string") {
    const vm = value.match(/\b(T\d+)\b/i) || value.match(/Tier\s*(\d+)/i);
    if (vm) tier = vm[1].toUpperCase().startsWith("T") ? vm[1].toUpperCase() : "T" + vm[1];
  }

  const cleanedName = cleanDisplayName(displayName);

  return {
    name: cleanedName,
    rawName: displayName,
    value: value === "N/A" ? "N/A" : String(value).replace(/,/g, ""),
    numericValue: convertXValue(value),
    range: range === "N/A" ? "N/A" : String(range),
    demand: demand === "N/A" ? "N/A" : String(demand),
    rarity: rarityStr.toLowerCase(),
    stability: stability === "N/A" ? "N/A" : String(stability),
    change: change === "N/A" ? "N/A" : String(change),
    origin: origin === "N/A" ? "N/A" : String(origin),
    aliases: aliases === "N/A" ? "N/A" : String(aliases),
    isChroma: category === "chromas" || displayName.toLowerCase().includes("chroma"),
    year: year,
    category: category,
    type: type,
    tier: tier
  };
}

async function extractFromPage(page, categorySlug, categoryName) {
  const url = `${BASE_URL}${categorySlug}`;
  console.log(`Fetching: ${url}`);

  try {
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(3500);
    await page.evaluate(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const h = Math.max(document.body.scrollHeight, 2000);
      for (let y = 0; y < h; y += 600) {
        window.scrollTo(0, y);
        await sleep(150);
      }
      window.scrollTo(0, 0);
    });
    await sleep(1500);

    const title = await page.title().catch(() => "");
    if (/just a moment|attention required|captcha|access denied/i.test(title)) {
      console.log(`  ✗ Blocked on ${categorySlug}`);
      return null;
    }

    let data = null;
    const html = await page.content();
    const match = html.match(/var\s+_svPopup\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/i);
    if (match) {
      try {
        let jsonStr = match[1].trim();
        if (jsonStr.endsWith(";")) jsonStr = jsonStr.slice(0, -1);
        data = JSON.parse(jsonStr);
      } catch (e) {
        console.log(`  ✗ JSON parse fail: ${e.message}`);
      }
    }

    if (!data) {
      data = await page.evaluate(() => {
        if (typeof _svPopup !== "undefined" && _svPopup && typeof _svPopup === "object") {
          return _svPopup;
        }
        return null;
      });
    }

    // DOM Fallback
    if (!data) {
      console.log(`  ⚠ DOM fallback for ${categorySlug}...`);
      data = await page.evaluate(() => {
        const items = {};
        const cleanText = (text) => {
          const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
          if (lines.length <= 1) return text;
          const cleaned = [lines[0]];
          for (let j = 1; j < lines.length; j++) {
            const currentLine = lines[j];
            const isField = /^(value|demand|rarity|stability|range|origin|change|aliases)/i.test(currentLine) ||
              /^[\[\]()\d\s,.-]+$/.test(currentLine) || currentLine.length < 2;
            if (!isField) break;
            cleaned.push(currentLine);
          }
          return cleaned.join("\n");
        };

        const parseText = (text) => {
          const t = cleanText(text || "");
          const valueMatch = t.match(/Value\s*[-–:]?\s*\**\s*(Priceless|[0-9,]+(?:\.\d+)?|N\/A|x[\d\w\s\.]+)/i);
          const rangeMatch = t.match(/Range\s*[-–:]?\s*(\[?[^\n\]]{0,40}\]?)/i);
          const demandMatch = t.match(/Demand\s*[-–:]?\s*\**\s*(\d+(?:\.\d+)?)/i);
          const rarityMatch = t.match(/Rarity\s*[-–:]?\s*\**\s*(\d+(?:\.\d+)?)/i);
          const stabilityMatch = t.match(/Stability\s*[-–:]?\s*\**\s*([A-Za-z][A-Za-z\s]{0,30})/i);
          const changeMatch = t.match(/Change\s+in\s+Value\s*[-–:]?\s*([^\n]{0,50})/i);
          const originMatch = t.match(/Origin\s*[-–:]?\s*([^\n]{0,80})/i);
          const aliasesMatch = t.match(/Aliases?\s*[-–:]?\s*([^\n]{0,60})/i);
          return {
            value: valueMatch ? valueMatch[1].replace(/,/g, "").replace(/\*/g, "").trim() : "N/A",
            range: rangeMatch ? rangeMatch[1].trim() : "N/A",
            demand: demandMatch ? demandMatch[1] : "N/A",
            rarity: rarityMatch ? rarityMatch[1] : "N/A",
            stability: stabilityMatch ? stabilityMatch[1].trim() : "N/A",
            change: changeMatch ? changeMatch[1].trim() : "N/A",
            origin: originMatch ? originMatch[1].trim() : "N/A",
            aliases: aliasesMatch ? aliasesMatch[1].trim() : "N/A"
          };
        };

        document.querySelectorAll("[data-item], .item-card, .value-card, .item").forEach(card => {
          const nameEl = card.querySelector(".item-name, .name, h3, h4, strong, b") || card;
          let name = (nameEl.textContent || "").trim().split("\n")[0].trim();
          if (!name || name.length < 2) {
            const img = card.querySelector("img[alt]");
            if (img && img.alt) name = img.alt.trim();
          }
          if (name && name.length >= 2) {
            items[name] = parseText(card.innerText || "");
          }
        });
        return Object.keys(items).length > 0 ? items : null;
      });
    }

    return data;
  } catch (err) {
    console.error(`  Error ${categorySlug}: ${err.message}`);
    return null;
  }
}

async function getLastUpdated(page) {
  try {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
    await sleep(3000);
    const text = await page.evaluate(() => document.body.innerText || "");
    const match = text.match(/Values?\s+Last\s+Updated\s*[-–:]\s*([^\n/]+?)(?:\s*\/\/|\s*$)/i);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

async function main() {
  console.log("Supreme Values Beta Scraper — Excluding Untradables\n");

  let executable = null;
  if (process.platform === "win32") {
    const edgeWin = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
    const chromeWin = "C:/Program Files/Google/Chrome/Application/chrome.exe";
    if (fs.existsSync(edgeWin)) executable = edgeWin;
    else if (fs.existsSync(chromeWin)) executable = chromeWin;
  }

  const browser = await puppeteer.launch({
    defaultViewport: { width: 1366, height: 768 },
    executablePath: executable,
    headless: true
  });

  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

  const lastUpdated = await getLastUpdated(page);
  const rawItems = [];

  for (const cat of CATEGORIES) {
    const data = await extractFromPage(page, cat.slug, cat.name);
    if (data && typeof data === "object") {
      let count = 0;
      for (const [name, info] of Object.entries(data)) {
        const entry = normalizeEntry(name, info || {}, cat.name);
        
        // STRICTLY SKIP UNTRADABLES AND N/A ITEMS
        const valLower = String(entry.value).toLowerCase();
        if (
          valLower === "n/a" || 
          valLower === "untradable" || 
          valLower === "untradeable" || 
          valLower === "none" || 
          valLower.includes("untradable") || 
          valLower.includes("untradeable") || 
          entry.category === "untradables" || 
          entry.origin.toLowerCase().includes("untradable") ||
          entry.origin.toLowerCase().includes("untradeable")
        ) {
          continue;
        }
        
        rawItems.push(entry);
        count++;
      }
      console.log(`  ✓ Added ${count} tradable items from ${cat.slug}`);
    }
  }

  await browser.close();

  // UNIQUE KEYS SELECTION SYSTEM
  // We want to register each item under EXACTLY ONE unique key (the simplest unambiguous key).
  const keyToItemsMap = {};
  
  for (const item of rawItems) {
    const cleanName = item.name.toLowerCase();
    const type = item.type;
    const rarity = item.rarity;
    const year = item.year;

    // Candidates from simplest to most specific
    const keys = [];
    keys.push(cleanName);
    if (type !== "unknown") {
      keys.push(`${cleanName} (${type})`);
      if (year) {
        keys.push(`${cleanName} (${type}) (${year})`);
        keys.push(`${cleanName} (${year})`);
      }
      keys.push(`${cleanName} (${type}) (${rarity})`);
      if (year) {
        keys.push(`${cleanName} (${type}) (${rarity}) (${year})`);
      }
    } else {
      // If type is unknown, NEVER append (unknown)
      if (year) {
        keys.push(`${cleanName} (${year})`);
      }
      keys.push(`${cleanName} (${rarity})`);
      if (year) {
        keys.push(`${cleanName} (${rarity}) (${year})`);
      }
    }
    
    item.candidates = keys;

    for (const key of keys) {
      if (!keyToItemsMap[key]) {
        keyToItemsMap[key] = [];
      }
      keyToItemsMap[key].push(item);
    }
  }

  const finalItems = {};
  for (const item of rawItems) {
    let chosenKey = null;
    for (const key of item.candidates) {
      if (keyToItemsMap[key] && keyToItemsMap[key].length === 1) {
        chosenKey = key;
        break;
      }
    }
    // Fallback if there is a conflict at all levels (e.g. duplicate identical entries)
    if (!chosenKey) {
      chosenKey = item.candidates[item.candidates.length - 1];
    }
    
    finalItems[chosenKey] = {
      name: item.name,
      value: item.value,
      numericValue: item.numericValue,
      type: item.type,
      rarity: item.rarity,
      isChroma: item.isChroma,
      year: item.year,
      category: item.category,
      stability: item.stability,
      demand: item.demand,
      tier: item.tier
    };
  }

  const output = {
    lastUpdated: lastUpdated || formatDate(),
    scrapedAt: formatDate(),
    itemCount: Object.keys(finalItems).length,
    items: finalItems
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf8");
  console.log(`\n✓ Saved ${output.itemCount} resolved tradable keys → ${OUTPUT_FILE}`);
}

main().catch(console.error);
