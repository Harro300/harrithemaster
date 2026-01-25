# 🧪 Testausohjeet - Harrin Teräsovi Mittalaskuri

## 🎯 Nopea Testaus (5 minuuttia)

### 1️⃣ Avaa Sovellus
```
Tiedosto: C:\Users\Harri\.cursor\index.html
Tapa: Kaksoisklikkaa TAI vedä selaimeen
```

### 2️⃣ Testaa Kirjautuminen

**Testi 1: Väärä salasana**
- Syötä: `vääräsalasana`
- Paina: Enter
- ✅ Odotettu: Näkyy virheviesti "Väärä salasana!"

**Testi 2: Oikea salasana #1**
- Syötä: `Soma<3`
- Paina: Enter
- ✅ Odotettu: Pääsee valikkoon

**Testi 3: Oikea salasana #2**
- Päivitä sivu (F5)
- Syötä: `Harri10K`
- Paina: Kirjaudu-painike
- ✅ Odotettu: Pääsee valikkoon

---

## 📐 3️⃣ Testaa Economy Käyntiovi (HELPOIN)

### Avaa Laskuri:
- Klikkaa: "Economy Käyntiovi"

### Syötä Testimitat:
```
Käyntioven leveys: 800
Potkupellin oletuskorkeus: 300
Ruudun korkeus: 2000
```

### Tarkista Tulokset:
Tulossivun pitäisi näyttää:

**Lasilista:**
- 2038 x 2 (pystylistat)
- 798 x 2 (vaakalistat)

**Uretaani:**
- 179 x 841

**Potkupelti:**
- 235 x 910 (Sisäpuoli)
- 280 x 960 (Ulkopuoli)

**Harjalista:**
- 941

✅ **Jos luvut täsmäävät → Laskenta toimii!**

---

## 🔬 4️⃣ Testaa Janisol Pariovi (MONIPUOLISIN)

### Avaa Laskuri:
- Takaisin valikkoon
- Klikkaa: "Janisol Pariovi"

### Syötä Testimitat:
```
Käyntioven leveys: 795
Lisäoven leveys: 625
Potkupellin oletuskorkeus: 300
Ruudun korkeus: 1900
```

### Tarkista Tulokset:

**Lasilista:**
- 1941 x 4 (pystylistat, 2 per ovi)
- 798 x 2 (vaakalistat käyntiovi)
- 628 x 2 (vaakalistat lisäovi)

**Uretaani:**
- 174 x 841 (käyntiovi)
- 174 x 671 (lisäovi)

**Potkupelti:**
- 233 x 910 (Käyntiovi sisäpuoli)
- 282 x 960 (Käyntiovi ulkopuoli)
- 233 x 765 (Lisäovi sisäpuoli)
- 282 x 765 (Lisäovi ulkopuoli)

**Harjalista:**
- 936 (käyntiovi)
- 766 (lisäovi)

✅ **Jos luvut täsmäävät → Pariovi toimii!**

---

## ⚙️ 5️⃣ Testaa Asetukset

### Testaa Rako-asetukset:

**Testi 1: 10mm rako**
1. Klikkaa "Asetukset" (oikeassa yläkulmassa)
2. Valitse: "10 mm rako"
3. Sulje modal
4. Syötä samat mitat kuin edellä (Economy Käyntiovi):
   - Leveys: 800
   - Potkupelti: 300
   - Ruutu: 2000

**Odotetut tulokset:**
- Sisäpotkupelti: 267 x 910 (235 + 32 = 267)
- Ulkopotkupelti: 287 x 960 (280 + 7 = 287)

✅ **Jos luvut täsmäävät → Rako-asetukset toimii!**

**Testi 2: 15mm rako**
1. Asetukset → "15 mm rako"
2. Tarkista tulokset:
   - Sisä: 262 x 910 (235 + 27 = 262)
   - Ulko: 282 x 960 (280 + 2 = 282)

✅ **Toimii? → Kaikki rako-vaihtoehdot OK!**

### Testaa Useita Ruutuja:

**Testi: 2 ruutua**
1. Asetukset → "Ruutujen määrä: 2"
2. Sulje modal
3. Huomaa: Nyt on 2 syöttökenttää:
   - Ruutu 1 korkeus: 1000
   - Ruutu 2 korkeus: 800
4. Syötä muut arvot (Economy Käyntiovi):
   - Leveys: 800
   - Potkupelti: 300

**Odotetut lasilistat:**
- 1038 x 2 (ruutu 1 pysty)
- 838 x 2 (ruutu 2 pysty)
- 798 x 4 (vaakalistat, 2 per ruutu)

✅ **Näkyykö kaikki 3 riviä? → Useat ruudut toimii!**

---

## 💾 6️⃣ Testaa Tallenna/Lataa

### Testaa Tallenna:
1. Täytä jokin laskuri mitoilla
2. Klikkaa: "Tallenna"
3. Anna nimi: `Testiovi1`
4. Klikkaa: "Tallenna"
5. ✅ Pitäisi näkyä: "Esiasetus tallennettu!"

### Testaa Lataa:
1. Tyhjennä kentät (vaihda toiseen laskuriin ja takaisin)
2. Klikkaa: "Lataa"
3. Näkyykö lista: "Testiovi1"?
4. Klikkaa: "Lataa" (Testiovi1:n kohdalla)
5. ✅ Kentät täyttyvät automaattisesti!

### Testaa Poista:
1. Klikkaa: "Lataa"
2. Klikkaa: "Poista" (Testiovi1:n kohdalla)
3. Vahvista poisto
4. ✅ Esiasetus katoaa listasta

---

## 📄 7️⃣ Testaa PDF-vienti

### Generoi PDF:
1. Täytä laskuri mitoilla
2. Klikkaa: "Vie PDF:ksi"
3. ✅ PDF:n pitäisi ladata automaattisesti

### Avaa PDF ja tarkista:
- ✅ Otsikko: "Harrin Teräsovi Mittalaskuri"
- ✅ Laskurin nimi (esim. "Janisol Pariovi")
- ✅ Syötetyt arvot (leveydet, korkeudet)
- ✅ Kaikki tulokset (Lasilista, Uretaani, Potkupelti, Harjalista)

---

## 🔥 8️⃣ Testaa Erikoistilanteet

### Testi 1: Korkeus > 310mm (Vähennys)

**Syötteet (Economy Käyntiovi):**
```
Leveys: 800
Potkupellin korkeus: 320  ← Yli 310!
Ruudun korkeus: 2000
```

**Odotetut tulokset:**
- Sisä: 255 x 910 (ei muutosta)
- Ulko: 300 x 955 ← HUOM! 960 - 5 = 955

✅ **Jos ulkopuoli on 955 → Vähennys toimii!**

### Testi 2: Yhdistäminen (Useat samat mitat)

**Syötteet (Janisol Pariovi, 2 ruutua):**
```
Käyntiovi: 800
Lisäovi: 800  ← Sama!
Potkupelti: 300
Ruutu 1: 1900
Ruutu 2: 1900  ← Sama!
```

**Odotetut lasilistat:**
- 1941 x 8 ← Pitäisi yhdistää (4 + 4)
- 803 x 8 ← Pitäisi yhdistää (4 + 4)

✅ **Jos näkyy x 8 eikä x 4 + x 4 → Yhdistäminen toimii!**

### Testi 3: Validointi (Negatiiviset luvut)

1. Syötä: Leveys = -100
2. ✅ Selain ei salli negatiivisia (HTML validointi)

### Testi 4: Tyhjät Kentät

1. Jätä "Ruudun korkeus" tyhjäksi
2. ✅ Tulokset eivät näy (ei virhettä)

---

## 📱 9️⃣ Testaa Responsiivisuus

### Desktop (Tietokone):
1. Avaa sovellus normaalikoossa
2. ✅ Kortit vierekkäin (2 saraketta)
3. ✅ Kaikki näkyy hyvin

### Mobiili (Puhelin):
1. Paina F12 → Developer Tools
2. Klikkaa: Device Toggle (mobiili-ikoni)
3. Valitse: iPhone tai Samsung
4. ✅ Kortit allekkain (1 sarake)
5. ✅ Napit isoja, helppo klikata
6. ✅ Syöttökentät täyttävät leveyden

### Tabletti:
1. Developer Tools → Valitse: iPad
2. ✅ Kortit vierekkäin
3. ✅ Hyvä välistys

---

## 🎯 10️⃣ Täydellinen Testiskenaario

### Täysi Testikierros (10 min):

```
1. Avaa sovellus
2. Kirjaudu: Soma<3
3. Valitse: Economy Käyntiovi
4. Syötä: 800 / 300 / 2000
5. Tarkista: Tulokset näkyvät
6. Asetukset → 10mm rako
7. Tarkista: Luvut muuttuvat
8. Tallenna: "Testi1"
9. Takaisin valikkoon
10. Valitse: Janisol Pariovi
11. Lataa: "Testi1"
12. Syötä: Lisäoven leveys 600
13. Vie PDF:ksi
14. Avaa PDF ja tarkista
15. Takaisin sovellukseen
16. Testaa muut laskurit
```

✅ **Jos kaikki toimii → Sovellus täysin toimiva!**

---

## ✅ Tarkistuslista

Käy läpi kaikki testit:

### Perustoiminnot:
- [ ] Kirjautuminen toimii (oikeat salasanat)
- [ ] Väärä salasana näyttää virheen
- [ ] Kaikki 4 laskuria avautuu
- [ ] Takaisin-painike toimii

### Laskenta:
- [ ] Economy Käyntiovi laskee oikein
- [ ] Economy Pariovi laskee oikein
- [ ] Janisol Käyntiovi laskee oikein
- [ ] Janisol Pariovi laskee oikein
- [ ] Reaaliaikainen päivitys toimii

### Asetukset:
- [ ] Rako 8mm (oletus)
- [ ] Rako 10mm (+32/+7)
- [ ] Rako 15mm (+27/+2)
- [ ] Ruutujen määrä 1-5
- [ ] Syöttökentät päivittyvät

### Tallennukset:
- [ ] Tallenna toimii
- [ ] Lataa toimii
- [ ] Poista toimii
- [ ] Tyhjä lista näyttää viestin

### PDF:
- [ ] PDF generoidaan
- [ ] PDF sisältää otsikon
- [ ] PDF sisältää syötteet
- [ ] PDF sisältää tulokset
- [ ] PDF latautuu

### Erikoistilanteet:
- [ ] Korkeus > 310mm → -5mm
- [ ] Yhdistäminen toimii (x 2, x 4)
- [ ] Validointi toimii
- [ ] Tyhjät kentät → ei tuloksia

### Responsiivisuus:
- [ ] Desktop näkymä OK
- [ ] Mobiili näkymä OK
- [ ] Tabletti näkymä OK

---

## 🐛 Jos Löydät Virheen

### Raportoi:
1. Mitä teit? (vaiheet)
2. Mitä odotit? (tulos)
3. Mitä tapahtui? (virhe)
4. Selaimen konsoli (F12 → Console)

### Yleisimmät Ongelmat:

**Ongelma: Tulokset eivät näy**
- Ratkaisu: Tarkista että kaikki kentät täytetty

**Ongelma: PDF ei lataa**
- Ratkaisu: Varmista internetyhteys (jsPDF CDN)

**Ongelma: Esiasetukset katoavat**
- Ratkaisu: Älä tyhjennä selaimen välimuistia

---

## 📊 Nopea Yhteenveto

### Minimivaatimus (1 min):
```
1. Avaa index.html
2. Kirjaudu: Soma<3
3. Economy Käyntiovi: 800/300/2000
4. Tarkista tulokset
✅ Toimii? → Perus toimii!
```

### Suositeltu (5 min):
```
+ Testaa pariovi
+ Testaa asetukset
+ Testaa tallenna/lataa
+ Testaa PDF
✅ Toimii? → Kaikki toimii!
```

### Täydellinen (15 min):
```
+ Testaa kaikki 4 laskuria
+ Testaa kaikki rako-vaihtoehdot
+ Testaa useat ruudut
+ Testaa erikoistilanteet
+ Testaa mobiili
✅ Toimii? → 100% valmis!
```

---

## 🎉 Valmista!

Jos kaikki testit menee läpi → **SOVELLUS TOIMII TÄYDELLISESTI!**

**Hyvää testausta!** 🧪🔬✅

