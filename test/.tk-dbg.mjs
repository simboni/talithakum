import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { chromium, devices } from "playwright";
const here = "/workspace/talithakum/test";
const MIME={".html":"text/html",".js":"text/javascript",".css":"text/css",".pdf":"application/pdf",".png":"image/png",".json":"application/json"};
const server=createServer(async(req,res)=>{let p=decodeURIComponent(req.url.split("?")[0]);if(p==="/")p="/harness.html";try{const b=await readFile(join(here,p));res.writeHead(200,{"Content-Type":MIME[extname(p)]||"application/octet-stream"});res.end(b);}catch{res.writeHead(404).end("nf");}});
await new Promise(r=>server.listen(4199,r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||"/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
const ctx=await browser.newContext({...devices["Galaxy S9+"],viewport:{width:320,height:568},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:"reduce"});
const page=await ctx.newPage();
await page.goto("http://127.0.0.1:4199/",{waitUntil:"networkidle"});
await page.waitForSelector(".tkpub-card");
await page.locator("#tkpub-grid .tkpub-card [data-open]").first().click();
await page.waitForSelector("#tkpub-modal.is-open");
await page.waitForTimeout(2500);
console.log("--- reader interactive element sizes @320 ---");
console.log(await page.evaluate(()=>{
  const out=[];
  document.querySelectorAll('#tkpub-modal button, #tkpub-modal a, #tkpub-modal input, #tkpub-modal select').forEach(el=>{
    const cs=getComputedStyle(el); const r=el.getBoundingClientRect();
    out.push({t:el.tagName+"."+el.className, d:cs.display, w:Math.round(r.width*10)/10, h:Math.round(r.height*10)/10, op:cs.opacity});
  });
  return out;
}));
console.log("matchMedia 380:", await page.evaluate(()=>matchMedia("(max-width: 380px)").matches), "innerWidth", await page.evaluate(()=>innerWidth), "clientWidth", await page.evaluate(()=>document.documentElement.clientWidth));
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
// admin
await page.locator("#tkpub-admin [data-toggle]").first().click();
await page.waitForTimeout(300);
await page.fill("#tkpub-user","communications");
await page.fill("#tkpub-pass","abcd efgh ijkl mnop qrst uvwx");
await page.click("#tkpub-login-form button[type=submit]");
await page.waitForSelector("#tkpub-form",{state:"visible"});
await page.waitForTimeout(500);
console.log("--- widest elements in admin form @320 ---");
console.log(await page.evaluate(()=>{
  const vw=document.documentElement.clientWidth; const out=[];
  document.querySelectorAll("#tkpub-admin *").forEach(el=>{
    const r=el.getBoundingClientRect(); const cs=getComputedStyle(el);
    if(cs.display==="none")return;
    if(r.right>vw+1||el.scrollWidth>vw+1) out.push({t:el.tagName+"#"+el.id+"."+String(el.className).slice(0,40), right:Math.round(r.right), w:Math.round(r.width), sw:el.scrollWidth, ovx:cs.overflowX});
  });
  return out.slice(0,25);
}));
console.log("doc:", await page.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,bodySw:document.body.scrollWidth})));
await browser.close(); server.close();
