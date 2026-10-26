import fs from "node:fs";
import { createRequire } from "node:module";
import {
  USER_ID, CO, OTP, REQNO, CUSTCODE, CUSTNAME,
  fulfillFor, shouldIntercept, blockedCalls, getPhase,
} from "./mock-api.mjs";

const require = createRequire("/tmp/guide-deck/package.json");
const puppeteer = require("puppeteer-core");

const CHROME = "/root/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome";
const ROOT = "/home/negt/MIS/kyc-flow/walkthrough";
const LANG = process.env.KYC_LANG === "ar" ? "ar" : "en";
const DECK = "/tmp/kyc-guide";
const OUT = process.env.KYC_REC || `${DECK}/rec-${LANG}`;
const CARDS = LANG === "ar" ? "http://127.0.0.1:4077/cards-ar.html" : "http://127.0.0.1:4077/cards.html";
const MAPS_KEY = "AIzaSyCerIMmMuk_QSL4SirG6XHc_YUY6RpULwE";
const UI = { view: "View", addLead: "Add Lead", type: "Select Type", group: "Select Group", currency: "Select currency", country: "Select country", approve: "Approve", sendMgr: "Send to Line Manager", sendFin: "Send for Approval", escalate: "Escalate", addLeadWait: "Add Lead" };
const SAY = LANG === "ar" ? {
  intro: "هذا هو اعرف عميلك في نيويست. العميل الجديد يبدأ كعميل محتمل، وينتهي في سجل العملاء على ساب.",
  roles: "راقب الدور على الشاشة. المبيعات تنشئ. العميل يعبّئ. ثم المبيعات، ثم المدير، ثم المالية. ساب في النهاية.",
  ch1: "الفصل الأول. المبيعات تنشئ العميل المحتمل وترسل نموذج اعرف عميلك.",
  salesForm: "المبيعات — هذه شاشة إضافة عميل محتمل. مندوب المبيعات محدد مسبقاً. سجّل بيانات الشركة.",
  map: "المبيعات — حدّد الموقع على الخريطة. العنوان يثبت على الخريطة قبل الحفظ.",
  saveLead: "المبيعات — أضف العميل المحتمل. أكّد في الشاشة التالية.",
  sendLink: "المبيعات — العميل المحتمل ظهر في القائمة. أرسل نموذج اعرف عميلك من هنا.",
  ch2: "الفصل الثاني. العميل يفتح النموذج من الرابط.",
  fillKyc: "العميل — ملف الشركة، البنك، والملاك. الحقول المطلوبة أولاً.",
  submitKyc: "العميل — إرسال. الطلب يعود إلى المبيعات.",
  ch3: "الفصل الثالث. المبيعات تراجع النموذج، ثم ترسله إلى المدير المباشر.",
  salesReview: "المبيعات — اقرأ الإجابات. أرسل إلى المدير المباشر.",
  ch4: "الفصل الرابع. مدير المبيعات يقرر. المالية بعد ذلك.",
  mgrOpen: "مدير المبيعات — افتح الطلب.",
  ch5: "الفصل الخامس. موافقة المالية. الأشخاص يوقعون بالترتيب.",
  finOpen: "المالية — افتح الملف. هذا المقعد ليس الأخير، لذلك التصعيد غير ظاهر.",
  finLast: "المالية — الآن هذا المقعد الأخير. التصعيد متاح.",
  ch6: "الفصل السادس. التصعيد. الموافقة ما زالت تُغلق على ساب.",
  ch7: "الفصل السابع. ساب. العميل المحتمل يصبح سجل عميل.",
  outro: "اعرف عميلك في نيويست. عميل محتمل. اعرف عميلك. موافقة. ساب.",
} : {
  intro: "This is Know Your Customer at NEWEAST. A new customer starts as a lead, and ends as a customer master in SAP.",
  roles: "Watch the role on screen. Sales creates. The customer fills. Sales, then the manager, then Finance. SAP is last.",
  ch1: "Chapter one. Sales creates the lead and sends the KYC form.",
  salesForm: "Sales — This is Add New Lead. The salesman is already set. Capture the company.",
  map: "Sales — Pin the site on the map. The address sits on the map before you save.",
  saveLead: "Sales — Add the lead. Confirm on the next screen.",
  sendLink: "Sales — The lead is on Existing Lead. Send the KYC form from here.",
  ch2: "Chapter two. The customer opens the KYC form from the link.",
  fillKyc: "Customer — Company profile, bank, and owners. Required fields first.",
  submitKyc: "Customer — Submit. The case returns to Sales.",
  ch3: "Chapter three. Sales reviews the KYC, then sends it to the line manager.",
  salesReview: "Sales — Read the answers. Send to Line Manager.",
  ch4: "Chapter four. The sales manager decides. Finance is next.",
  mgrOpen: "Sales manager — Open the request.",
  ch5: "Chapter five. Finance Lead Approval. People sign in order.",
  finOpen: "Finance — Open the case. This seat is not last, so escalate is not here.",
  finLast: "Finance — Now this is the last seat. Escalate is available.",
  ch6: "Chapter six. Escalation. Approve still closes on SAP.",
  ch7: "Chapter seven. SAP. The lead becomes the customer master.",
  outro: "Know Your Customer at NEWEAST. Lead. KYC. Approve. SAP.",
};
const APP = "https://pp.neweast.cloud";
const QS = `uSrId=${encodeURIComponent(USER_ID)}&LoTp=${OTP}&co=${encodeURIComponent(CO)}`;
const b64 = (s) => Buffer.from(s, "utf8").toString("base64");

fs.mkdirSync(OUT, { recursive: true });
fs.copyFileSync("/home/negt/MIS/kyc-flow/neweast-logo.png", `${ROOT}/logo.png`);

const HUD = `
(() => {
  const mount = () => {
    if (location.protocol === "http:" && location.port === "4077") return;
    let b = document.getElementById("__hud");
    if (!b) {
      b = document.createElement("div");
      b.id = "__hud";
      b.innerHTML = '<div class="k">NEWEAST · Know Your Customer</div><div class="l"><span class="r"></span><span class="dot"> · </span><span class="s"></span></div>';
      Object.assign(b.style, {
        position: "fixed", top: "12px", left: "50%", transform: "translateX(-50%)", zIndex: "2147483640",
        pointerEvents: "none", background: "rgba(20,14,14,.94)", color: "#fff",
        borderRadius: "18px", padding: "10px 26px", fontFamily: "DejaVu Sans, Arial, sans-serif",
        boxShadow: "0 10px 28px rgba(0,0,0,.35)", textAlign: "center", minWidth: "560px",
        border: "1px solid rgba(181,30,33,.55)",
      });
      const style = document.createElement("style");
      style.textContent = "#__hud .k{font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:#f3b4b5;font-weight:800}#__hud .l{font-size:18px;margin-top:3px;font-weight:800}#__hud .r{color:#fff}#__hud .s{color:#f3dede;font-weight:600}";
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
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
  setInterval(mount, 400);
})();
`;

const CAPTION = `
(() => {
  const mount = () => {
    if (false && location.port === "4077") return;
    let el = document.getElementById("__cap");
    if (!el) {
      el = document.createElement("div");
      el.id = "__cap";
      el.innerHTML = '<div class="pill"></div><div class="body"></div>';
      Object.assign(el.style, {
        position: "fixed", left: "28px", right: "28px", bottom: "18px", zIndex: "2147483638",
        pointerEvents: "none", display: "none", alignItems: "center", gap: "16px",
        background: "linear-gradient(90deg, rgba(18,12,12,.96), rgba(40,18,18,.94))",
        color: "#fff", borderRadius: "18px", padding: "16px 22px",
        fontFamily: "DejaVu Sans, Arial, sans-serif",
        boxShadow: "0 16px 40px rgba(0,0,0,.45)",
        border: "1px solid rgba(243,180,181,.35)",
        minHeight: "92px",
      });
      const st = document.createElement("style");
      st.textContent = "#__cap .pill{flex:0 0 auto;background:#b51e21;color:#fff;font-weight:800;font-size:18px;padding:8px 14px;border-radius:999px;letter-spacing:.02em}#__cap .body{font-size:24px;line-height:1.35;font-weight:700;text-shadow:0 2px 0 rgba(0,0,0,.35)}#__cap.empty .pill{display:none}";
      document.documentElement.appendChild(st);
      document.documentElement.appendChild(el);
    }
    const text = window.__capText || "";
    const ar = window.__capAr;
    el.dir = ar ? "rtl" : "ltr";
    if (!text) { el.style.display = "none"; return; }
    el.style.display = "flex";
    const pill = el.querySelector(".pill");
    const body = el.querySelector(".body");
    if (text.includes(" — ")) {
      const [lead, rest] = text.split(" — ");
      el.classList.remove("empty");
      pill.textContent = lead;
      body.textContent = rest;
    } else {
      el.classList.add("empty");
      pill.textContent = "";
      body.textContent = text;
    }
  };
  setInterval(mount, 200);
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
  console.log(((Date.now() - t0) / 1000).toFixed(1), getPhase(), text);
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  ignoreHTTPSErrors: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars", "--window-size=1680,840"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1680, height: 840, deviceScaleFactor: 1 });
await page.evaluateOnNewDocument(CURSOR);
await page.evaluateOnNewDocument(HUD);
await page.evaluateOnNewDocument(CAPTION);
page.setDefaultTimeout(25000);

await page.setRequestInterception(true);
const seen = new Set();
page.on("request", (req) => {
  const url = req.url();
  const method = req.method();
  const key = method + " " + url.split("?")[0];
  if (!seen.has(key) && (shouldIntercept(url) || method !== "GET")) {
    seen.add(key);
    console.log("net", key.slice(0, 180));
  }
  if (method === "OPTIONS" && shouldIntercept(url)) {
    return req.respond({
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "*",
      },
    });
  }
  if (shouldIntercept(url)) {
    const reply = fulfillFor(url, method, req.postData() || "");
    return req.respond({
      status: reply.status,
      contentType: reply.contentType,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: reply.body,
    });
  }
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method) && !url.startsWith("http://127.0.0.1:4077") && !url.startsWith("https://pp.neweast.cloud") && !/maps\.googleapis|maps\.gstatic|google\.com\/maps/i.test(url)) {
    console.log("ABORT", method, url.slice(0, 160));
    return req.abort();
  }
  if (/google-analytics|googletagmanager|doubleclick|hotjar|facebook|clarity\.ms/i.test(url)) {
    return req.abort();
  }
  if (/maps\.googleapis\.com\/maps\/api\/js/.test(url) && /key=/.test(url)) {
    const next = url.replace(/key=[^&]+/, "key=" + MAPS_KEY);
    return req.continue({ url: next });
  }
  return req.continue();
});

async function ensure() {
  await page.evaluate(CURSOR);
  await page.evaluate(HUD);
  await page.evaluate(CAPTION);
}

async function showCap(text) {
  await page.evaluate((t, ar) => {
    window.__capText = t;
    window.__capAr = ar;
  }, text, LANG === "ar");
}

async function ensureMap() {
  await page.evaluate(() => {
    const bad = [...document.querySelectorAll("div")].find((d) => {
      const t = (d.textContent || "").trim();
      return t.startsWith("Error loading Google Maps") && t.length < 220 && d.children.length < 5;
    });
    const host = bad || document.querySelector("[class*='gm-style']")?.parentElement;
    if (document.getElementById("__gmap")) return;
    const wrap = document.createElement("div");
    wrap.id = "__gmap";
    wrap.style.cssText = "width:100%;height:340px;border-radius:12px;overflow:hidden;border:1px solid #eadfdc;margin-top:8px";
    wrap.innerHTML = '<iframe title="Google Map" src="https://maps.google.com/maps?q=Al%20Quoz%20Industrial%201%20Dubai&z=14&output=embed" width="100%" height="340" style="border:0" loading="eager" referrerpolicy="no-referrer-when-downgrade"></iframe>';
    if (bad) bad.replaceWith(wrap);
  });
  await page.evaluate(() => {
    const map = document.getElementById("__gmap") || document.querySelector(".gm-style");
    if (map) map.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  await sleep(2200);
}

async function setHud(role, screen) {
  await page.evaluate((role, screen) => {
    window.__hudRole = role;
    window.__hudScreen = screen;
  }, role, screen);
  await page.evaluate(HUD);
}

async function openApp(path, role, screen) {
  await page.goto(`${APP}${path}?${QS}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(1800);
  await setHud(role, screen);
  await ensure();
}

async function moveTo(handle) {
  if (!handle) return null;
  await handle.evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" })).catch(() => {});
  await sleep(350);
  await ensure();
  const box = await handle.boundingBox();
  if (!box) return null;
  const x = box.x + Math.min(box.width / 2, 36);
  const y = box.y + box.height / 2;
  await page.evaluate((x, y) => {
    window.__cx = x;
    window.__cy = y;
    const c = document.getElementById("__cur");
    if (c) {
      c.style.left = x + "px";
      c.style.top = y + "px";
    }
  }, x, y);
  await sleep(550);
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
      width: "32px", height: "32px", borderRadius: "50%",
      background: "rgba(181,30,33,.35)", zIndex: 2147483646, pointerEvents: "none",
      transition: "transform .45s ease, opacity .45s ease",
    });
    document.documentElement.appendChild(r);
    requestAnimationFrame(() => { r.style.transform = "scale(1.8)"; r.style.opacity = "0"; });
    setTimeout(() => r.remove(), 500);
  });
}

async function click(handle) {
  await moveTo(handle);
  await ripple();
  await handle.click();
  await sleep(350);
}

async function confirmInDialog() {
  await page.waitForSelector('[role="dialog"]', { visible: true, timeout: 8000 });
  await sleep(400);
  const handle = await page.waitForFunction(() => {
    const dlg = document.querySelector('[role="dialog"]');
    if (!dlg) return null;
    const btns = [...dlg.querySelectorAll("button")].filter((b) => {
      const t = (b.textContent || "").trim();
      return /^(Approve|Send KYC Form|Confirm|Escalate|موافقة|اعتماد|تأكيد)$/i.test(t);
    });
    return btns[btns.length - 1] || null;
  }, { timeout: 8000 });
  await click(handle.asElement());
}

async function clickRowView() {
  const handle = await page.waitForFunction((label) => {
    const btns = [...document.querySelectorAll("button")].filter(
      (b) => b.offsetParent !== null && (b.textContent || "").trim() === label,
    );
    if (!btns.length) return null;
    btns.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    return btns[btns.length - 1];
  }, { timeout: 20000 }, UI.view);
  await click(handle.asElement());
}

async function byText(tag, text) {
  const handle = await page.waitForFunction((tag, text) => {
    const hits = [...document.querySelectorAll(tag)].filter(
      (el) => el.offsetParent !== null && (el.textContent || "").trim().replace(/\s+/g, " ").includes(text),
    );
    hits.sort((a, b) => (a.textContent || "").length - (b.textContent || "").length);
    return hits[0] || null;
  }, { timeout: 20000 }, tag, text);
  return handle.asElement();
}

async function typeName(name, value) {
  const el = await page.waitForSelector(`[name="${name}"]`, { visible: true, timeout: 15000 });
  await moveTo(el);
  await ripple();
  await el.click({ clickCount: 3 });
  await page.keyboard.press("Backspace");
  await el.type(value, { delay: 28 });
  await sleep(150);
}

async function pickSelect(placeholder, option) {
  const trigger = await page.waitForFunction((placeholder) => {
    const buttons = [...document.querySelectorAll("button")];
    return buttons.find((b) => b.offsetParent !== null && (b.textContent || "").includes(placeholder));
  }, { timeout: 12000 }, placeholder);
  await click(trigger.asElement());
  await sleep(450);
  const opt = await page.waitForFunction((option) => {
    const nodes = [...document.querySelectorAll('[role="option"], [data-radix-collection-item]')];
    const hit = nodes.find((el) => (el.textContent || "").trim() === option);
    if (hit) return hit;
    return [...document.querySelectorAll("div,span")].find(
      (el) => (el.textContent || "").trim() === option && el.getClientRects().length,
    );
  }, { timeout: 8000 }, option);
  await click(opt.asElement());
  await sleep(300);
}

async function scene(name, ms = 1) {
  await page.goto(`${CARDS}?scene=${name}`, { waitUntil: "load" });
  await sleep(ms);
}

async function narrate(text, pad = 1400) {
  cap(text);
  await showCap(text);
  const spoken = text.replace(/ — /g, ". ");
  await sleep(Math.max(3400, Math.round((spoken.length / 11) * 1000) + pad));
}

async function switchArabic() {
  if (LANG !== "ar") return;
  try {
    await click(await byText("button", "English"));
    await sleep(400);
    await click(await byText("span", "Arabic"));
    await sleep(900);
  } catch (e) {
    console.log("lang skip", e.message);
  }
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

try {
  await narrate(SAY.intro);
  await scene("roles", 600);
  await narrate(SAY.roles);

  await scene("lead", 1);
  await narrate(SAY.ch1);

  await openApp("/add-customer/lead", LANG === "ar" ? "المبيعات" : "Sales", LANG === "ar" ? "إضافة عميل محتمل" : "Add New Lead");
  await page.waitForFunction(() => document.body.innerText.includes("Add Lead"), { timeout: 20000 });
  await narrate(SAY.salesForm);
  await typeName("CardName", CUSTNAME);
  await pickSelect(UI.type, LANG === "ar" ? "Credit" : "Credit");
  await pickSelect(UI.group, "Local");
  await pickSelect(UI.currency, "AED");
  await typeName("Company Tax ID", "100247821900003");
  await typeName("Company Email", "sakour@neweast.co");
  await typeName("Tel1", "+97145001000");
  await typeName("Cellolar", "+971501112244");
  await typeName("Building", "Horizon Building");
  await typeName("Block", "Al Quoz");
  await typeName("City", "Dubai");
  try {
    await click(await byText("button", UI.country));
    await sleep(400);
    const focused = await page.evaluateHandle(() => document.activeElement);
    await focused.asElement()?.type("United Arab", { delay: 25 });
    await sleep(450);
    await click(await byText("span,div", "United Arab Emirates"));
  } catch (e) {
    console.log("country skip", e.message);
  }
  await ensureMap();
  await narrate(SAY.map);
  await narrate(SAY.saveLead);
  await page.evaluate((label) => {
    const b = [...document.querySelectorAll("button")].find((el) => (el.textContent || "").includes(label));
    if (b) b.scrollIntoView({ behavior: "instant", block: "center" });
  }, UI.addLead);
  await sleep(500);
  await click(await byText("button", UI.addLead).catch(() => byText("button", "Add")));
  await sleep(500);
  try {
    await click(await byText("button", "Confirm"));
  } catch { /* already saved */ }
  await sleep(1600);

  await openApp("/add-customer", "Sales", "Existing Lead");
  await narrate(SAY.sendLink);
  try {
    const send = await page.waitForSelector('button[title="Send KYC Form"]', { visible: true, timeout: 8000 });
    await click(send);
    await sleep(600);
    await click(await byText("button", "Send KYC Form"));
    await sleep(1200);
  } catch (e) {
    console.log("send skip", e.message);
  }

  await scene("form", 1);
  await narrate(SAY.ch2);

  const formUrl = `${APP}/customer-kyc-form?cc=${b64(CUSTCODE)}&rn=${b64(String(REQNO))}&ui=${b64(USER_ID)}&co=${b64(CO)}`;
  await page.goto(formUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(2000);
  await setHud("Customer", "KYC form");
  await ensure();
  await narrate(SAY.fillKyc);
  const fillIds = [
    ["f_1", CUSTNAME],
    ["f_2", "CN-784221"],
    ["f_3", "100247821900003"],
    ["f_5", "Emirates NBD"],
    ["f_6", "AE070331234567890123456"],
    ["f_7", "Khalid Al Mansoori"],
    ["f_8", "100"],
  ];
  for (const [id, val] of fillIds) {
    const el = await page.$(`[name="${id}"], #${id}, textarea[name="${id}"]`);
    if (!el) {
      const boxed = await page.$(`input, textarea`);
      if (!boxed) continue;
    }
    try {
      const handle = await page.$(`[name="${id}"]`) || await page.$(`textarea[name="${id}"]`);
      if (!handle) continue;
      await typeName(id, val);
    } catch { /* optional */ }
  }
  try {
    const ta = await page.$("textarea");
    if (ta) {
      await moveTo(ta);
      await ta.click({ clickCount: 3 });
      await ta.type("Wholesale of motor vehicle parts", { delay: 20 });
    }
  } catch { /* */ }
  await narrate(SAY.submitKyc);
  await click(await byText("button", "Submit"));
  await sleep(400);
  try { await click(await byText("button", "Confirm")); } catch { /* */ }
  await sleep(1400);

  await scene("sales", 1);
  await narrate(SAY.ch3);

  await openApp("/add-customer", "Sales", "Existing Lead");
  try {
    const view = await page.waitForSelector('button[title="View"]', { visible: true, timeout: 8000 });
    await click(view);
  } catch {
    await clickRowView();
  }
  await sleep(1600);
  await setHud("Sales", "Review lead");
  await ensure();
  await narrate(SAY.salesReview);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(600);
  await click(await byText("button", "Send to Line Manager"));
  await sleep(500);
  try {
    const remark = await page.$("#approve-remark");
    if (remark) await remark.type("Pack is complete.", { delay: 25 });
  } catch { /* */ }
  await confirmInDialog();
  await sleep(1400);

  await scene("manager", 1);
  await narrate(SAY.ch4);

  await openApp("/manager-approval", "Sales manager", "Manager Approval");
  await narrate(SAY.mgrOpen);
  await clickRowView();
  await sleep(1600);
  await setHud("Sales manager", "Review lead");
  await ensure();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(500);
  await click(await byText("button", "Send for Approval"));
  await sleep(400);
  await confirmInDialog();
  await sleep(1400);

  await scene("finance", 1);
  await narrate(SAY.ch5);

  await openApp("/lead-approval", "Finance", "Lead Approval");
  await narrate(SAY.finOpen);
  await clickRowView();
  await sleep(1800);
  await setHud("Finance", "Not last");
  await ensure();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(700);
  await click(await byText("button", UI.approve).catch(() => byText("button", "Approve")));
  await sleep(500);
  await confirmInDialog();
  await sleep(1600);

  await openApp("/lead-approval", "Finance", "Last seat");
  await clickRowView();
  await sleep(1800);
  await setHud("Finance", "Last · may escalate");
  await ensure();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(600);
  await narrate(SAY.finLast);
  await click(await byText("button", "Escalate"));
  await sleep(700);
  try {
    const combo = await page.waitForFunction(() => {
      const dlg = document.querySelector('[role="dialog"]');
      if (!dlg) return null;
      return dlg.querySelector("input, [role='combobox'], button");
    }, { timeout: 5000 });
    await click(combo.asElement());
    await sleep(400);
    await click(await byText("div,span", "Jad Sakour"));
  } catch (e) { console.log("esc user", e.message); }
  try {
    const ta = await page.$('[role="dialog"] textarea');
    if (ta) await ta.type("Please take a second look.", { delay: 20 });
  } catch { /* */ }
  await confirmInDialog();
  await sleep(1400);

  await scene("esc", 1);
  await narrate(SAY.ch6);

  await openApp("/escalation", "Escalation", "Escalations");
  await clickRowView();
  await sleep(1800);
  await setHud("Escalation", "Decision");
  await ensure();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(500);
  await click(await byText("button", UI.approve).catch(() => byText("button", "Approve")));
  await sleep(500);
  await confirmInDialog();
  await sleep(1600);

  await scene("sap", 1);
  await narrate(SAY.ch7);
  await scene("outro", 1);
  await narrate(SAY.outro);
} catch (err) {
  console.error("RECORD FAIL", err);
  captions.push({ at: (Date.now() - t0) / 1000, text: SAY.outro });
  await scene("outro", 2000);
}

const total = (Date.now() - t0) / 1000;
await cdp.send("Page.stopScreencast");
await sleep(300);
fs.writeFileSync(
  `${OUT}/captions.json`,
  JSON.stringify({
    total,
    captions,
    blocked: blockedCalls().length,
    frames: frames.map((f) => ({ file: f.file, at: f.ts - t0 / 1000 })),
  }, null, 2),
);
console.log("total", total.toFixed(1), "frames", frames.length, "blocked", blockedCalls().length);
await browser.close();
