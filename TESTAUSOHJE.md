# Testausohje

## 1. Asenna Node.js

Jos sinulla ei ole Node.js:ä asennettuna:

1. Mene osoitteeseen: https://nodejs.org/
2. Lataa LTS-versio (suositeltu)
3. Asenna se Windowsiin
4. Käynnistä uudelleen PowerShell/Terminal

## 2. Tarkista asennus

Avaa PowerShell tai Command Prompt ja aja:
```bash
node --version
npm --version
```

Molempien pitäisi näyttää versionumero.

## 3. Asenna projektin riippuvuudet

Siirry projektikansioon ja aja:
```bash
cd C:\Users\Harri\.cursor
npm install
```

Tämä asentaa kaikki tarvittavat kirjastot (React, TypeScript, Vite, jne.)

## 4. Käynnistä kehityspalvelin

Aja komento:
```bash
npm run dev
```

Sovellus käynnistyy ja näet viestin kuten:
```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

## 5. Avaa selaimessa

Avaa selain ja mene osoitteeseen:
```
http://localhost:5173
```

## 6. Testaa laskureita

### Testiesimerkki Janisol Pariovi:
- Käyntioven leveys: 800
- Lisäoven leveys: 600
- Potkupellin oletuskorkeus: 300
- Ruudun korkeus: 1857

### Testaa myös:
- Asetukset-nappi (rako ja ruutujen määrä)
- Eri laskurit (vaihda yläpalkista)
- Useita ruutuja (aseta ruutujen määräksi 2-5)
- Potkupellin korkeus > 310mm (testaa erikoissääntöjä)

## Lopeta kehityspalvelin

Paina `Ctrl + C` PowerShell-ikkunassa.
