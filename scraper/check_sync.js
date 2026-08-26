const puppeteer = require("puppeteer-core");

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

  console.log("Checking uncommons...");
  await page.goto("https://supremevalues.com/mm2/uncommons", { waitUntil: "domcontentloaded", timeout: 60000 });
  await new Promise(r => setTimeout(r, 3000));
  
  const uncommons = await page.evaluate(() => {
    if (typeof _svPopup !== 'undefined' && _svPopup) {
      return Object.keys(_svPopup);
    }
    return [];
  });
  console.log("Uncommons count:", uncommons.length);
  console.log("Matches 'gold':", uncommons.filter(x => x.toLowerCase().includes("gold")));
  console.log("Matches 'cat':", uncommons.filter(x => x.toLowerCase().includes("cat")));

  await browser.close();
}

main().catch(console.error);
