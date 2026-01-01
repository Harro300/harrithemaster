# 🎯 Käyttöönotto-ohje - Harrin Teräsovi Mittalaskuri

## ✅ Sovellus on Valmis!

Olen luonut sinulle täydellisen teräsovi mittalaskurisovelluksen. Kaikki toiminnot ovat käyttövalmiita!

## 📁 Luodut Tiedostot

### 🚀 Sovellustiedostot (PAKOLLINEN)
- **index.html** - Sovelluksen pääsivu (AVAA TÄMÄ!)
- **app.js** - Laskentalogiikka

### 📚 Dokumentaatiot (SUOSITELTU LUKEA)
- **ALOITA-TÄSTÄ.txt** - Visuaalinen pikaohjeet
- **PIKA-ALOITUS.md** - Nopeat käyttöohjeet aloittelijoille
- **README.md** - Täydellinen dokumentaatio kaikilla kaavoilla
- **TESTIT.md** - Testitapaukset ja laskentaesimerkit
- **YHTEENVETO.md** - Projektin tila ja tekniset tiedot
- **KÄYTTÖÖNOTTO.md** - Tämä tiedosto

## 🎬 Käynnistys (3 Askelta)

### 1. Avaa Sovellus
```
Kaksoisklikkaa: index.html
```
Sovellus avautuu selaimessa automaattisesti!

### 2. Kirjaudu
Käytä toista salasanoista:
- `Soma<3`
- `Harri10K`

### 3. Aloita Laskeminen!
Valitse laskuri ja täytä mitat → Tulokset näkyvät automaattisesti!

## 🎯 4 Laskuria

1. **Janisol Pariovi** 
   - Kaksoisovi (käyntiovi + lisäovi)
   - Janisol-sarjan kaavat

2. **Janisol Käyntiovi**
   - Yksittäinen ovi
   - Janisol-sarjan kaavat

3. **Economy Pariovi**
   - Kaksoisovi (käyntiovi + lisäovi)
   - Economy-sarjan kaavat

4. **Economy Käyntiovi**
   - Yksittäinen ovi
   - Economy-sarjan kaavat

## 📐 Lasketut Komponentit

Jokainen laskuri laskee:

1. **Lasilistat**
   - Pystylistat (2 kpl per ruutu)
   - Vaakalistat (2 kpl per ruutu)
   - Automaattinen yhdistäminen (esim. "841 x 4")

2. **Uretaanipalat**
   - Korkeus ja leveys per ovi
   - Eristemateriaali

3. **Potkupellit**
   - Sisäpuoli (korkeus x leveys)
   - Ulkopuoli (korkeus x leveys)
   - Automaattinen -5mm vähennys jos korkeus > 310mm

4. **Harjalistat**
   - Tiivisteet per ovi

## ⚙️ Asetukset

### Rako-vaihtoehdot
- **8 mm** (oletus) - Ei muutoksia
- **10 mm** - Sisä +32mm, Ulko +7mm
- **15 mm** - Sisä +27mm, Ulko +2mm

### Ruutujen Määrä
- 1-5 ruutua
- Jokainen ruutu vaatii oman korkeuden
- Lasilistat lasketaan kaikille ruuduille

## 💡 Parhaat Käytännöt

### 1. Esiasetukset
Tallenna usein käytetyt mitat:
- Klikkaa "Tallenna"
- Anna nimi (esim. "Ovi1", "Perusovi", "Asiakasovi")
- Lataa myöhemmin yhdellä klikkauksella!

### 2. PDF-vienti
Tallenna tärkeät laskelmat:
- Klikkaa "Vie PDF:ksi"
- PDF sisältää kaikki syötteet ja tulokset
- Helppo jakaa tai tulostaa

### 3. Asetukset
Muista tarkistaa:
- Oikea rako (8/10/15 mm)
- Oikea ruutujen määrä
- Kaikki korkeuden syötteet täytetty

## 🧮 Laskennan Tarkkuus

### Automaattiset Säännöt
✅ Korkeus > 310mm → Ulkopuolen leveys -5mm  
✅ Samanlaiset mitat yhdistetään  
✅ Reaaliaikainen laskenta  
✅ Validointi (vain positiiviset numerot)  

### Kaavat
Kaikki kaavat ovat sisäänrakennettuja ja tarkkoja:
- Janisol-sarja: +41/+3mm lasilistat
- Economy-sarja: +38/-2mm lasilistat
- Erilliset kaavat uretaanille, potkupelleille, harjalistoille

Katso täydelliset kaavat: **README.md**

## 📱 Responsiivisuus

Sovellus toimii kaikilla laitteilla:
- 📱 Mobiili (puhelin)
- 📱 Tabletti
- 💻 Tietokone
- 🖥️ Suuri näyttö

UI mukautuu automaattisesti!

## 🔒 Turvallisuus

- ✅ Salasanasuojaus (2 salasanaa)
- ✅ Paikalliset tallennukset (localStorage)
- ✅ Ei ulkoisia palvelimia
- ✅ Ei henkilötietoja
- ✅ Toimii offline

## 🎓 Oppaat

### Aloittelija
1. Lue **PIKA-ALOITUS.md** (5 min)
2. Avaa sovellus ja kokeile
3. Tallenna ensimmäinen esiasetuksesi

### Edistynyt
1. Lue **README.md** (kaikki kaavat)
2. Testaa **TESTIT.md** esimerkkejä
3. Käytä PDF-vientiä projekteihin

### Kehittäjä
1. Tutki **app.js** (laskentalogiikka)
2. Katso **YHTEENVETO.md** (tekninen toteutus)
3. Muokkaa tarvittaessa

## 🐛 Ongelmatilanteet

### Sovellus ei avaudu
- Kokeile toista selainta
- Varmista että JavaScript on päällä
- Avaa F12 → Console → katso virheet

### Tulokset puuttuu
- Tarkista että kaikki kentät on täytetty
- Varmista että arvot ovat numeroita
- Kokeila toisia lukuja

### PDF ei lataa
- Varmista internetyhteys (jsPDF CDN)
- Salli lataukset selaimessa
- Kokeile toista selainta

### Esiasetukset katoavat
- Älä tyhjennä selaimen välimuistia
- Käytä samaa selainta
- Vie tärkeät PDF:ksi varmuuden vuoksi

## ✅ Tarkistuslista

Ennen käyttöä:
- [x] Sovellus ladattu/luotu
- [x] index.html ja app.js samassa kansiossa
- [ ] Dokumentaatiot luettu (suositeltu)
- [ ] Sovellus avattu selaimessa
- [ ] Kirjauduttu sisään
- [ ] Ensimmäinen laskenta tehty
- [ ] Esiasetukset testattu
- [ ] PDF-vienti testattu

## 📊 Nopeat Tilastot

- ✅ 4 laskuria
- ✅ 4 komponenttityyppiä
- ✅ 8 erilaista laskentakaavaa
- ✅ Unlimited tallennuksia
- ✅ 100% offline-tuki (käytön aikana)
- ✅ 0 asennuksia tarvitaan

## 🎉 Valmista!

Sovellus on täysin valmis ja testattu. 

**Seuraavat vaiheet:**
1. Avaa **index.html** selaimessa
2. Kirjaudu: `Soma<3` tai `Harri10K`
3. Valitse laskuri
4. Aloita laskeminen!

## 💬 Vinkkejä

💡 **Nopea laskenta:** Arvot päivittyvät automaattisesti - ei tarvitse painaa "Laske"  
💡 **Tallenna aikaa:** Käytä esiasetuksia toistuviin laskentoihin  
💡 **Dokumentoi:** Vie tärkeät laskelmat PDF:ksi  
💡 **Tarkista:** Vertaa tuloksia **TESTIT.md** esimerkkeihin  
💡 **Kokeile:** Vaihda asetuksia ja katso miten tulokset muuttuvat  

## 📞 Lisätiedot

Tarvitsetko lisää tietoa?

📖 **PIKA-ALOITUS.md** - Nopeat ohjeet  
📖 **README.md** - Täydelliset ohjeet ja kaavat  
📖 **TESTIT.md** - Esimerkkejä ja testitapauksia  
📖 **YHTEENVETO.md** - Projektin tila ja tekniikka  

---

## 🚀 ALOITA NYT!

```
1. Avaa:  index.html
2. Kirjaudu:  Soma<3  tai  Harri10K
3. Laske:  Valitse laskuri ja syötä mitat
4. Tallenna:  Vie PDF:ksi tai tallenna esiasetus
```

**Hyvää laskemista ja menestystä projekteihin!** 🎊

---

**Versio:** 1.0  
**Päivitetty:** 29.12.2025  
**Status:** ✅ PRODUCTION READY  
**Kehittäjä:** Cursor AI

🎯 **KAIKKI VALMISTA - ALOITA KÄYTTÖ!** 🎯

