const puppeteer = require("puppeteer-core");

const CATEGORIES = [
  "sets", "uniques", "evos", "ancients", "vintages", "chromas",
  "godlies", "legendaries", "rares", "uncommons", "commons",
  "pets", "misc", "untradables"
];

async function main() {
  const browser = await puppeteer.launch({
    args: [],
    defaultViewport: { width: 1366, height: 768 },
    executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true,
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );

  for (const cat of CATEGORIES) {
    const url = `https://supremevalues.com/mm2/${cat}`;
    console.log(`Checking ${cat}...`);
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      await new Promise(r => setTimeout(r, 3000));
      
      const keys = await page.evaluate(() => {
        if (typeof _svPopup !== 'undefined' && _svPopup) {
          return Object.keys(_svPopup);
        }
        return [];
      });
      
      const matches = keys.filter(k => k.toLowerCase().includes("gold") || k.toLowerCase().includes("cat"));
      if (matches.length > 0) {
        console.log(`  Found in ${cat}:`, matches);
      }
    } catch (e) {
      console.error(`  Error in ${cat}:`, e.message);
    }
  }

  await browser.close();
}

main().catch(console.error);
