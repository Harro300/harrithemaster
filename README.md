# Gradus — Teräsovi Mittaohjelmisto

Teräsovi- ja ikkunatuotteiden **mittalaskenta** ja **tuotannon työnhallinta** yhdessä selainsovelluksessa. Sovellus on tarkoitettu yhden tehtaan sisäiseen käyttöön: kaikki kirjautuneet käyttäjät näkevät saman tuotantotilan reaaliajassa.

## Mitä sovellus tekee?

| Osa | Kuvaus |
|-----|--------|
| **Laskin** | Kuusi laskuria (Janisol / Economy, ovi / ikkuna). Laskee lasilistat, uretaanit, potkupellit jne. valitun kaavasetin mukaan. |
| **Tuotanto** | Työnumero → tuotteet. Checkpointit, muistiinpanot, pakkausluettelot, lasilistojen PDF. |
| **Paketit** | Täysin pakatut työt. Haku, pakkausajat ja pakettikohtainen järjestys. |
| **Synkka** | Firebase Authentication + Cloud Firestore. Muutokset näkyvät kaikilla laitteilla. |

## Sisällysluettelo

- [Näkymät](#näkymät)
- [Laskin](#laskin)
- [Tuotanto-näkymä](#tuotanto-näkymä)
- [Pakkausluettelo](#pakkausluettelo)
- [Paketit-näkymä](#paketit-näkymä)
- [Käyttäjäroolit](#käyttäjäroolit)
- [Varmuuskopio (admin)](#varmuuskopio-admin)
- [Tekninen rakenne](#tekninen-rakenne)
- [Tietoturva ja käyttömalli](#tietoturva-ja-käyttömalli)
- [Asennus ja käynnistys](#asennus-ja-käynnistys)
- [Firebase-käyttöönotto](#firebase-käyttöönotto)
- [Kehitys ja julkaisu](#kehitys-ja-julkaisu)
- [Tiedostorakenne](#tiedostorakenne)
- [Muu dokumentaatio](#muu-dokumentaatio)

---

## Näkymät

Kirjautumisen jälkeen yläpalkissa on kolme päänäkymää:

| Näkymä | Koodi | Kuvaus |
|--------|-------|--------|
| **Laskin** | `laskin` | Mittalaskurit, asetukset, tulosten vienti |
| **Tuotanto** | `mitat` | Työnhallinta, checkpointit, PDF-viennit |
| **Paketit** | `paketit` | Valmiiksi pakatut työt |

**Koordinaattorit** näkevät vain Tuotanto ja Paketit-näkymän (Laskin piilotettu).

---

## Laskin

### Laskurit

1. Janisol Pariovi  
2. Janisol Käyntiovi  
3. Economy Pariovi  
4. Economy Käyntiovi  
5. Janisol Ikkuna  
6. Economy Ikkuna  

### Ovilaskurien erikoistilat

- **Umpiovi** — erilliset kaavat; tulosnäkymä supistuu tilaan sopivaksi  
- **Umpivasikka** — pariovissa, kun umpiovi ei ole päällä  
- **Potkupelti** — päälle / pois  
- **Tiivistyskynnys**, **rako**, **ruutujen määrä**   
- **Aktiivinen kaavasetti** — vaihdettavissa asetuksista  

### Tulosten vienti

- Kopioi leikepöydälle  
- Vie PDF  
- **Siirrä** tulokset Tuotanto-näkymään työnumeron alle (ikkunoille valinnainen yhdistetty leveys)  


---

## Tuotanto-näkymä

Rakenne: **työnumero → tuote** (esim. työnumero `TYO-1001`, tuote `Ovi A` — vain esimerkkejä dokumentaatiossa).

### Tuotekohtaiset toiminnot

- Avaa / sulje yksityiskohdat  
- Muistiinpano (tuote- ja työnumero tasolla)  
- **Lasilistat**-checkpoint  
- **Tehty**-checkpoint (vaatii lasilistat)  
- **(pakattu!)** kun tuote on merkitty pakkausluettelossa  
- **Muokkaa nimeä**, **Piilota** / näytä piilotetut  
- **Syötteet**-modaali (laskurista siirretyt syötteet, syötteiden muokkaus, synkataan Firestoreen)  
- Kopioi tuotteen tiedot, PDF-vienti  

### Työnumero-otsikko

- Laskuri muodossa `(X KPL / Y TEHTY)` — kokonaismäärä ja tehty-merkityt  
- Haku työnumeroille, tuotteille ja lasilistoille  
- Täysin pakatut työt siirtyvät Paketit-näkymään  

### Työkalupalkki

| Nappi | Toiminto |
|-------|----------|
| Tee pakkausluettelo | Valitse tuotteet → pakkaaja → PDF |
| Lasilistat PDF | Monivalinta ja lasilistojen PDF |
| Näytä piilotetut | Piilotettujen tuotteiden hallinta |
| Varmuuskopio | Admin: lataa koko tuotantodatan JSON-tiedostona |

---

## Pakkausluettelo

1. Aktivoi pakkausluettelotila Tuotanto-näkymässä.  
2. Valitse työnumero ja tuotteet.  
3. Syötä pakkaajan nimi; järjestelmä ehdottaa seuraavaa pakettinumeroa.  
4. Lataa PDF (sisältää pakettinumero-sivun, esim. **PAKETTI 1**).  

**Vaikutukset:**

- Merkitsee valitut tuotteet pakatuiksi (`packedMitat`) ja näyttää `(pakattu!)`.  
- Tallentaa pakkausajan (`packedTimestamps`) — synkataan Firestoreen.  
- Jos **tehty**-merkintä poistetaan, pakattu-merkintä poistuu automaattisesti.  

---

## Paketit-näkymä

Näyttää työt, joissa kaikki tuotteet on merkitty pakatuiksi.

- Haku työnumerolla, tuotteella tai päivämäärällä  
- Järjestys viimeisimmän pakkausajan mukaan  
- Pakettikohtaiset väliotsikot ja pakkausajat  
- Admin: drag-and-drop tuotteiden siirto pakettien välillä  
- **Tiedot** / syötteet pakatuille tuotteille  
- **Varmuuskopio**-nappi (admin)  

---

## Käyttäjäroolit

Sovellusta käyttää yhden tehtaan noin kymmenen työntekijää. Jaettu reaaliaikainen tuotantotila on **tarkoituksellinen** — kaikkien pitää nähdä samat merkinnät.

Roolit määritellään sähköpostiosoitteiden perusteella `app.js`-tiedostossa. **Älä tallenna salasanoja tai oikeita käyttäjätunnuksia versionhallintaan.**

| Rooli | Oikeudet |
|-------|----------|
| **Peruskäyttäjä** | Laskin, Tuotanto, Paketit, asetukset, esiasetukset, pakkausluettelot |
| **Admin** | Kaikki yllä + kaavahallinta, työnumeron/tuotteen poisto, Paketit drag-and-drop, varmuuskopion lataus |
| **Koordinaattori** | Vain Tuotanto ja Paketit -näkymä |

Admin- ja koordinaattorisähköpostit: `ADMIN_EMAILS` ja `COORDINATOR_EMAILS` tiedostossa `app.js`. Firestore-sääntöjen admin-lista (`firestore.rules`) pidettävä linjassa admin-sähköpostien kanssa.

---

## Varmuuskopio (admin)

Admin-käyttäjä voi ladata Tuotanto- tai Paketit-näkymästä **JSON-varmuuskopion** koneelleen.

- Molemmat napit lataavat saman täydellisen snapshotin (ero on vain tiedoston nimi ja metadata).  
- Sisältää `mittatState`-datan ja syötekartan (`inputs`).  
- **Lukuoperaatio** — ei muuta Firestorea tai localStoragea.  
- Tarkoitettu myöhempää palautusta varten (restore-toiminto toteutetaan erikseen).  

Tiedostomuoto (esimerkkirakenne, ei oikeaa dataa):

```json
{
  "exportedAt": "2026-01-15T10:00:00.000Z",
  "exportedBy": "admin@yrityksen-domain.fi",
  "source": "tuotanto",
  "version": 1,
  "mittatState": { },
  "inputs": { }
}
```

---

## Tekninen rakenne

### Frontend

| Tiedosto | Rooli |
|----------|--------|
| `index.html` | UI-rakenne, Bootstrap 5, Firebase- ja jsPDF-CDN |
| `styles.css` | Teemat ja layout |
| `app.js` | Laskenta, näkymät, Firestore-synkka, PDF |

**Kirjastot (CDN):** Bootstrap 5.3, jsPDF 2.5, Firebase JS 12.8 (Auth + Firestore).

Sovellus on **Vanilla JS** -pohjainen. Staattinen hosting: `index.html` + `app.js` (esim. GitHub Pages tai paikallinen HTTP-palvelin).

### Firestore

| Polku | Sisältö |
|-------|---------|
| `presets` | Esiasetukset |
| `checkedStates/global` | Laskurien checkbox-tilat |
| `formulaSets` | Kaavasetit |
| `mitatState/global` | Tuotantodata: mitat, checkpointit, pakkausmerkinnät, muistiinpanot jne. |
| `mitatState/inputs` | Tuotantoon siirrettyjen syötteiden kartta |

### Synkronointisuojaus

Kriittiset suojaukset estävät tyhjän datan kirjoittamisen Firestoreen:

- **`mitatStateLoaded`** — synkka ei ajaudu ennen ensimmäistä Firestore-latausta  
- **`lastKnownJobCount`** — estää tyhjän `mittatData`-objektin ylikirjoittamisen, jos localStorage tyhjenee vahingossa latauksen jälkeen  

Lisätietoa kehittäjille: `.cursor/skills/terasovi-firebase-sync/SKILL.md`.

---

## Tietoturva ja käyttömalli

### Kenelle sovellus on tarkoitettu?

- Yhden tehtaan sisäinen työkalu, luotettu pieni käyttäjäryhmä  
- Ei multi-tenant- tai asiakaskohtaista eristystä  

### Miten pääsy suojataan?

- Kirjautuminen Firebase Authenticationilla (sähköposti + salasana)  
- Firestore-säännöt: vain kirjautuneet käyttäjät lukevat/kirjoittavat tuotantodataa  
- Käyttäjät luodaan Firebase Consolessa — **älä ota käyttöön avointa rekisteröitymistä** tuotannossa  

### Mitä README ei sisällä?

- Käyttäjätunnuksia, salasanoja tai Firebase-avaimia  
- Oikeita työnumeroita, asiakasnimiä tai tuotantodataa  

Firebase-konfiguraatio on `index.html`:ssä (normaali client-sovelluksen malli). API-avain ei yksinään anna pääsyä dataan — pääsy vaatii kelvollisen kirjautumisen.

### Tunnettu rajoitus

Kaikki kirjautuneet käyttäjät voivat Firestore-tasolla lukea ja kirjoittaa jaettua tuotantodataa. Tämä on tarkoituksellista yhteistyön vuoksi. Admin-toiminnot UI:ssa (poisto, kaavahallinta) on rajattu koodissa, mutta tuotantodatan täysi kirjoitusoikeus on jaettu kaikille kirjautuneille Firestore-sääntöjen mukaan.

---

## Asennus ja käynnistys

### Paikallinen testaus (suositus)

```bash
cd /polku/projektiin
python -m http.server 8080
```

Avaa selaimessa: `http://localhost:8080`

### Huomioita

- `index.html` suoraan tiedostona voi toimia, mutta clipboard, PDF ja Firebase ovat luotettavampia localhostilla.  
- Kun muutat `app.js` tai `styles.css`, päivitä cache-bust `index.html`:ssä (`?v=…`) jotta selain lataa uuden version.  

---

## Firebase-käyttöönotto

1. Luo Firebase-projekti ja ota käyttöön **Authentication** (Email/Password) ja **Firestore**.  
2. Lisää Firebase-konfiguraatio `index.html`:ään (`firebaseConfig`).  
3. Luo käyttäjät Firebase Consolessa (älä commitoi tunnuksia repoihin).  
4. Julkaise `firestore.rules` Firebase Consoleen.  
5. Pidä `ADMIN_EMAILS` (`app.js`) ja rulesin admin-sähköpostilistat synkassa.  
6. Rajaa **Authorized domains** vain tarvittaviin osoitteisiin.  

Tarkemmat asennusohjeet: [FIREBASE-ASENNUS.md](FIREBASE-ASENNUS.md) — tarkista, ettei vanhoissa ohjeissa ole vanhentuneita salasanoja tai tunnuksia ennen käyttöä.

---

## Kehitys ja julkaisu

### Cache-versiot

`index.html` viittaa skripteihin versioparametrilla, esim.:

```html
<script src="app.js?v=20260614R1"></script>
```

Nosta versiota aina kun `app.js` tai `styles.css` muuttuu merkittävästi.

### Git / GitHub Pages

- Julkaise `index.html`, `app.js`, `styles.css`, `firestore.rules` ja staattiset assetit.  
- Älä commitoi `.env`-tiedostoja, salasanoja tai varmuuskopio-JSON-tiedostoja.  
- Firestore-säännöt deployataan erikseen Firebase Consoleen (ei automaattisesti Git pushista).  

---

## Tiedostorakenne

```text
.
├── index.html          # Pääsivu + Firebase CDN
├── styles.css          # Tyylit
├── app.js              # Sovelluslogiikka
├── firestore.rules     # Firestore Security Rules
├── gradus-logo.svg     # Brändi / logo
├── README.md           # Tämä tiedosto
├── FIREBASE-ASENNUS.md
├── PIKA-ALOITUS.md
├── TESTIT.md
├── TESTAUSOHJEET.md
├── .cursor/skills/     # Agentti-/kehityssäännöt (ei runtime)
└── plans/              # Kehityssuunnitelmat (ei runtime)
```

---

## Muu dokumentaatio

| Tiedosto | Sisältö |
|----------|---------|
| [FIREBASE-ASENNUS.md](FIREBASE-ASENNUS.md) | Firebase-projektin asennus |
| [PIKA-ALOITUS.md](PIKA-ALOITUS.md) | Pika-aloitus (tarkista ajantasaisuus) |
| [TESTAUSOHJEET.md](TESTAUSOHJEET.md) | Manuaaliset testit |
| [TESTIT.md](TESTIT.md) | Laskentaesimerkit |

> **Huom:** Vanhemmat tiedostot (`YHTEENVETO.md`, `KÄYTTÖÖNOTTO.md`, osa muista ohjeista) voivat viitata vanhentuneeseen kirjautumistapaan tai vanhaan ominaisuuslistaan. Luota tähän README:hen ja nykyiseen `app.js`-koodiin.

---

## Ylläpito (tiivistelmä)

- Käyttäjäroolit: `ADMIN_EMAILS`, `COORDINATOR_EMAILS` → `app.js`  
- Firestore admin-sähköpostit: `firestore.rules`  
- Älä synkkaa `mitatState` ennen `mitatStateLoaded === true`  
- Admin: lataa säännöllinen JSON-varmuuskopio ennen suuria muutoksia  
- Ennen tuotantoon vientiä: rules julkaistu, domainit rajattu, cache-versiot päivitetty  
