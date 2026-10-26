import fs from "node:fs";
import { createRequire } from "node:module";

const ROOT = "/home/negt/MIS/kyc-flow/walkthrough";
const DECK = "/tmp/kyc-guide";
const require = createRequire("/tmp/guide-deck/package.json");
const puppeteer = require("puppeteer-core");

const CHROME = "/root/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome";
const BASE = "http://127.0.0.1:4077";
const OUT = `${DECK}/rec`;
const CARDS = `${BASE}/cards.html`;
const APP = `${BASE}/app.html`;

fs.mkdirSync(OUT, { recursive: true });
fs.copyFileSync("/home/negt/MIS/kyc-flow/neweast-logo.png", `${ROOT}/logo.png`);

const HUD = `
(() => {
  const mount = () => {
    if (location.pathname.includes("cards.html")) return;
    let b = document.getElementById("__hud");
    if (!b) {
      b = document.createElement("div");
      b.id = "__hud";
      b.innerHTML = '<div class="k">NEWEAST · Know Your Customer</div><div class="l"><span class="r"></span><span class="dot"> · </span><span class="s"></span></div>';
      Object.assign(b.style, {
        position: "fixed", top: "10px", left: "50%", transform: "translateX(-50%)", zIndex: "2147483640",
        pointerEvents: "none", background: "rgba(30,24,24,.92)", color: "#fff",
        borderRadius: "999px", padding: "8px 18px", fontFamily: "Arial, sans-serif",
        boxShadow: "0 8px 24px rgba(0,0,0,.22)", textAlign: "center", minWidth: "460px",
      });
      const style = document.createElement("style");
      style.textContent = "#__hud .k{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#f3b4b5;font-weight:700}#__hud .l{font-size:15px;margin-top:2px;font-weight:700}#__hud .r{color:#fff}#__hud .s{color:#f3dede;font-weight:500}";
      document.documentElement.appendChild(style);
      document.documentElement.appendChild(b);
    }
    const role = window.__hudRole || "";
    const screen = window.__hudScreen || "";
    b.style.display = role ? "block" : "none";
    const r = b.querySelector(".r");
    const s = b.querySelector(".s");
    const d = b.querySelector(".dot");
    if (r) r.textContent = role;
    if (s) s.textContent = screen;
    if (d) d.style.display = screen ? "inline" : "none";
  };
  const run = () => mount();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
  setInterval(run, 400);
})();
`;

const CURSOR = `
(() => {
  const mount = () => {
    if (document.getElementById("__cur")) return;
    const c = document.createElement("div");
    c.id = "__cur";
    c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2l16 9-7 2-3 7z" fill="#1e1818" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    const x = window.__cx ?? innerWidth / 2;
    const y = window.__cy ?? innerHeight / 2;
    Object.assign(c.style, {
      position: "fixed", left: x + "px", top: y + "px", zIndex: 2147483647, pointerEvents: "none",
      transition: "left .65s cubic-bezier(.2,.7,.2,1), top .65s cubic-bezier(.2,.7,.2,1)",
      filter: "drop-shadow(0 2px 3px rgba(0,0,0,.25))",
    });
    document.documentElement.appendChild(c);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
  new MutationObserver(mount).observe(document.documentElement, { childList: true, subtree: false });
})();
`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const captions = [];
let t0 = 0;
const cap = (text) => {
  captions.push({ at: (Date.now() - t0) / 1000, text });
  console.log(((Date.now() - t0) / 1000).toFixed(1), text);
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars", "--window-size=1680,840"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1680, height: 840, deviceScaleFactor: 1 });
await page.evaluateOnNewDocument(CURSOR);
await page.evaluateOnNewDocument(HUD);
page.setDefaultTimeout(20000);

async function ensureCursor() {
  await page.evaluate(CURSOR);
  await page.evaluate(HUD);
}

async function setHud(role, screen) {
  await page.evaluate(
    (role, screen) => {
      window.__hudRole = role;
      window.__hudScreen = screen;
    },
    role,
    screen,
  );
  await page.evaluate(HUD);
}

async function openApp(role, screen) {
  await page.goto(APP, { waitUntil: "load" });
  await setHud(role, screen);
  await ensureCursor();
  await sleep(700);
}

async function moveTo(handle) {
  await handle.evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" }));
  await sleep(400);
  await ensureCursor();
  const box = await handle.boundingBox();
  if (!box) return null;
  const x = box.x + Math.min(box.width / 2, 40);
  const y = box.y + box.height / 2;
  await page.evaluate(
    (x, y) => {
      window.__cx = x;
      window.__cy = y;
      const c = document.getElementById("__cur");
      if (c) {
        c.style.left = x + "px";
        c.style.top = y + "px";
      }
    },
    x,
    y,
  );
  await sleep(650);
  return { x, y };
}

async function ripple() {
  await page.evaluate(() => {
    const c = document.getElementById("__cur");
    if (!c) return;
    const r = document.createElement("div");
    Object.assign(r.style, {
      position: "fixed",
      left: parseFloat(c.style.left) - 16 + "px",
      top: parseFloat(c.style.top) - 16 + "px",
      width: "32px",
      height: "32px",
      borderRadius: "50%",
      background: "rgba(181,30,33,.35)",
      zIndex: 2147483646,
      pointerEvents: "none",
      transition: "transform .45s ease, opacity .45s ease",
    });
    document.documentElement.appendChild(r);
    requestAnimationFrame(() => {
      r.style.transform = "scale(1.8)";
      r.style.opacity = "0";
    });
    setTimeout(() => r.remove(), 500);
  });
}

async function find(selector) {
  return page.waitForSelector(selector, { visible: true });
}

async function click(handle) {
  await moveTo(handle);
  await ripple();
  await handle.click();
  await sleep(350);
}

async function point(handle, ms = 1100) {
  await moveTo(handle);
  await sleep(ms);
}

async function type(handle, value) {
  await moveTo(handle);
  await ripple();
  await handle.click({ clickCount: 3 });
  await page.keyboard.press("Backspace");
  await handle.type(value, { delay: 32 });
  await sleep(180);
}

async function scene(name, ms = 1) {
  await page.goto(`${CARDS}?scene=${name}`, { waitUntil: "load" });
  await sleep(ms);
}

async function narrate(text, pad = 1500) {
  cap(text);
  const spoken = text.replace(/ — /g, ". ");
  await sleep(Math.max(3600, Math.round((spoken.length / 11) * 1000) + pad));
}

fs.rmSync(`${OUT}/frames`, { recursive: true, force: true });
fs.mkdirSync(`${OUT}/frames`, { recursive: true });
const frames = [];
const cdp = await page.createCDPSession();
cdp.on("Page.screencastFrame", async (frame) => {
  const file = `${OUT}/frames/${String(frames.length).padStart(6, "0")}.jpg`;
  fs.writeFileSync(file, Buffer.from(frame.data, "base64"));
  frames.push({ file, ts: frame.metadata.timestamp });
  await cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => {});
});

await page.goto(`${CARDS}?scene=intro`, { waitUntil: "load" });
t0 = Date.now();
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 86, maxWidth: 1680, maxHeight: 840, everyNthFrame: 1 });

await narrate("This is Know Your Customer at NEWEAST. The live path takes a new customer from a sales lead to the SAP Business One master.");
await scene("roles", 700);
await narrate("Watch the role on screen. Sales creates the lead. The customer fills KYC. Sales, then the sales manager, then Finance. SAP B1 is last.");
await narrate("This recording is dummy. No live post. Email and WhatsApp stay on sakour at neweast.co. No other mailbox is used.");

await scene("lead", 1);
await narrate("Chapter one. Sales creates the lead, then sends the KYC link.");

await openApp("Sales", "Leads");
await narrate("Sales — The dummy inbox holds one case. DEMO-KYC-00041. Oasis Demo Trading LLC.");
await click(await find("#btn-open-create"));
await setHud("Sales", "New lead");
await narrate("Sales — Capture the legal name, the contact, and the mailbox that will receive the KYC link.");
await type(await find("#f-name"), "Oasis Demo Trading LLC");
await type(await find("#f-contact"), "Demo Contact");
await type(await find("#f-email"), "sakour@neweast.co");
await type(await find("#f-wa"), "+971 50 000 0041");
await type(await find("#f-country"), "United Arab Emirates");
await type(await find("#f-purpose"), "Dummy onboarding for the KYC walkthrough. Not a live customer.");
await narrate("Sales — Save stays local. The live API is never called.");
await click(await find("#btn-save-lead"));
await sleep(1400);

await click(await find("#nav-send"));
await setHud("Sales", "Send KYC link");
await narrate("Sales — Send KYC link. Email and WhatsApp would both go to sakour at neweast.co. This demo only shows the preview.");
await click(await find("#btn-mail"));
await sleep(1600);
await click(await find("#btn-wa"));
await sleep(1800);

await scene("form", 1);
await narrate("Chapter two. The customer opens the public form and fills KYC.");

await openApp("Customer", "KYC form");
await page.evaluate(() => window.__kycGo("customer"));
await sleep(500);
await setHud("Customer", "KYC form");
await ensureCursor();
await narrate("Customer — Dummy answers only. Legal name, licence, tax, bank, and owners.");
await type(await find("#c-name"), "Oasis Demo Trading LLC");
await type(await find("#c-tl"), "CN-0000041");
await type(await find("#c-trn"), "100-000-000-003");
await type(await find("#c-bank"), "Dummy Bank · IBAN AE0000000000000000041");
await type(await find("#c-ubo"), "Demo Owner 100 percent. No live identity.");
await narrate("Customer — Submit returns the case to Sales. Nothing is posted.");
await click(await find("#btn-submit-kyc"));
await sleep(1400);

await scene("sales", 1);
await narrate("Chapter three. Sales reviews the KYC. Approve or reject. There is no skip.");

await openApp("Sales", "Sales review");
await page.evaluate(() => window.__kycGo("sales"));
await sleep(400);
await setHud("Sales", "Sales review");
await ensureCursor();
await narrate("Sales — Read the pack. Approve sends it to the sales manager.");
await type(await find("#s-note"), "Dummy review complete. Pack matches the lead.");
await click(await find("#btn-sales-ok"));
await sleep(1400);
await point(await find("#btn-sales-no"), 900);
await narrate("Sales — Reject would return the form to the customer. We do not use it on this path.");

await scene("manager", 1);
await narrate("Chapter four. The sales manager decides. Approve opens Finance.");

await openApp("Sales manager", "Manager decision");
await page.evaluate(() => window.__kycGo("manager"));
await sleep(400);
await setHud("Sales manager", "Manager decision");
await ensureCursor();
await narrate("Sales manager — Same pack. The manager cannot skip Finance Lead Approval.");
await type(await find("#m-note"), "Dummy manager approval. Send to Finance.");
await click(await find("#btn-mgr-ok"));
await sleep(1400);

await scene("finance", 1);
await narrate("Chapter five. Finance uses the Lead Approval matrix, in order.");

await openApp("Finance", "Lead Approval");
await page.evaluate(() => window.__kycGo("finance"));
await sleep(400);
await setHud("Finance", "1 of 2 · not last");
await ensureCursor();
await narrate("Finance — Seat one is not last. Approve or reject only. Escalate is hidden.");
await click(await find("#btn-fx-ok"));
await sleep(1200);
await setHud("Finance", "Last · may escalate");
await narrate("Finance — Now the same mailbox sits in the last seat. Approve would go to SAP B1. Escalate is now available.");
await point(await find("#btn-fx-esc"), 1600);
await narrate("Finance — This walkthrough uses escalate, so you can see the extra step. The mailbox is still sakour at neweast.co.");
await click(await find("#btn-fx-esc"));
await sleep(1400);

await scene("esc", 1);
await narrate("Chapter six. Escalation. Only the last Finance person can open this.");

await openApp("Escalation", "Escalation decision");
await page.evaluate(() => window.__kycGo("escalate"));
await sleep(400);
await setHud("Escalation", "Decision");
await ensureCursor();
await narrate("Escalation — Approve still ends on SAP B1. Reject still stops the case. No other account is notified.");
await type(await find("#e-note"), "Dummy escalation approved. Preview SAP B1. Do not post.");
await click(await find("#btn-esc-ok"));
await sleep(1400);

await scene("sap", 1);
await narrate("Chapter seven. SAP Business One. The ERP. Approved KYC becomes the customer master.");

await openApp("SAP B1", "Customer master");
await page.evaluate(() => window.__kycGo("sap"));
await sleep(400);
await setHud("SAP B1", "Customer master · dummy");
await ensureCursor();
await narrate("SAP B1 — Card code, name, and mailbox are ready. This recording stops before insert. No OCRD post.");
await point(await find(".ok"), 2200);

await scene("outro", 1);
await narrate("Know Your Customer at NEWEAST. Lead. KYC. Approve. SAP B1. Dummy walkthrough. sakour at neweast.co. No live post.");

const total = (Date.now() - t0) / 1000;
await cdp.send("Page.stopScreencast");
await sleep(300);
fs.writeFileSync(
  `${OUT}/captions.json`,
  JSON.stringify({ total, captions, frames: frames.map((f) => ({ file: f.file, at: f.ts - t0 / 1000 })) }, null, 2),
);
console.log("total", total.toFixed(1), "frames", frames.length);
await browser.close();
