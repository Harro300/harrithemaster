---
name: mitat-haku-sulje-tyhjatessa
overview: Lisätään seurantalippu, joka havaitsee milloin hakukenttä on tyhjennetty, ja ohitetaan tällöin työnumeroiden auki-tilan palautus, jolloin kaikki työnumerot sulkeutuvat automaattisesti.
todos:
  - id: add-flag-var
    content: Lisää let mitatSearchWasActive = false; app.js:ssä mitatSearchQuery-muuttujan viereen.
    status: completed
  - id: update-handleInput
    content: Päivitä handleMitatSearchInput asettamaan mitatSearchWasActive = true kun hakusana ei ole tyhjä.
    status: completed
  - id: update-loadMitat
    content: "Päivitä loadMittatView()-funktion loppuehto: jos mitatSearchWasActive on true, nollaa lippu ja ohita restoreMitatOpenState."
    status: completed
  - id: bump-version-r35
    content: Päivitä app.js versio R34 -> R35 index.html:ssä.
    status: completed
isProject: false
---

# Työnumeroiden sulkeminen haun tyhjennyksen yhteydessä

## Juurisyy

`loadMittatView()` tallentaa aina nykyisen auki-tilan `captureMitatOpenState()`-kutsulla ennen renderöintiä. Haun aikana kaikki työnumerot ovat auki. Kun haku tyhjennetään, tallennettu tila sisältää kaikki avoimet työnumerot, ja `restoreMitatOpenState()` avaa ne kaikki uudelleen.

## Muutokset

### 1. [app.js](C:/Users/Harri/.cursor/app.js) — lisää seurantalippu

Lisätään `mitatSearchWasActive`-muuttuja `mitatSearchQuery`-muuttujan viereen (rivi ~4392):

```javascript
let mitatSearchQuery = '';
let mitatSearchWasActive = false;
```

### 2. [app.js](C:/Users/Harri/.cursor/app.js) — päivitä `handleMitatSearchInput`

```javascript
function handleMitatSearchInput(value) {
    const trimmed = value.trim();
    if (trimmed) mitatSearchWasActive = true;
    mitatSearchQuery = trimmed;
    loadMittatView();
}
```

Kun käyttäjä kirjoittaa jotain, `mitatSearchWasActive` asetetaan `true`. Lippu pysyy `true`:na kunnes `loadMittatView()` sen nollaa (haun tyhjennyksen yhteydessä).

### 3. [app.js](C:/Users/Harri/.cursor/app.js) — päivitä `loadMittatView()`-funktion loppu

Nykyinen rivi ~4235:

```javascript
    if (!mitatSearchQuery) {
        restoreMitatOpenState(openState);
    }
```

Uusi:

```javascript
    if (!mitatSearchQuery) {
        if (mitatSearchWasActive) {
            mitatSearchWasActive = false;
        } else {
            restoreMitatOpenState(openState);
        }
    }
```

Kun haku tyhjennetään (`!mitatSearchQuery` ja `mitatSearchWasActive === true`): lippu nollataan ja tila-palautus ohitetaan — kaikki työnumerot jäävät kiinni. Tavalliset uudelleen-renderöinnit (esim. Firestore-päivitys) toimivat ennallaan.

### 4. [index.html](C:/Users/Harri/.cursor/index.html) — päivitä versio R34 -> R35

```html
<script src="app.js?v=20260425R35"></script>
```

