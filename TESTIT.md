# Testitapaukset - Harrin Teräsovi Mittalaskuri

## Testaus 1: Janisol Pariovi (8mm rako, 1 ruutu)

### Syötteet:
- Käyntioven leveys: 795 mm
- Lisäoven leveys: 625 mm
- Potkupellin korkeus: 300 mm
- Rako: 8 mm
- Ruutujen määrä: 1
- Ruudun korkeus: 1900 mm

### Odotetut Tulokset:

**Lasilistat:**
- Pystylista: 1900 + 41 = 1941 mm (x 4 kpl, 2 per ovi)
- Vaakalista käyntiovi: 795 + 3 = 798 mm (x 2 kpl)
- Vaakalista lisäovi: 625 + 3 = 628 mm (x 2 kpl)

**Uretaani:**
- Käyntiovi: (300 - 126) x (795 + 46) = 174 x 841
- Lisäovi: (300 - 126) x (625 + 46) = 174 x 671

**Potkupellit:**
- Käyntiovi sisä: (300 - 67) x (795 + 115) = 233 x 910
- Käyntiovi ulko: (300 - 18) x (795 + 165) = 282 x 960
- Lisäovi sisä: (300 - 67) x (625 + 140) = 233 x 765
- Lisäovi ulko: (300 - 18) x (625 + 140) = 282 x 765

**Harjalistat:**
- Käyntiovi: 795 + 141 = 936
- Lisäovi: 625 + 141 = 766

---

## Testaus 2: Janisol Pariovi (10mm rako, 2 ruutua)

### Syötteet:
- Käyntioven leveys: 800 mm
- Lisäoven leveys: 600 mm
- Potkupellin korkeus: 300 mm
- Rako: 10 mm (+32 sisä, +7 ulko)
- Ruutujen määrä: 2
- Ruutu 1 korkeus: 1000 mm
- Ruutu 2 korkeus: 800 mm

### Odotetut Tulokset:

**Lasilistat:**
- Pystylista 1: 1000 + 41 = 1041 mm (x 4 kpl)
- Pystylista 2: 800 + 41 = 841 mm (x 4 kpl)
- Vaakalista käyntiovi: 800 + 3 = 803 mm (x 4 kpl, 2 per ruutu)
- Vaakalista lisäovi: 600 + 3 = 603 mm (x 4 kpl, 2 per ruutu)

**Uretaani:**
- Käyntiovi: 174 x 846
- Lisäovi: 174 x 646

**Potkupellit:**
- Käyntiovi sisä: (300 - 67 + 32) x (800 + 115) = 265 x 915
- Käyntiovi ulko: (300 - 18 + 7) x (800 + 165) = 289 x 965
- Lisäovi sisä: (300 - 67 + 32) x (600 + 140) = 265 x 740
- Lisäovi ulko: (300 - 18 + 7) x (600 + 140) = 289 x 740

**Harjalistat:**
- Käyntiovi: 941
- Lisäovi: 741

---

## Testaus 3: Economy Käyntiovi (8mm rako, 1 ruutu)

### Syötteet:
- Käyntioven leveys: 800 mm
- Potkupellin korkeus: 300 mm
- Rako: 8 mm
- Ruutujen määrä: 1
- Ruudun korkeus: 2000 mm

### Odotetut Tulokset:

**Lasilistat:**
- Pystylista: 2000 + 38 = 2038 mm (x 2 kpl)
- Vaakalista: 800 - 2 = 798 mm (x 2 kpl)

**Uretaani:**
- (300 - 121) x (800 + 41) = 179 x 841

**Potkupellit:**
- Sisä: (300 - 65) x (800 + 110) = 235 x 910
- Ulko: (300 - 20) x (800 + 160) = 280 x 960

**Harjalista:**
- 800 + 141 = 941

---

## Testaus 4: Potkupellin korkeus > 310 mm (Ulkopuolen vähennys)

### Syötteet:
- Käyntioven leveys: 800 mm
- Potkupellin korkeus: 320 mm
- Rako: 8 mm
- Ruutujen määrä: 1
- Ruudun korkeus: 2000 mm
- Laskuri: Economy Käyntiovi

### Odotetut Tulokset:

**Potkupellit:**
- Sisä: (320 - 65) x (800 + 110) = 255 x 910
- Ulko: (320 - 20) x (800 + 160 - 5) = 300 x 955 ← HUOM! -5 mm koska korkeus > 310

---

## Testaus 5: Economy Pariovi (15mm rako)

### Syötteet:
- Käyntioven leveys: 900 mm
- Lisäoven leveys: 700 mm
- Potkupellin korkeus: 300 mm
- Rako: 15 mm (+27 sisä, +2 ulko)
- Ruutujen määrä: 1
- Ruudun korkeus: 1800 mm

### Odotetut Tulokset:

**Lasilistat:**
- Pystylista: 1800 + 38 = 1838 mm (x 4 kpl)
- Vaakalista käyntiovi: 900 - 2 = 898 mm (x 2 kpl)
- Vaakalista lisäovi: 700 - 2 = 698 mm (x 2 kpl)

**Uretaani:**
- Käyntiovi: 179 x 941
- Lisäovi: 179 x 741

**Potkupellit:**
- Käyntiovi sisä: (300 - 65 + 27) x (900 + 110) = 262 x 1010
- Käyntiovi ulko: (300 - 20 + 2) x (900 + 160) = 282 x 1060
- Lisäovi sisä: (300 - 65 + 27) x (700 + 135) = 262 x 835
- Lisäovi ulko: (300 - 20 + 2) x (700 + 135) = 282 x 835

**Harjalistat:**
- Käyntiovi: 1041
- Lisäovi: 841

---

## Testauslista - Käytä sovelluksessa:

### ✅ Toiminnot testattava:
1. **Kirjautuminen**
   - [ ] Väärä salasana näyttää virheen
   - [ ] "Soma<3" toimii
   - [ ] "Harri10K" toimii
   - [ ] Enter-näppäin toimii

2. **Valikko**
   - [ ] Kaikki 4 laskuria näkyy
   - [ ] Kortit reagoivat hoveriin
   - [ ] Klikkaus avaa oikean laskurin

3. **Laskurit**
   - [ ] Käyntiovi: Ei lisäoven kenttää
   - [ ] Pariovi: Lisäoven kenttä näkyy
   - [ ] Validointi toimii (vain numerot)
   - [ ] Reaaliaikainen laskenta

4. **Asetukset**
   - [ ] Modal aukeaa
   - [ ] Rako-valinnat (8/10/15 mm)
   - [ ] Ruutujen määrä (1-5)
   - [ ] Ruutukentät päivittyvät
   - [ ] Laskenta päivittyy

5. **Tallenna**
   - [ ] Modal aukeaa
   - [ ] Nimen syöttö
   - [ ] Tallentuu localStorageen
   - [ ] Vahvistusviesti

6. **Lataa**
   - [ ] Modal aukeaa
   - [ ] Näyttää tallennetut
   - [ ] Lataaminen toimii
   - [ ] Poistaminen toimii
   - [ ] Tyhjä lista näyttää viestin

7. **PDF-vienti**
   - [ ] Generoi PDF:n
   - [ ] Sisältää otsikon
   - [ ] Sisältää syötteet
   - [ ] Sisältää tulokset
   - [ ] Lataus käynnistyy

8. **Tulokset**
   - [ ] Näkyy oikein
   - [ ] Järjestys: Lasilista, Uretaani, Potkupelti, Harjalista
   - [ ] Yhdistäminen toimii (x 2, x 4 jne)
   - [ ] Ei "mm"-yksikköä

9. **Responsiivisuus**
   - [ ] Toimii mobiilissa
   - [ ] Toimii tabletissa
   - [ ] Toimii desktopissa

10. **Erikoistilanteet**
    - [ ] Korkeus > 310 mm: -5 mm ulkopuolelle
    - [ ] Useita ruutuja: Yhdistäminen toimii
    - [ ] Tyhjät kentät: Ei tuloksia

---

## Laskennan Yhteenveto

### Janisol:
- Lasilista pysty: +41 mm
- Lasilista vaaka: +3 mm
- Uretaani: -126 mm x +46 mm
- Potkupelti sisä: -67 mm
- Potkupelti ulko: -18 mm
- Käyntiovi leveys: +115 (sisä), +165 (ulko)
- Lisäovi leveys: +140 (sisä), +140 (ulko)
- Harjalista: +141 mm

### Economy:
- Lasilista pysty: +38 mm
- Lasilista vaaka: -2 mm
- Uretaani: -121 mm x +41 mm
- Potkupelti sisä: -65 mm
- Potkupelti ulko: -20 mm
- Käyntiovi leveys: +110 (sisä), +160 (ulko)
- Lisäovi leveys: +135 (sisä), +135 (ulko)
- Harjalista: +141 mm

### Rako-efektit:
- 8 mm: Ei muutoksia (default)
- 10 mm: +32 sisä, +7 ulko
- 15 mm: +27 sisä, +2 ulko

### Erikoissäännöt:
- Korkeus > 310 mm → Ulkopuoli -5 mm
- Jokainen ruutu: 2 pysty + 2 vaaka
- Yhdistä samat mitat tuloksissa

