const puppeteer = require("puppeteer-core");
const fs = require("fs");

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

  console.log("Fetching Godlies...");
  await page.goto("https://supremevalues.com/mm2/godlies", { waitUntil: "domcontentloaded", timeout: 60000 });
  await new Promise(r => setTimeout(r, 3000));
  const godliesRainbow = await page.evaluate(() => {
    const items = [];
    document.querySelectorAll("*").forEach(el => {
      const text = el.innerText || "";
      if (text.toLowerCase().includes("rainbow") && (el.className.includes("card") || el.className.includes("item") || el.tagName === "TR")) {
        items.push({
          tag: el.tagName,
          class: el.className,
          text: text.substring(0, 200).replace(/\n/g, " | ")
        });
      }
    });
    return items;
  });
  console.log("Godlies containing Rainbow (first 5):", godliesRainbow.slice(0, 5));

  console.log("\nFetching Rares...");
  await page.goto("https://supremevalues.com/mm2/rares", { waitUntil: "domcontentloaded", timeout: 60000 });
  await new Promise(r => setTimeout(r, 3000));
  const raresRainbow = await page.evaluate(() => {
    const items = [];
    document.querySelectorAll("*").forEach(el => {
      const text = el.innerText || "";
      if (text.toLowerCase().includes("rainbow") && (el.className.includes("card") || el.className.includes("item") || el.tagName === "TR")) {
        items.push({
          tag: el.tagName,
          class: el.className,
          text: text.substring(0, 200).replace(/\n/g, " | ")
        });
      }
    });
    return items;
  });
  console.log("Rares containing Rainbow (first 5):", raresRainbow.slice(0, 5));

  await browser.close();
}

main().catch(console.error);
