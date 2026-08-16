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

  const url = "https://supremevalues.com/mm2/commons";
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await new Promise(r => setTimeout(r, 4000));

  const textAndLines = await page.evaluate(() => {
    const body = document.body.innerText || "";
    const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
    
    // Find index of Default Knife
    const knifeIdx = lines.findIndex(l => l.toLowerCase().includes("default knife"));
    const gunIdx = lines.findIndex(l => l.toLowerCase().includes("default gun"));
    
    return {
      knifeIdx,
      gunIdx,
      knifeLines: knifeIdx !== -1 ? lines.slice(knifeIdx, knifeIdx + 15) : null,
      gunLines: gunIdx !== -1 ? lines.slice(gunIdx, gunIdx + 15) : null,
    };
  });

  console.log("Default Knife lines:");
  console.log(textAndLines.knifeLines);
  console.log("\nDefault Gun lines:");
  console.log(textAndLines.gunLines);

  await browser.close();
}

main().catch(console.error);
