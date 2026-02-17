# Harrin Teräsovi Mittalaskuri

Selkeä ja käyttäjäystävällinen sovellus, joka laskee teräsovien komponenttien (potkupeltien, uretaanipalojen, harjalistojen ja lasilistojen) leikkausmitat syötettyjen ovimittojen perusteella.

## Ominaisuudet

### 🔐 Salasanasuojaus
- Sovellus vaatii kirjautumisen

### 🚪 Neljä Laskuria
1. **Janisol Pariovi** - Janisol-tyylinen pariovi
2. **Janisol Käyntiovi** - Janisol-tyylinen yksittäisovi
3. **Economy Pariovi** - Economy-tyylinen pariovi
4. **Economy Käyntiovi** - Economy-tyylinen yksittäisovi

### 📊 Laskennat
Jokainen laskuri laskee automaattisesti:
- **Lasilistat** - Pysty- ja vaakalistat jokaiselle ruudulle
- **Uretaanipalat** - Eristysosat
- **Potkupellit** - Sisä- ja ulkopuolen pellit
- **Harjalistat** - Tiivistyslistat

### ⚙️ Asetukset
- **Rako-vaihtoehdot**: 8 mm (oletus), 10 mm, 15 mm
- **Ruutujen määrä**: 1-5 ruutua
- Asetukset vaikuttavat laskentakaavoihin automaattisesti

### 💾 Esiasetukset
- Tallenna usein käytettyjä mittoja omilla nimillä
- Lataa tallennetut esiasetukset nopeasti
- Poista tarpeettomat esiasetukset

### 📄 PDF-Vienti
- Vie laskentatulokset PDF-muodossa
- Sisältää kaikki syötteet ja tulokset
- Selkeä ja ammattimainen muotoilu

## Käyttöohje

### 1. Kirjautuminen
- Avaa `index.html` selaimessa
- Syötä salasana: `Soma<3` tai `Harri10K`
- Paina "Kirjaudu sisään"

### 2. Laskurin Valinta
- Valitse haluamasi laskuri päävalikosta
- Neljä vaihtoehtoa käytettävissä

### 3. Mittojen Syöttäminen
- **Käyntioven leveys** (mm) - Pakollinen
- **Lisäoven leveys** (mm) - Vain pariovissa
- **Potkupellin oletuskorkeus** (mm) - Oletus: 300 mm
- **Ruudun korkeus** (mm) - Yksi tai useampi riippuen asetuksista

### 4. Asetusten Muokkaus
- Paina "⚙️ Asetukset" -painiketta
- Valitse rako (8/10/15 mm)
- Valitse ruutujen määrä (1-5)
- Asetukset päivittyvät automaattisesti

### 5. Tulosten Tarkastelu
- Tulokset näkyvät reaaliajassa oikealla puolella
- Järjestetty selkeästi: Lasilista → Uretaani → Potkupelti → Harjalista
- Samanlaiset mitat yhdistetty (esim. "841 x 4")

### 6. Esiasetukset
- **Tallenna**: Paina "💾 Tallenna", anna nimi, vahvista
- **Lataa**: Paina "📂 Lataa", valitse esiasetus listasta
- **Poista**: Paina 🗑️-ikonia esiasetuksen vieressä

### 7. PDF-Vienti
- Paina "📄 Vie PDF:ksi" -painiketta
- PDF latautuu automaattisesti
- Sisältää laskurin nimen, syötteet ja tulokset

## Laskentakaavat

### Janisol Lasilistat
- **Pystylista**: Ruudun korkeus + 41 mm
- **Vaakalista**: Oven leveys + 3 mm

### Economy Lasilistat
- **Pystylista**: Ruudun korkeus + 38 mm
- **Vaakalista**: Oven leveys - 2 mm

### Uretaanipalat
- **Janisol**: Korkeus = Potkupellin korkeus - 126 mm, Leveys = Oven leveys + 46 mm
- **Economy**: Korkeus = Potkupellin korkeus - 121 mm, Leveys = Oven leveys + 41 mm

### Potkupellit
Vaihtelevat ovi- ja rako-tyypin mukaan. Tarkemmat kaavat sisäänrakennettuna.

### Rako-Vaikutukset
- **10 mm rako**: Sisäpelti +32 mm, Ulkopelti +7 mm
- **15 mm rako**: Sisäpelti +27 mm, Ulkopelti +2 mm

### Erikoissäännöt
- Jos potkupellin korkeus > 310 mm, ulkopellin leveydestä vähennetään 5 mm
- Jokaisessa ruudussa aina 2 pystylistaa + 2 vaakalistaa

## Tekniset Tiedot

### Teknologiat
- HTML5
- CSS3 (Bootstrap 5)
- JavaScript (Vanilla)
- jsPDF (PDF-generointiin)

### Selainyhteensopivuus
- Chrome (suositeltu)
- Firefox
- Safari
- Edge

### Responsiivisuus
- Täysi mobiilituki
- Tabletti-optimoitu
- Desktop-ystävällinen

## Tiedostot

```
harrin-terasovi-mittalaskuri/
├── index.html          # Pääsivu
├── styles.css          # Tyylit
├── app.js             # Sovelluslogiikka
└── README.md          # Tämä tiedosto
```

## Käynnistäminen

1. Lataa kaikki tiedostot samaan kansioon
2. Avaa `index.html` verkkoselaimessa
3. Ei vaadi palvelinta - toimii suoraan selaimessa

## Tuki ja Yhteystiedot

Tämä sovellus on luotu Harrin teräsovien mittalaskentaa varten.
Kaikki laskentakaavat perustuvat annettuihin spesifikaatioihin.

---

**Versio**: 1.0
**Viimeisin päivitys**: Joulukuu 2025
