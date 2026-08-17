const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");
const fs = require("fs");
const path = require("path");

const CATEGORIES = [
  { slug: "sets", name: "sets" },
  { slug: "uniques", name: "uniques" },
  { slug: "evos", name: "evos" },
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
  { slug: "miscellaneous", name: "misc" },
  { slug: "untradables", name: "untradables" },
];

const BASE_URL = "https://supremevalues.com/mm2/";
const OUTPUT_DIR = path.join(__dirname, "..", "public");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "values.json");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function formatDate(d = new Date()) {
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
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
  const m = s.match(/^x\s*(\d+(?:\.\d+)?)\s*T1\s+(Legendaries?|Rares?|Uncommons?|Commons?)/i);
  if (m) {
    const n = parseFloat(m[1]);
    const cls = m[2].toLowerCase();
    const unit =
      /legend/.test(cls) ? 0.2 :
      /rare/.test(cls) ? 0.05 :
      /uncommon/.test(cls) ? 0.01 :
      /common/.test(cls) ? 0.002 :
      0.01;
    return Math.round(n * unit * 10000) / 10000;
  }
  return null;
}

function pick(obj, ...keys) {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
  }
  return "N/A";
}

function normalizeEntry(name, info, category) {
  const value = pick(info, "value", "Value", "val");
  const range = pick(info, "range", "Range", "rangedValue", "ranged_value", "valueRange");
  const demand = pick(info, "demand", "Demand");
  const rarity = pick(info, "rarity", "Rarity");
  const stability = pick(info, "stability", "Stability");
  const change = pick(info, "change", "changeInValue", "Change", "lastChange", "valueChange");
  const origin = pick(info, "origin", "Origin");
  const aliases = pick(info, "aliases", "Aliases", "alias");
  const flippability = pick(info, "flippability", "Flippability");
  const chanceOfRising = pick(info, "chanceOfRising", "chance_of_rising", "risingChance");
  const itemClass = pick(info, "class", "Class");
  const expRequirement = pick(info, "expRequirement", "exp", "EXP");

  let displayName = String(name).trim();
  if (
    category === "chromas" &&
    !/^chroma\b/i.test(displayName)
  ) {
    displayName = "Chroma " + displayName;
  }

  return {
    name: displayName,
    value: value === "N/A" ? "N/A" : String(value).replace(/,/g, ""),
    numericValue: (function () {
      const n = convertXValue(value);
      return n === null ? null : n;
    })(),
    range: range === "N/A" ? "N/A" : String(range),
    demand: demand === "N/A" ? "N/A" : String(demand),
    rarity: rarity === "N/A" ? "N/A" : String(rarity),
    stability: stability === "N/A" ? "N/A" : String(stability),
    change: change === "N/A" ? "N/A" : String(change),
    origin: origin === "N/A" ? "N/A" : String(origin),
    aliases: aliases === "N/A" ? "N/A" : String(aliases),
    flippability: flippability === "N/A" ? "N/A" : String(flippability),
    chanceOfRising: chanceOfRising === "N/A" ? "N/A" : String(chanceOfRising),
    class: itemClass === "N/A" ? "N/A" : String(itemClass),
    expRequirement: expRequirement === "N/A" ? "N/A" : String(expRequirement),
    category,
  };
}

async function extractFromPage(page, categorySlug, categoryName) {
  const url = `${BASE_URL}${categorySlug}`;
  console.log(`Fetching: ${url}`);

  try {
    const resp = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
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
    await sleep(categorySlug === "evos" ? 3000 : 1500);

    const title = await page.title().catch(() => "");
    if (/just a moment|attention required|captcha|access denied/i.test(title)) {
      console.log(`  ✗ Blocked/challenge on ${categorySlug}`);
      return null;
    }

    const html = await page.content();
    let data = null;

    const match = html.match(/var\s+_svPopup\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/i);
    if (match) {
      try {
        let jsonStr = match[1].trim();
        if (jsonStr.endsWith(";")) jsonStr = jsonStr.slice(0, -1);
        data = JSON.parse(jsonStr);
        console.log(`  ✓ _svPopup for ${categorySlug} (${Object.keys(data).length} items)`);
      } catch (e) {
        console.log(`  ✗ JSON parse fail ${categorySlug}: ${e.message}`);
      }
    }

    if (!data) {
      try {
        data = await page.evaluate(() => {
          if (typeof _svPopup !== "undefined" && _svPopup && typeof _svPopup === "object") {
            return _svPopup;
          }
          return null;
        });
        if (data) {
          console.log(`  ✓ page context for ${categorySlug} (${Object.keys(data).length} items)`);
        }
      } catch (_) {}
    }

    if (!data) {
      console.log(`  ⚠ No _svPopup, trying DOM for ${categorySlug}...`);
      data = await page.evaluate(() => {
        const items = {};

        const addItem = (name, fields) => {
          if (!name) return;
          name = String(name).replace(/\s+/g, " ").trim();
          if (name.length < 2 || name.length > 80) return;
          if (/^[\d,]+(?:\.\d+)?$/.test(name)) return;
          if (/^(x\s*\d+|n\/a|priceless)/i.test(name)) return;
          if (/^(value|range|stability|demand|rarity|origin|aliases|change|ability|description|death effect|price|class|exp)/i.test(name)) return;
          if (/^(ability|description|death effect|price)\s*[-–]/i.test(name)) return;
          if (/^contains\s*-/i.test(name)) return;
          if (name.length > 60) return;
          if (/^(value|range|stability|demand|rarity|origin|aliases|change)/i.test(name)) return;

          if (/evolutions?$/i.test(name)) return;
          if (/^(value|demand|stability|range|categories|special tier|tier \d|search|filter|changelog)/i.test(name)) return;
          if (/^(inv\.|controls|\+1|-1|~)$/i.test(name)) return;

          const prev = items[name];
          const next = {
            value: fields.value ?? "N/A",
            range: fields.range ?? "N/A",
            demand: fields.demand ?? "N/A",
            rarity: fields.rarity ?? "N/A",
            stability: fields.stability ?? "N/A",
            change: fields.change ?? "N/A",
            origin: fields.origin ?? "N/A",
            aliases: fields.aliases ?? "N/A",
          };
          if (!prev || (prev.value === "N/A" && next.value !== "N/A")) {
            items[name] = next;
          }
        };

        const cleanWindowText = (text) => {
          const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
          if (lines.length <= 1) return text;
          const cleaned = [lines[0]];
          for (let j = 1; j < lines.length; j++) {
            const currentLine = lines[j];
            const isFieldOrHeader = /^(value|demand|rarity|stability|range|origin|change|aliases|class|exp|special tier|default tier|[\w\s]+tier|tier \d|inv\.\s*controls)/i.test(currentLine) ||
              /^[\[\]()\d\s,.-]+$/.test(currentLine) ||
              currentLine.length < 2 ||
              currentLine.length > 60 ||
              /^[\d,]+(?:\.\d+)?$/.test(currentLine);
            if (!isFieldOrHeader) {
              break;
            }
            cleaned.push(currentLine);
          }
          return cleaned.join("\n");
        };

        const parseTextFields = (text) => {
          const t = cleanWindowText(text || "");
          const valueMatch = t.match(
            /Value\s*[-–:]?\s*\**\s*(Priceless|[0-9,]+(?:\.\d+)?|N\/A|x[\d\w\s\.]+)/i
          );
          const rangeMatch = t.match(/Range\s*[-–:]?\s*(\[?[^\n\]]{0,40}\]?)/i);
          const demandMatch = t.match(/Demand\s*[-–:]?\s*\**\s*(\d+(?:\.\d+)?)/i);
          const rarityMatch = t.match(/Rarity\s*[-–:]?\s*\**\s*(\d+(?:\.\d+)?)/i);
          const stabilityMatch = t.match(
            /Stability\s*[-–:]?\s*\**\s*([A-Za-z][A-Za-z\s]{0,30})/i
          );
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
            aliases: aliasesMatch ? aliasesMatch[1].trim() : "N/A",
          };
        };

        const cards = document.querySelectorAll(
          "[data-item], .item-card, .value-card, .item, article, [class*='Item'], [class*='card']"
        );
        cards.forEach((card) => {
          const nameEl =
            card.querySelector(
              ".item-name, .name, h3, h4, [class*='name'], strong, b, a"
            ) || card;
          let name = (nameEl.textContent || "").trim().split("\n")[0].trim();
          if (!name || name.length < 2) {
            const img = card.querySelector("img[alt]");
            if (img && img.alt) name = img.alt.trim();
          }
          addItem(name, parseTextFields(card.innerText || ""));
        });

        document.querySelectorAll("table tr, tr").forEach((row) => {
          const cells = row.querySelectorAll("td, th");
          if (!cells.length) return;
          const rowText = row.innerText || "";
          if (!/Value\s*[-–:]/i.test(rowText) && !/Priceless/i.test(rowText)) return;

          let name = "";
          const link = row.querySelector("a");
          const strong = row.querySelector("strong, b");
          const img = row.querySelector("img[alt]");
          if (link && link.textContent.trim().length > 1) name = link.textContent.trim();
          else if (strong && strong.textContent.trim().length > 1) name = strong.textContent.trim();
          else if (img && img.alt) name = img.alt.trim();
          else {
            for (const line of rowText.split("\n").map((l) => l.trim()).filter(Boolean)) {
              if (!/^(value|demand|rarity|stability|range|origin|change)/i.test(line)) {
                name = line.replace(/\s*Value\s*[-–:].*$/i, "").trim();
                break;
              }
            }
          }
          name = name.replace(/\s*Value\s*[-–:].*$/i, "").trim();
          addItem(name, parseTextFields(rowText));
        });

        const bodyText = document.body.innerText || "";
        if (Object.keys(items).length < 5) {
          const blocks = bodyText.split(/\n{2,}/);
          for (const block of blocks) {
            if (!/Value\s*[-–:]/i.test(block) && !/Priceless/i.test(block)) continue;
            const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
            if (lines.length < 1) continue;
            let name = lines[0].replace(/\s*Value\s*[-–:].*$/i, "").trim();
            if (/Value|Demand|Stability|Range|CATEGORIES|Special Tier|Tier /i.test(name) && lines.length > 1) {
              name = lines[0];
            }
            addItem(name, parseTextFields(block));
          }
        }

        {
          const body = document.body.innerText || "";
          const re = /([A-Za-z0-9][A-Za-z0-9'\- ]{0,40}?)\s*\(\s*((?:Var(?:iant)?|V)\.?\s*\d+)\s*\)/gi;
          let m;
          const seen = new Set();
          while ((m = re.exec(body)) !== null) {
            const base = m[1].trim();
            if (/evolutions?$/i.test(base)) continue;
            const label = m[2].replace(/\s+/g, " ").trim();
            const fullName = base + " (" + label + ")";
            const key = fullName.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            const window = body.slice(m.index, m.index + 400);
            addItem(fullName, parseTextFields(window));
          }
        }

        return Object.keys(items).length > 0 ? items : null;
      });
      if (data) {
        console.log(`  ✓ DOM for ${categorySlug} (${Object.keys(data).length} items)`);
      } else {
        console.log(`  ✗ Failed ${categorySlug}`);
      }
    }

    try {
      const domItems = await page.evaluate(() => {
        const items = {};
        const add = (name, fields) => {
          if (!name) return;
          name = String(name).replace(/\s+/g, " ").trim();
          if (name.length < 2 || name.length > 80) return;
          if (/^[\d,]+(?:\.\d+)?$/.test(name)) return;
          if (/^(x\s*\d+|n\/a|priceless)/i.test(name)) return;
          if (/^(value|range|stability|demand|rarity|origin|aliases|change)/i.test(name)) return;

          if (/evolutions?$/i.test(name)) return;
          if (/^(value|demand|stability|range|categories|special tier|default tier|tier \d|search|filter|changelog|effects|radios|emotes|powers|controls|inv\.)$/i.test(name)) return;
          if (/^(\+1|-1|~)$/i.test(name)) return;
          const prev = items[name];
          if (!prev || (String(prev.value) === "N/A" && fields.value && fields.value !== "N/A")) {
            items[name] = fields;
          }
        };

        const cleanWindowText = (text) => {
          const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
          if (lines.length <= 1) return text;
          const cleaned = [lines[0]];
          for (let j = 1; j < lines.length; j++) {
            const currentLine = lines[j];
            const isFieldOrHeader = /^(value|demand|rarity|stability|range|origin|change|aliases|class|exp|special tier|default tier|[\w\s]+tier|tier \d|inv\.\s*controls)/i.test(currentLine) ||
              /^[\[\]()\d\s,.-]+$/.test(currentLine) ||
              currentLine.length < 2 ||
              currentLine.length > 60 ||
              /^[\d,]+(?:\.\d+)?$/.test(currentLine);
            if (!isFieldOrHeader) {
              break;
            }
            cleaned.push(currentLine);
          }
          return cleaned.join("\n");
        };

        const fieldsFrom = (text) => {
          const t = cleanWindowText(text || "");
          const valueMatch = t.match(/Value\s*[-–:]?\s*\**\s*(Priceless|N\/A|[0-9,]+(?:\.\d+)?|x[\d\w\s\.]+)/i);
          const rangeMatch = t.match(/Range\s*[-–:]?\s*(\[?[^\n\]]{0,40}\]?)/i);
          const demandMatch = t.match(/Demand\s*[-–:]?\s*\**\s*(\d+(?:\.\d+)?)/i);
          const rarityMatch = t.match(/Rarity\s*[-–:]?\s*\**\s*(\d+(?:\.\d+)?)/i);
          const stabilityMatch = t.match(/Stability\s*[-–:]?\s*\**\s*([A-Za-z][A-Za-z\s]{0,30})/i);
          const changeMatch = t.match(/Change\s+in\s+Value\s*[-–:]?\s*([^\n]{0,50})/i);
          const originMatch = t.match(/Origin\s*[-–:]?\s*([^\n]{0,100})/i);
          const aliasesMatch = t.match(/Aliases?\s*[-–:]?\s*([^\n]{0,60})/i);
          const classMatch = t.match(/Class\s*[-–:]?\s*([A-Za-z][A-Za-z\s]{0,20})/i);
          const expMatch = t.match(/EXP\s*Requirement\s*[-–:]?\s*([0-9,.KMkm]+|None)/i);
          return {
            value: valueMatch ? valueMatch[1].replace(/,/g, "").replace(/\*/g, "").trim() : "N/A",
            range: rangeMatch ? rangeMatch[1].trim() : "N/A",
            demand: demandMatch ? demandMatch[1] : "N/A",
            rarity: rarityMatch ? rarityMatch[1] : "N/A",
            stability: stabilityMatch ? stabilityMatch[1].trim() : "N/A",
            change: changeMatch ? changeMatch[1].trim() : "N/A",
            origin: originMatch ? originMatch[1].trim() : "N/A",
            aliases: aliasesMatch ? aliasesMatch[1].trim() : "N/A",
            class: classMatch ? classMatch[1].trim() : "N/A",
            expRequirement: expMatch ? expMatch[1].trim() : "N/A",
          };
        };

        document.querySelectorAll(
          "[data-item], .item-card, .value-card, article, [class*='Item'], [class*='card'], [class*='item']"
        ).forEach((el) => {
          const t = el.innerText || "";
          if (!/Demand\s*[-–:]|Value\s*[-–:]|Rarity\s*[-–:]|Origin\s*[-–:]|Priceless|Class\s*[-–:]|EXP\s*Requirement/i.test(t)) return;
          let name = "";
          const named = el.querySelector("a, h3, h4, strong, b, [class*='name']");
          if (named) name = (named.textContent || "").trim().split("\n")[0].trim();
          if (!name) {
            const img = el.querySelector("img[alt]");
            if (img) name = (img.alt || "").trim();
          }
          if (!name) {
            for (const line of t.split("\n").map((l) => l.trim()).filter(Boolean)) {
              if (!/^(value|demand|rarity|stability|range|origin|change|aliases)/i.test(line)) {
                name = line.replace(/\s*Value\s*[-–:].*$/i, "").trim();
                break;
              }
            }
          }
          add(name, fieldsFrom(t));
        });

        document.querySelectorAll("tr").forEach((row) => {
          const t = row.innerText || "";
          if (!/Demand\s*[-–:]|Value\s*[-–:]|Rarity\s*[-–:]|Priceless|Origin\s*[-–:]|Class\s*[-–:]|EXP\s*Requirement/i.test(t)) return;
          let name = "";
          const a = row.querySelector("a, strong, b");
          const img = row.querySelector("img[alt]");
          if (a) name = a.textContent.trim();
          else if (img) name = img.alt.trim();
          else {
            for (const line of t.split("\n").map((l) => l.trim()).filter(Boolean)) {
              if (!/^(value|demand|rarity|stability|range|origin|change)/i.test(line)) {
                name = line.replace(/\s*Value\s*[-–:].*$/i, "").trim();
                break;
              }
            }
          }
          add(name, fieldsFrom(t));
        });

        const body = document.body.innerText || "";
        const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const window = lines.slice(i, i + 8).join("\n");
          const hasMeta = /Demand\s*[-–:]|Value\s*[-–:]|Priceless|Origin\s*[-–:]|Class\s*[-–:]|EXP\s*Requirement/i.test(window);
          if (!hasMeta) continue;
          if (/^(value|demand|rarity|stability|range|origin|change|aliases|special tier|default tier|tier \d)/i.test(line)) continue;
          if (/^x\s*\d+/i.test(line)) continue;
          if (line.length < 2 || line.length > 60) continue;
          if (/^[\d,]+(?:\.\d+)?$/.test(line)) continue;
          if (/^[\[\]()\d\s,.-]+$/.test(line)) continue;
          const next = lines[i + 1] || "";
          if (!/^(value|demand|rarity|stability|range|origin|change|aliases)/i.test(next) && !/Priceless/i.test(window)) {
            if (!/Demand\s*[-–:]/i.test(window)) continue;
          }
          add(line.replace(/\s*Value\s*[-–:].*$/i, "").trim(), fieldsFrom(window));
        }

        {
          const body = document.body.innerText || "";
          const re = /([A-Za-z0-9][A-Za-z0-9'\- ]{0,40}?)\s*\(\s*((?:Var(?:iant)?|V)\.?\s*\d+)\s*\)/gi;
          let m;
          const seen = new Set();
          while ((m = re.exec(body)) !== null) {
            const base = m[1].trim();
            if (/evolutions?$/i.test(base)) continue;
            const label = m[2].replace(/\s+/g, " ").trim();
            const fullName = `${base} (${label})`;
            const key = fullName.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            const window = body.slice(m.index, m.index + 400);
            add(fullName, fieldsFrom(window));
          }
        }

        return Object.keys(items).length ? items : null;
      });

      if (domItems) {
        data = data || {};
        let added = 0;
        for (const [name, info] of Object.entries(domItems)) {
          if (!data[name]) {
            data[name] = info;
            added++;
          }
        }
        if (added) console.log(`  + DOM merge added ${added} items for ${categorySlug}`);
      }
    } catch (e) {
      console.log(`  DOM merge skip: ${e.message}`);
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
    const match = text.match(
      /Values?\s+Last\s+Updated\s*[-–:]\s*([^\n/]+?)(?:\s*\/\/|\s*$)/i
    );
    if (match) return match[1].trim();
    const fallback = text.match(/Values?\s+Last\s+Updated\s*[-–:]\s*([^\n]+)/i);
    if (fallback) {
      return fallback[1].split("//")[0].trim();
    }
    return null;
  } catch {
    return null;
  }
}

async function main() {
  console.log("Supreme Values scraper — ALL categories\n");

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  let previous = null;
  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      previous = JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf8"));
    } catch (_) {}
  }

  chromium.setHeadlessMode = true;
  chromium.setGraphicsMode = false;

  let executable = null;
  let useChromiumArgs = true;

  if (process.platform === "win32") {
    useChromiumArgs = false;
    const edgeWin = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
    const chromeWin = "C:/Program Files/Google/Chrome/Application/chrome.exe";
    const chromeWin86 = "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe";
    if (fs.existsSync(edgeWin)) executable = edgeWin;
    else if (fs.existsSync(chromeWin)) executable = chromeWin;
    else if (fs.existsSync(chromeWin86)) executable = chromeWin86;
  } else {
    try {
      executable = await chromium.executablePath();
    } catch (_) {
      useChromiumArgs = false;
    }
  }

  const browser = await puppeteer.launch({
    args: useChromiumArgs ? chromium.args : [],
    defaultViewport: { width: 1366, height: 768 },
    executablePath: executable,
    headless: useChromiumArgs ? chromium.headless : true,
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });

  const allItems = {};
  let total = 0;
  const failed = [];
  const seenSlugs = new Set();

  for (const cat of CATEGORIES) {
    if (seenSlugs.has(cat.slug)) continue;
    seenSlugs.add(cat.slug);

    const data = await extractFromPage(page, cat.slug, cat.name);
    if (data && typeof data === "object") {
      for (const [name, info] of Object.entries(data)) {
        const entry = normalizeEntry(name, info || {}, cat.name);
        const key = entry.name.toLowerCase().trim();
        if (/^[\d,]+(?:\.\d+)?$/.test(key)) continue;
        if (/^(ability|description|death effect|price|contains)\s*[-–]/i.test(key)) continue;
        if (/^(value|range|stability|demand|rarity)$/i.test(key)) continue;
        if (key.length > 60) continue;
        if (/^(x\d+|n\/a|priceless|value|range|stability|demand|rarity)$/i.test(key)) continue;
        if (key.length < 2) continue;
        const uniqKey = `${key}_${entry.category}`;
        if (!allItems[uniqKey]) {
          allItems[uniqKey] = entry;
          total++;
        } else if (allItems[uniqKey].value === "N/A" && entry.value !== "N/A") {
          allItems[uniqKey] = entry;
        }
      }
    } else {
      failed.push(cat.slug);
    }
  }

  const lastUpdated = await getLastUpdated(page);
  await browser.close();

  if (total < 10 && previous && previous.items && Object.keys(previous.items).length > 0) {
    console.warn("Scrape returned too few items — keeping previous JSON");
    process.exit(0);
  }

  const getBaseName = (name) => {
    let base = name.replace(/\s*\[[^\]]+\]/g, "");
    base = base.replace(/\s*\((?:gun|knife|radio|effect|pet|variant\s*\d+|v\.?\s*\d+)\)/i, "");
    base = base.replace(/\s*(?:gun|knife|radio|effect|pet|set)$/i, "");
    return base.trim().toLowerCase();
  };

  const groups = {};
  for (const entry of Object.values(allItems)) {
    const base = getBaseName(entry.name);
    if (!groups[base]) groups[base] = [];
    groups[base].push(entry);
  }

  const processedItems = {};
  const categoryMap = {
    sets: "Set",
    uniques: "Unique",
    evos: "Evo",
    ancients: "Ancient",
    vintages: "Vintage",
    chromas: "Chroma",
    godlies: "Godly",
    legendaries: "Legendary",
    rares: "Rare",
    uncommons: "Uncommon",
    commons: "Common",
    pets: "Pet",
    misc: "Misc",
    untradables: "Untradable"
  };

  for (const [base, group] of Object.entries(groups)) {
    if (group.length > 1) {
      for (const entry of group) {
        let typeSuffix = "";
        const lowerName = entry.name.toLowerCase();
        if (lowerName.includes("gun")) typeSuffix = "Gun";
        else if (lowerName.includes("knife")) typeSuffix = "Knife";
        else if (lowerName.includes("pet") || entry.category === "pets") typeSuffix = "Pet";
        else if (lowerName.includes("radio")) typeSuffix = "Radio";
        else if (lowerName.includes("effect")) typeSuffix = "Effect";
        else if (lowerName.includes("set") || entry.category === "sets") typeSuffix = "Set";
        else {
          if (["godlies", "vintages", "ancients", "chromas", "legendaries", "rares", "uncommons", "commons"].includes(entry.category)) {
            typeSuffix = "Knife";
          }
        }

        const raritySuffix = categoryMap[entry.category] || entry.category;

        let newName = entry.name;
        newName = newName.replace(/\s*\((?:godly|godlies|rare|rares|uncommon|uncommons|common|commons|legendary|legendaries|vintage|vintages|ancient|ancients|evo|evos|unique|uniques|pet|pets|misc|untradable|untradables)\)/i, "");

        const hasType = newName.toLowerCase().includes(typeSuffix.toLowerCase());
        const suffixParts = [];
        if (typeSuffix && !hasType) {
          suffixParts.push(typeSuffix);
        }
        if (raritySuffix && !suffixParts.includes(raritySuffix)) {
          suffixParts.push(raritySuffix);
        }

        newName = `${newName} (${suffixParts.join(" ")})`;

        entry.name = newName;
        const newKey = newName.toLowerCase().trim();
        processedItems[newKey] = entry;
      }
    } else {
      const entry = group[0];
      const key = entry.name.toLowerCase().trim();
      processedItems[key] = entry;
    }
  }

  const output = {
    lastUpdated: lastUpdated || formatDate(),
    scrapedAt: formatDate(),
    itemCount: Object.keys(processedItems).length,
    categoriesScraped: [...seenSlugs].filter((s) => !failed.includes(s)),
    failedCategories: failed,
    madeBy: "Namedadude",
    items: processedItems,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf8");
  console.log(`\n✓ Saved ${output.itemCount} items → ${OUTPUT_FILE}`);
  if (lastUpdated) console.log(`  Site last updated: ${lastUpdated}`);
  if (failed.length) console.log(`  Failed: ${failed.join(", ")}`);

  const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="dark" />
  <title>Supreme Values JSON</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      max-width: 720px;
      margin: 0 auto;
      padding: 48px 20px;
      background: #0f0f12;
      color: #e8e8ed;
      line-height: 1.5;
      min-height: 100vh;
    }
    h1 { font-size: 1.6rem; font-weight: 700; margin: 0 0 8px; color: #fff; }
    p { margin: 10px 0; color: #b8b8c0; }
    strong { color: #e8e8ed; }
    a { color: #7eb8ff; text-decoration: none; }
    a:hover { text-decoration: underline; }
    code {
      background: #1c1c24;
      color: #a8d4ff;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 0.95em;
      border: 1px solid #2a2a35;
    }
    .card {
      background: #18181f;
      border: 1px solid #2a2a35;
      border-radius: 12px;
      padding: 20px 22px;
      margin-top: 24px;
    }
    .muted { color: #888899; font-size: 0.9rem; }
    .stat { display: flex; gap: 8px; flex-wrap: wrap; margin: 6px 0; }
    .stat span {
      background: #1c1c24;
      border: 1px solid #2a2a35;
      border-radius: 8px;
      padding: 6px 12px;
      font-size: 0.9rem;
      color: #c8c8d0;
    }
  </style>
</head>
<body>
  <h1>Supreme Values MM2</h1>
  <p class="muted">Auto-updated item values mirror</p>
  <div class="card">
    <div class="stat">
      <span><strong>Items:</strong> ${output.itemCount}</span>
      <span><strong>Site update:</strong> ${lastUpdated || "—"}</span>
    </div>
    <p><strong>Scraped at:</strong> ${output.scrapedAt}</p>
    <p>JSON endpoint: <a href="/values.json"><code>/values.json</code></a></p>
    <p class="muted">Made by <strong>Namedadude</strong></p>
  </div>
</body>
</html>`;
  fs.writeFileSync(path.join(OUTPUT_DIR, "index.html"), indexHtml, "utf8");
}

main().catch((err) => {
  console.error(err);
  if (fs.existsSync(OUTPUT_FILE)) {
    console.warn("Scrape error but previous values.json exists — build continues");
    process.exit(0);
  }
  process.exit(1);
});
