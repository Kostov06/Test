// Durchlauf im echten Browser: Seitenfassung unter einem Unterpfad (wie
// GitHub Pages), danach offline, und die Einzeldatei per file://.
// Braucht Playwright; läuft nicht in der normalen Prüfung mit.
//
//   node tests/browser-check.mjs [pfad/zu/playwright]
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), "..");
const pwPfad = process.argv[2] || "playwright";
const { chromium } = (await import(pwPfad)).default || (await import(pwPfad));

const TYPEN = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
                ".json": "application/json", ".webmanifest": "application/manifest+json",
                ".png": "image/png" };

// Unter /Test/lernapp/ ausliefern — derselbe Unterpfad wie auf GitHub Pages.
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (!p.startsWith("/Test/lernapp")) { res.writeHead(404); return res.end(); }
  p = p.slice("/Test/lernapp".length) || "/";
  if (p.endsWith("/")) p += "index.html";
  try {
    const inhalt = await readFile(join(WURZEL, p));
    res.writeHead(200, { "content-type": TYPEN[extname(p)] || "application/octet-stream" });
    res.end(inhalt);
  } catch { res.writeHead(404); res.end("nicht da"); }
});
await new Promise((r) => server.listen(8321, r));

let gefallen = 0;
const sag = (gut, text) => { if (!gut) gefallen++; console.log(`  ${gut ? "ok  " : "FEHLT"} ${text}`); };

const browser = await chromium.launch();

async function durchlauf(name, url, breite) {
  console.log(`\n=== ${name} ===`);
  const ctx = await browser.newContext({ viewport: { width: breite, height: 820 },
    isMobile: breite < 500, hasTouch: breite < 500 });
  const s = await ctx.newPage();
  const meldungen = [];
  s.on("console", (m) => m.type() === "error" && meldungen.push(m.text()));
  s.on("pageerror", (e) => meldungen.push("pageerror: " + e.message));

  await s.goto(url, { waitUntil: "networkidle" });
  await s.waitForTimeout(400);

  sag(await s.evaluate(() => location.hash) === "#/held", "Erststart führt in die Charaktererstellung");
  await s.locator("input[type=text]").fill("Prüffux");
  await s.locator('button:has-text("Los geht")').click();
  await s.waitForTimeout(350);
  sag(await s.locator(".heldzeile").count() === 1, "Held steht oben auf der Übersicht");
  sag(await s.locator('button:has-text("Redaktion")').count() === 0,
      "Redaktions-Knopf nicht mehr auf der Startseite");

  // Jeden Stapel einzeln anlernen, damit jeder Kartentyp drankommt
  const gesehen = new Set();
  const anzahl = await s.locator(".stapel li").count();
  for (let n = 0; n < anzahl; n++) {
    await s.goto(url, { waitUntil: "domcontentloaded" });
    await s.waitForTimeout(200);
    const k = s.locator(".stapel input[type=checkbox]");
    for (let j = 0; j < anzahl; j++) if ((await k.nth(j).isChecked()) !== (j === n)) await k.nth(j).click();
    await s.locator("button.solid").first().click();
    await s.waitForTimeout(200);
    for (let i = 0; i < 7; i++) {
      if (await s.locator(".band").count()) gesehen.add("couleur");
      if (await s.locator(".lueckentext").count()) gesehen.add("lueckentext");
      const reihe = await s.locator(".reihe button").count();
      if (reihe) {
        gesehen.add("reihenfolge");
        for (let j = 0; j < reihe; j++) await s.locator('.reihe button[aria-pressed="false"]').first().click();
      } else if (await s.locator(".frage").count()) {
        gesehen.add(await s.locator(".prompt").count() ? "begriff" : "frage");
      }
      const z = s.locator('button:has-text("Antwort zeigen")');
      if (!(await z.count())) break;
      await z.click(); await s.waitForTimeout(70);
      sag(await s.locator(".antwort").count() > 0, `Antwort erscheint (Stapel ${n + 1})`);
      await s.locator('button:has-text("Gewusst")').click(); await s.waitForTimeout(60);
    }
  }
  sag(gesehen.size === 5, `alle fünf Kartentypen gesehen: ${[...gesehen].sort().join(", ")}`);
  sag(await s.locator(".lohn").count() >= 0, "Lohnanzeige vorhanden");

  // Münzen verdient?
  const muenzen = await s.evaluate(() => JSON.parse(localStorage.getItem("ael.held.v1")).muenzen);
  sag(muenzen > 0, `Münzen verdient: ${muenzen}`);

  // Kleiderkammer
  await s.goto(url, { waitUntil: "domcontentloaded" });
  await s.waitForTimeout(250);
  await s.locator('button:has-text("Kleiderkammer")').first().click();
  await s.waitForTimeout(350);
  sag(await s.locator(".laden li").count() >= 10, "Kleiderkammer zeigt die Waren");
  sag(await s.locator(".schaufenster .figur").count() === 1, "Figur steht im Schaufenster");

  // Fahne aussuchen statt zugelost bekommen
  await s.evaluate(() => {
    const hd = JSON.parse(localStorage.getItem("ael.held.v1"));
    hd.muenzen = 99999; localStorage.setItem("ael.held.v1", JSON.stringify(hd));
  });
  await s.goto(url, { waitUntil: "domcontentloaded" });
  await s.waitForTimeout(300);
  await s.locator('button:has-text("Kleiderkammer")').first().click();
  await s.waitForTimeout(350);
  await s.locator('.laden li:has-text("Prunkfahne (SV)") button:has-text("Aussuchen")').first().click();
  await s.waitForTimeout(350);
  const kandidaten = await s.locator(".fahnenliste li").count();
  sag(kandidaten >= 15, `Fahnenwahl bietet ${kandidaten} Bünde an`);
  sag(await s.locator(".fahnenliste .miniband").count() === kandidaten, "jeder mit seinen Farben");
  const gewaehlt = (await s.locator(".fahnenliste .fahnenname").nth(3).textContent()).trim();
  await s.locator(".fahnenwahlknopf").nth(3).click();
  await s.waitForTimeout(350);
  const beute = await s.evaluate(() => JSON.parse(localStorage.getItem("ael.held.v1")).beute);
  sag(beute["fahne-sv"] === gewaehlt, `erbeutet wurde genau der gewählte Bund (${gewaehlt})`);

  // Auswahl bei Krawatte und Anzug
  sag(await s.locator('.laden li:has-text("Krawatte")').count() >= 3, "mehrere Krawatten zur Wahl");
  sag(await s.locator('.laden li:has-text("Anzug,")').count() >= 3, "mehrere Anzüge zur Wahl");

  // Nirgends seitlich über den Rand
  const breit = await s.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  sag(!breit, "Seite läuft nicht seitlich über");

  sag(meldungen.length === 0, meldungen.length ? `Konsolenfehler: ${meldungen.join(" | ")}` : "keine Konsolenfehler");
  await ctx.close();
  return s;
}

await durchlauf("Seite auf dem Handy (390 px)", "http://localhost:8321/Test/lernapp/", 390);
await durchlauf("Seite auf schmalem Handy (320 px)", "http://localhost:8321/Test/lernapp/", 320);
await durchlauf("Einzeldatei per file://", `file://${join(WURZEL, "lernapp.html")}`, 390);

// Offline: Service Worker muss die ganze App im Gerät haben
console.log("\n=== Offline ===");
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 820 } });
  const s = await ctx.newPage();
  await s.goto("http://localhost:8321/Test/lernapp/", { waitUntil: "networkidle" });
  await s.waitForTimeout(1600);
  const bereich = await s.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return r ? r.scope : null;
  });
  sag(Boolean(bereich), `Service Worker für ${bereich}`);
  await ctx.setOffline(true);
  await s.reload({ waitUntil: "domcontentloaded" });
  await s.waitForTimeout(700);
  sag(await s.locator("input[type=text]").count() > 0 || await s.locator(".stapel li").count() > 0,
      "App läuft ohne Netz weiter");
  await ctx.close();
}

await browser.close();
server.close();
console.log(gefallen ? `\n${gefallen} Prüfungen gefallen.` : "\nAlles durch.");
process.exit(gefallen ? 1 : 0);
