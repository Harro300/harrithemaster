---
name: Create plan.md documentation
overview: Create comprehensive documentation file covering all settings, formulas, functions, and operating principles of the steel door calculator application.
todos: []
---

# Dokumentaatiosuunnitelma: plan.md

Luon kattavan dokumentaatiotiedoston nimeltä `plan.md`, joka sisältää:

## Sisältö

1. **Sovelluksen Yleiskuvaus**
   - Tarkoitus ja käyttötapaus
   - Arkkitehtuuri (HTML/CSS/JS)

2. **Salasanasuojaus**
   - Hyväksytyt salasanat
   - Kirjautumislogiikka

3. **Neljä Laskurityyppiä**
   - Janisol Pariovi
   - Janisol Käyntiovi
   - Economy Pariovi
   - Economy Käyntiovi

4. **Laskentakaavat Yksityiskohtaisesti**
   - Lasilista-laskenta (Janisol vs Economy)
   - Uretaanipalat
   - Potkupellit (sisä- ja ulkopuoli)
   - Harjalistat
   - Rako-vaikutukset (8mm, 10mm, 15mm)
   - Erikoissäännöt

5. **Asetukset**
   - Rako-vaihtoehdot ja niiden vaikutukset
   - Ruutujen määrä (1-5)
   - Dynaamiset syöttökentät

6. **Esiasetukset (Presets)**
   - Tallennusmekanismi (localStorage)
   - Lataus ja poisto
   - Tietorakenne

7. **PDF-Vienti**
   - Käytetty kirjasto (jsPDF)
   - Sisältö ja muotoilu

8. **Käyttöliittymän Rakenne**
   - Yhden sivun malli
   - Komponentit ja niiden sijainti
   - Responsiivisuus

9. **Tiedostorakenne**
   - [`index.html`](index.html) - rakenne ja modalit
   - [`app.js`](app.js) - kaikki logiikka
   - [`styles.css`](styles.css) - tyylit

Dokumentti sisältää:
- Kaikki laskentakaavat taulukoituna
- Funktioiden toimintaperiaatteet
- Datavirrat (syöte → laskenta → tulos)
- Käytännön esimerkkejä
- Mermaid-kaavioita tärkeimmistä prosesseista