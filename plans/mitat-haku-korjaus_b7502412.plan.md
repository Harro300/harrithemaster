---
name: mitat-haku-korjaus
overview: "Korjataan hakukentän toiminta kahdella muutoksella: päivitetään app.js:n version string välimuistin tyhjentämiseksi ja siirrytään JavaScript-pohjaiseen addEventListener-lähestymistapaan, joka kattaa sekä kirjoittamisen että selaimen oman tyhjennysnapin."
todos:
  - id: bump-version-string
    content: Päivitä index.html:ssä app.js-versio R31 -> R32 (tai korkeampi) välimuistin tyhjentämiseksi.
    status: completed
  - id: add-setup-mitat-search
    content: Lisää app.js:iin setupMitatSearch()-funktio, joka kiinnittää kuuntelijat sekä input- että search-tapahtumaan.
    status: completed
  - id: call-setup-in-switchview
    content: Kutsu setupMitatSearch() switchView('mitat')-haarasta loadMittatView()-kutsun jälkeen.
    status: completed
  - id: call-setup-in-loadmitat
    content: Kutsu setupMitatSearch() myös loadMittatView()-funktion lopussa varmuuden vuoksi.
    status: completed
  - id: remove-inline-oninput
    content: Poista oninput-attribuutti index.html:n hakukenttäelementistä ja poista erillinen handleMitatSearchInput-funktio app.js:stä.
    status: completed
isProject: false
---

# Mitat-hakukentän korjaus

## Juurisyyt

**1. Version string ei päivittynyt**

[index.html](C:/Users/Harri/.cursor/index.html) rivi 2059:

```html
<script src="app.js?v=20260425R31"></script>
```

Tämä muuttui **ennen** hakufunktioiden lisäämistä. Selain saattaa ladata vanhan `app.js?v=20260425R31`-version välimuistista. Siinä ei ole `handleMitatSearchInput`-funktiota, joten kirjoittaminen aiheuttaa hiljaa epäonnistuvan ReferenceError-virheen. Hakukenttä näkyy (index.html ladattiin tuoreena), mutta suodatus ei toimi.

**2. `type="search"` ja selaimen tyhjennysnappi**

`type="search"` -kentillä on selaimissa sisäänrakennettu ×-nappi. Sen klikkaus laukaisee `search`-tapahtuman, ei `input`-tapahtumaa. Pelkällä `oninput`-attribuutilla kenttä ei reagoi tähän napin painallukseen.

## Muutokset

### 1. Päivitä app.js version string — [index.html](C:/Users/Harri/.cursor/index.html)

Muutetaan rivi 2059 R31 -> R32 (tai korkeampi), jotta selain pakottaa tuoreen app.js:n lataamisen:

```html
<script src="app.js?v=20260425R32"></script>
```

### 2. Korvaa inline-attribuutti JavaScript-kuuntelijalla — [app.js](C:/Users/Harri/.cursor/app.js)

Poistetaan `oninput`-attribuutti index.html:stä ja lisätään [app.js](C:/Users/Harri/.cursor/app.js):ään uusi `setupMitatSearch()`-funktio, joka kiinnittää kuuntelijat ohjelmallisesti. Kuuntelijat lisätään sekä `input`- että `search`-tapahtumaan.

```javascript
function setupMitatSearch() {
    const input = document.getElementById('mitatSearchInput');
    if (!input || input.dataset.mitatSearchBound) return;
    input.dataset.mitatSearchBound = '1';
    function handleSearch() {
        mitatSearchQuery = input.value.trim();
        loadMittatView();
    }
    input.addEventListener('input', handleSearch);
    input.addEventListener('search', handleSearch); // selaimen oma tyhjennysnappi
}
```

Kutsutaan `setupMitatSearch()` kahdesta paikasta:
- `switchView('mitat')` -funktiosta (rivi ~699), heti `loadMittatView()`-kutsun jälkeen
- `loadMittatView()` -funktion lopussa, varmuuden vuoksi (jos näkymä renderöidään ilman switchViewiä)

Lisäksi poistetaan `oninput`-attribuutti [index.html](C:/Users/Harri/.cursor/index.html):stä hakukentältä:

```html
<!-- ennen -->
<input ... oninput="handleMitatSearchInput(this.value)" ...>

<!-- jälkeen -->
<input ... id="mitatSearchInput" ...>
```

Ja poistetaan erillinen `handleMitatSearchInput`-funktio [app.js](C:/Users/Harri/.cursor/app.js):stä (korvataan `setupMitatSearch`-funktion sisäisellä `handleSearch`-funktiolla).

## Rajaus

- `matchesMitatSearch`-apufunktio ja `loadMittatView`-suodatuslogiikka ovat oikein, eikä niihin kosketa.