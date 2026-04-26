---
name: mitat-haku-v3
overview: Poistetaan epäluotettava setupMitatSearch()-mekanismi ja korvataan se suoralla oninput/onsearch/onkeydown-attribuuttikombinaatiolla, joka toimii välittömästi ilman erillistä asettelukutsua. Päivitetään versiotunniste uudelleen selainvälimuistin tyhjennetämiseksi.
todos:
  - id: bump-version-r33
    content: Päivitä app.js versio R32 -> R33 index.html:ssä.
    status: completed
  - id: restore-oninput-attrs
    content: Lisää oninput, onsearch ja onkeydown-attribuutit hakukenttyään index.html:ssä.
    status: completed
  - id: restore-handleMitatSearchInput
    content: Lisää handleMitatSearchInput-funktio takaisin app.js:ssä.
    status: completed
  - id: remove-setupMitatSearch
    content: Poista setupMitatSearch()-funktio sekä sen kutsut switchView():stä ja loadMittatView():stä app.js:ssä.
    status: completed
isProject: false
---

# Mitat-haun korjaus v3

## Miksi nykyinen toteutus ei toimi

`setupMitatSearch()` on täysin riippuvainen siitä, että se tulee kutsutuksi oikeaan aikaan. Kahdessa tilanteessa kutsua ei tapahdu:

- `loadMittatView()` palaa aikaisemmin (tyhjä data → `return` rivillä ~4001 tai "ei tuloksia" → `return` rivillä ~4230). Kumpikin ohittaa rivin 4236 (`setupMitatSearch()`).
- `switchView('mitat')` kutsuu `setupMitatSearch()` (rivi 700) ennen kuin Firestore-data on saapunut ja kirjoitettu localStorageen, jolloin kuuntelija saattaa kiinnittyä elementtiin joka ei vielä näy tai jolle ei tapahdu mitään.

Koska `oninput`-attribuutti evaluoidaan tapahtuman hetkellä (ei parsinnin aikana), se toimii aina kunhan `handleMitatSearchInput` on globaalisti määritelty app.js:ssä — eikä se vaadi setup-kutsua oikeaan aikaan.

## Muutokset

### 1. [index.html](C:/Users/Harri/.cursor/index.html) — version string R32 -> R33

```html
<script src="app.js?v=20260425R33"></script>
```

### 2. [index.html](C:/Users/Harri/.cursor/index.html) — lisää event-attribuutit hakukenttään

Nykyinen (rivi 199-202):

```html
<input type="search" class="form-control mitat-search-input" id="mitatSearchInput"
    placeholder="Hae työnumerolla, tuotteella, värillä (esim. RAL 9010)..."
    autocomplete="off"
    aria-label="Hae mittoja">
```

Uusi:

```html
<input type="search" class="form-control mitat-search-input" id="mitatSearchInput"
    placeholder="Hae työnumerolla, tuotteella, värillä (esim. RAL 9010)..."
    oninput="handleMitatSearchInput(this.value)"
    onsearch="handleMitatSearchInput(this.value)"
    onkeydown="if(event.key==='Enter'){event.preventDefault();handleMitatSearchInput(this.value);}"
    autocomplete="off"
    aria-label="Hae mittoja">
```

- `oninput` = suodatus jokaisella kirjoitetulla merkillä (reaaliaikainen)
- `onsearch` = selaimen ×-tyhjennysnapin ja Enter-näppäimen kuuntelija `type="search"`-kentillä (Chrome/Edge)
- `onkeydown` Enter = varmistaa Enter-tuen kaikissa selaimissa

### 3. [app.js](C:/Users/Harri/.cursor/app.js) — palauta `handleMitatSearchInput`, poista `setupMitatSearch`

Poistetaan `setupMitatSearch()`-funktio (rivit 4393-4403) ja sen kutsut kohdista:

- `switchView()` rivi 700
- `loadMittatView()` rivi 4236

Lisätään tilalle yksinkertainen `handleMitatSearchInput`:

```javascript
function handleMitatSearchInput(value) {
    mitatSearchQuery = value.trim();
    loadMittatView();
}
```

## Rajaukset

- `matchesMitatSearch`-logiikkaan ei kosketa (toimii oikein).
- `loadMittatView`-suodatuslogiikkaan ei kosketa.

