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
  const frisuren = await s.locator(".frisurknopf").count();
  sag(frisuren >= 20, `${frisuren} Frisuren zur Auswahl`);
  sag(await s.locator(".frisurknopf svg").count() === frisuren, "jede Frisur mit Vorschau");
  await s.locator("input[type=text]").fill("Prüffux");
  await s.locator(".frisurknopf").nth(9).click();
  await s.waitForTimeout(200);
  sag(await s.locator('.frisurknopf[aria-pressed="true"]').count() === 1, "genau eine Frisur gewählt");
  const farben = await s.locator(".farbknopf").count();
  sag(farben >= 12, `${farben} Farbknöpfe (Haarfarbe und Hautton)`);
  await s.locator(".farbknopf").nth(4).click();
  await s.waitForTimeout(200);
  sag(await s.locator('.farbknopf[aria-pressed="true"]').count() === 2,
      "je eine Haarfarbe und ein Hautton gewählt");
  await s.getByRole("button", { name: /^Los geht/, exact: false }).click();
  await s.waitForTimeout(350);
  sag(await s.locator(".heldzeile .figur").count() === 1, "Figur mit gewählter Frisur auf der Übersicht");
  sag(await s.locator(".heldzeile").count() === 1, "Held steht oben auf der Übersicht");
  sag(await s.getByRole("button", { name: "Redaktion", exact: true }).count() === 0,
      "Redaktions-Knopf nicht mehr auf der Startseite");

  // Jeden Stapel einzeln anlernen, damit jeder Kartentyp drankommt
  const gesehen = new Set();
  const moden = new Set();
  let gewusstGesehen = 0;
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
      if (await s.locator(".reihe button").count()) gesehen.add("reihenfolge");
      else if (await s.locator(".frage").count()) {
        gesehen.add(await s.locator(".prompt").count() ? "begriff" : "frage");
      }
      gewusstGesehen += await s.getByRole("button", { name: "Antwort zeigen", exact: true }).count();

      // Antworten, je nach Abfrageart
      if (await s.locator(".wahlfeld button").count()) {
        moden.add("auswahl");
        const anz = await s.locator(".wahlfeld button").count();
        await s.locator(".wahlfeld button").nth(Math.floor(Math.random() * anz)).click();
      } else if (await s.locator(".lueckefeld").count()) {
        moden.add("tippen");
        await s.getByRole("button", { name: "Prüfen", exact: true }).click();
      } else if (await s.locator(".reihe button").count()) {
        moden.add("reihenfolge");
        const anz = await s.locator(".reihe button").count();
        for (let j = 0; j < anz; j++) await s.locator('.reihe button[aria-pressed="false"]').first().click();
        await s.getByRole("button", { name: "Prüfen", exact: true }).click();
      } else {
        // Karte in Selbsteinschätzung — zurückstellen und weitermachen
        const spaeter = s.getByRole("button", { name: "Später", exact: true });
        if (!(await spaeter.count())) break;
        await spaeter.click(); await s.waitForTimeout(80);
        continue;
      }
      await s.waitForTimeout(90);
      sag(await s.locator(".urteil").count() === 1, `Urteil erscheint (Stapel ${n + 1})`);
      sag(await s.locator(".antwort").count() >= 1, `Lösung erscheint (Stapel ${n + 1})`);
      await s.getByRole("button", { name: "Weiter", exact: true }).click();
      await s.waitForTimeout(80);
    }
  }
  // Manche Kartenarten sind selten und nach einer Runde nicht mehr fällig.
  // Statt auf Zufall zu hoffen, wird im Modus „Alle“ gezielt danach gesucht.
  async function sucheArt(art, erkennen, beantworten) {
    if (gesehen.has(art)) return;
    await s.goto(url, { waitUntil: "domcontentloaded" });
    await s.waitForTimeout(250);
    await s.getByRole("button", { name: "Alle", exact: true }).click();
    await s.waitForTimeout(150);
    const k = s.locator(".stapel input[type=checkbox]");
    for (let j = 0; j < anzahl; j++) if (!(await k.nth(j).isChecked())) await k.nth(j).click();
    await s.locator("button.solid").first().click();
    await s.waitForTimeout(250);
    for (let i = 0; i < 80; i++) {
      if (await erkennen()) {
        gesehen.add(art);
        await beantworten();
        await s.waitForTimeout(120);
        sag(await s.locator(".urteil").count() === 1, `${art} wird selbst bewertet`);
        return;
      }
      const spaeter = s.getByRole("button", { name: "Später", exact: true });
      if (!(await spaeter.count())) return;
      await spaeter.click(); await s.waitForTimeout(40);
    }
  }

  await sucheArt("reihenfolge",
    async () => (await s.locator(".reihe button").count()) > 0,
    async () => {
      moden.add("reihenfolge");
      const n = await s.locator(".reihe button").count();
      for (let j = 0; j < n; j++) await s.locator('.reihe button[aria-pressed="false"]').first().click();
      await s.getByRole("button", { name: "Prüfen", exact: true }).click();
    });
  await sucheArt("lueckentext",
    async () => (await s.locator(".lueckefeld").count()) > 0,
    async () => {
      moden.add("tippen");
      await s.getByRole("button", { name: "Prüfen", exact: true }).click();
    });
  await sucheArt("begriff",
    async () => (await s.locator(".prompt").count()) > 0 && (await s.locator(".wahlfeld button").count()) > 0,
    async () => { moden.add("auswahl"); await s.locator(".wahlfeld button").first().click(); });

  sag(gesehen.size === 5, `alle fünf Kartentypen gesehen: ${[...gesehen].sort().join(", ")}`);
  sag(moden.size === 3, `alle drei Abfragearten: ${[...moden].sort().join(", ")}`);
  sag(gewusstGesehen === 0, gewusstGesehen
    ? `Selbsteinschätzung tauchte ${gewusstGesehen}-mal auf` : "keine Selbsteinschätzung mehr — die App prüft selbst");

  // Münzen verdient?
  const muenzen = await s.evaluate(() => JSON.parse(localStorage.getItem("ael.held.v1")).muenzen);
  sag(muenzen > 0, `Münzen verdient: ${muenzen}`);

  // Kleiderkammer
  await s.goto(url, { waitUntil: "domcontentloaded" });
  await s.waitForTimeout(250);
  await s.getByRole("button", { name: "Kleiderkammer", exact: true }).first().click();
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
  await s.getByRole("button", { name: "Kleiderkammer", exact: true }).first().click();
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
  sag(await s.locator('.laden li:has-text("Octopott")').count() === 1, "der Octopott steht im Laden");
  const rang = await s.locator(".beutel .meta").first().textContent();
  sag(/Castinggast|Verkehrsgast|Vorläufiges/.test(rang), `Rang: ${rang.trim()}`);

  // Nirgends seitlich über den Rand
  const breit = await s.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  // Von vorn anfangen — und danach muss wirklich alles weg sein.
  await s.goto(url, { waitUntil: "domcontentloaded" });
  await s.waitForTimeout(250);
  await s.locator(".heldknopf").click();
  await s.waitForTimeout(300);
  sag(await s.getByRole("button", { name: "Von vorn anfangen", exact: true }).count() === 1,
      "„Von vorn anfangen“ steht beim Ändern des Helden");
  s.once("dialog", (d) => d.accept());
  await s.getByRole("button", { name: "Von vorn anfangen", exact: true }).click();
  await s.waitForTimeout(400);
  const leer = await s.evaluate(() => ({
    held: localStorage.getItem("ael.held.v1"),
    fortschritt: localStorage.getItem("ael.fortschritt.v1"),
  }));
  sag(leer.held === null && leer.fortschritt === null, "Held und Fortschritt sind gelöscht");
  sag(await s.locator(".frisurknopf").count() > 0, "die Erstellung steht wieder da");

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
