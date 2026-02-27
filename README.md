# Teräsovi Mittaohjelmisto

Teräsovi- ja ikkunatuotteiden mittalaskenta- ja työnhallintasovellus tuotantokäyttöön.

Sovellus sisältää:
- useita laskureita ovi- ja ikkunamalleille
- kaavasettien hallinnan (admin)
- Mitat-sivun työnumero-/tuoterakenteen
- reaaliaikaisen monikäyttäjäsynkan Firebasella
- pakkausluetteloiden luonnin PDF-muodossa.

## Sisältö
- [Päätoiminnot](#päätoiminnot)
- [Käyttäjäroolit](#käyttäjäroolit)
- [Mitat-sivun toiminnot](#mitat-sivun-toiminnot)
- [Pakkausluettelo](#pakkausluettelo)
- [Tekninen rakenne](#tekninen-rakenne)
- [Asennus ja käynnistys](#asennus-ja-käynnistys)
- [Firebase-käyttöönotto](#firebase-käyttöönotto)
- [Tiedostorakenne](#tiedostorakenne)

## Päätoiminnot

### 1) Kirjautuminen
- Kirjautuminen sähköpostilla ja salasanalla (Firebase Authentication).
- Sovellus näyttää kirjautumisen jälkeen laskin- tai Mitat-näkymän.

### 2) Laskimet
Sovelluksessa on kuusi laskuria:
- Janisol Pariovi
- Janisol Käyntiovi
- Economy Pariovi
- Economy Käyntiovi
- Janisol Ikkuna
- Economy Ikkuna

Laskuri laskee automaattisesti tuotekohtaisia mittoja (esim. lasilistat, uretaanit, potkupellit, harjalistat mallin mukaan).

### 3) Asetukset
- Rakoasetus (ovilaskimet)
- Ruutujen määrä
- Potkupellin päälle/pois
- Dark mode
- Aktiivinen kaavasetti (myös ei-admin voi vaihtaa)

### 4) Esiasetukset
- Tulokset ja syötteet voi tallentaa nimettyinä esiasetuksina.
- Esiasetukset voidaan ladata myöhemmin nopeasti käyttöön.
- Esiasetuslista sisältää poistotoiminnon (admin-rajaus käytössä).

### 5) Tulosten vienti
- Kopioi tulokset leikepöydälle
- Vie PDF
- Siirrä tulokset Mitat-sivulle työnumeron alle

## Käyttäjäroolit

### Peruskäyttäjä
- Voi käyttää laskureita, asetuksia, esiasetuksia ja Mitat-sivua.
- Voi vaihtaa aktiivisen kaavasetin asetuksista.
- Voi tehdä pakkausluetteloita.

### Admin-käyttäjä
- Näkee ja avaa kaavahallinnan (`Kaavahallinta`).
- Voi tallentaa, päivittää ja poistaa kaavasettejä.
- Voi poistaa Mitat-sivulla työnumeroita ja yksittäisiä nimettyjä mittoja.

Admin-käyttäjät määritellään `app.js`-tiedoston `ADMIN_EMAILS`-listassa.

## Mitat-sivun toiminnot

Mitat-sivu toimii työnumero -> tuote (ovi/ikkuna) -rakenteella.

Tuotekohtaiset toiminnot:
- avaa/sulje yksityiskohdat
- muistiinpano (tuote- ja työnumerotasolla)
- lasilistat-checkpoint
- tehty-checkpoint
- pakattu-merkintä `(pakattu!)` kun tuote on lisätty pakkausluetteloon
- kopioi tuotteen tiedot
- PDF-vienti tuotekohtaisesti

Työnumerotasolla:
- laskuri muodossa `(X KPL / Y TEHTY)` näyttää kokonaismäärän ja tehty-merkittyjen määrän
- adminille poistotoiminnot

## Pakkausluettelo

Mitat-sivulta voi muodostaa pakkausluettelon:
- aktivoi pakkausluettelotila
- valitse työnumero
- valitse halutut ovet/ikkunat
- lataa pakkausluettelo PDF:nä

Pakkausluettelon luonti:
- merkitsee valitut tuotteet pakatuiksi (`packedMitat`)
- näyttää tuotteelle `(pakattu!)`-tekstin
- jos `tehty`-check poistetaan, myös pakattu-merkintä poistuu automaattisesti

## Tekninen rakenne

### Frontend
- `index.html` (UI-rakenne)
- `styles.css` (teemat, layout, komponenttityylit)
- `app.js` (sovelluslogiikka, laskenta, UI-toiminnot, synkka)

### Backend-palvelut
- Firebase Authentication (kirjautuminen)
- Cloud Firestore (reaaliaikainen data)

### Reaaliaikaisesti synkattavat kokonaisuudet
- `presets`
- `checkedStates`
- `formulaSets`
- `mitatState` (mittadata + checkboxit + muistiinpanot + tehty + pakattu)

## Asennus ja käynnistys

### Paikallinen testaus (suositus)
1. Siirry projektikansioon.
2. Käynnistä paikallinen palvelin, esim:
   - `python -m http.server 8080`
3. Avaa selaimessa:
   - `http://localhost:8080`

### Vaihtoehto
- Voit avata `index.html` suoraan tiedostona, mutta osa selaintoiminnoista (esim. clipboard/PDF-käytös) toimii luotettavammin localhostilla.

## Firebase-käyttöönotto

### 1) Konfiguroi Firebase
- Varmista, että Firebase-konfiguraatio on projektissa käytössä.
- Ota käyttöön:
  - Authentication (Email/Password)
  - Firestore Database

### 2) Päivitä Firestore rules
- Käytä projektin `firestore.rules`-tiedostoa.
- Julkaise säännöt Firebase Consoleen (Publish).

### 3) Admin-oikeudet
- Päivitä admin-lista:
  - `app.js` -> `ADMIN_EMAILS`
- Pidä `firestore.rules` admin-sähköpostilistat linjassa tämän kanssa.

## Tiedostorakenne

```text
.
├── index.html
├── styles.css
├── app.js
├── firestore.rules
└── README.md
```

## Huomioita ylläpitoon
- Sovellus on toteutettu Vanilla JS -pohjaisena (ei React/Vite-migraatiota).
- Kaikki merkittävät käyttäjätilat pyritään pitämään synkassa Firestoreen.
- Ennen tuotantokäyttöä tarkista:
  - admin-listat
  - Firestore rules
  - Firebase-projektin domain-asetukset (jos julkaistu webiin).
