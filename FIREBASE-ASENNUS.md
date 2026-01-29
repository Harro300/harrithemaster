# Firebase-asennus ja konfigurointi

## 📋 Yhteenveto

Sovellus on nyt valmis käyttämään Firebasea! Sinun tarvitsee vain tehdä muutama asetus Firebase Consolessa.

## 🔧 Mitä on tehty

✅ Firebase SDK lisätty `index.html`-tiedostoon  
✅ Firebase Authentication toteutettu kirjautumiseen  
✅ Firestore-integraatio esiasetuksille ja checkbox-tiloille  
✅ Reaaliaikaiset kuuntelijat synkronointia varten  
✅ localStorage-fallback offline-tilaa varten  
✅ Synkronointistatus ja toast-ilmoitukset  

## 🚀 Firebase Console -asetukset

### 1. Firestore Database -aktivointi

1. Mene osoitteeseen: https://console.firebase.google.com/
2. Valitse projektisi: **terasovi-laskin**
3. Vasen navigaatio → **Build** → **Firestore Database**
4. Klikkaa **Create database**
5. Valitse **Start in production mode** (muutetaan Security Rulesia myöhemmin)
6. Valitse **Database location**: `europe-west3 (Frankfurt)`
7. Klikkaa **Enable**

### 2. Authentication-aktivointi

1. Firebase Consolessa → **Build** → **Authentication**
2. Klikkaa **Get started**
3. **Sign-in method** -välilehti
4. Klikkaa **Email/Password**
5. **Enable** → **Save**

### 3. Luo käyttäjät

Luo kaksi käyttäjää Authentication-välilehdellä:

#### Normaalikäyttäjä:
- **Email**: `soma@terasovi.local`
- **Password**: `Soma<3`

#### Admin-käyttäjä:
- **Email**: `admin@terasovi.local`
- **Password**: `HarriTheMaster`

**Ohjeet:**
1. Authentication → Users-välilehti
2. Klikkaa **Add user**
3. Syötä email ja password
4. Klikkaa **Add user**
5. Toista toiselle käyttäjälle

### 4. Firestore Security Rules

1. Firestore Database → **Rules**-välilehti
2. Korvaa oletussäännöt näillä:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper function: onko käyttäjä admin
    function isAdmin() {
      return request.auth != null && 
             request.auth.token.email == 'admin@terasovi.local';
    }
    
    // Helper function: onko käyttäjä kirjautunut
    function isAuthenticated() {
      return request.auth != null;
    }
    
    // Presets: Kaikki voivat lukea ja luoda, vain admin voi poistaa
    match /presets/{presetId} {
      allow read: if isAuthenticated();
      allow create, update: if isAuthenticated();
      allow delete: if isAdmin();
    }
    
    // CheckedStates: Kaikki kirjautuneet voivat lukea ja kirjoittaa
    match /checkedStates/{document=**} {
      allow read, write: if isAuthenticated();
    }
  }
}
```

3. Klikkaa **Publish**

## ✅ Valmis!

Nyt sovelluksesi on täysin toiminnallinen Firebasen kanssa!

## 🧪 Testaus

1. Avaa sovellus selaimessa (paikallisesti tai GitHub Pagesissa)
2. Avaa Developer Console (F12)
3. Pitäisi näkyä:
   ```
   🔥 Alustetaan Firebase...
   ✅ Firebase alustettu onnistuneesti!
   ✅ Firebase-funktiot viety window.firebase-objektiin
   ```

4. Kirjaudu sisään salasanalla `Soma<3` tai `HarriTheMaster`
5. Synkronointistatus pitäisi näyttää: 🟢 Online
6. Tallenna esiasetus → pitäisi näkyä "Esiasetus tallennettu!" -ilmoitus
7. Avaa sovellus toisessa välilehdessä tai selaimessa
8. Tallenna esiasetus → ensimmäisessä välilehdessä pitäisi automaattisesti näkyä uusi esiasetus!

## 🔍 Ominaisuudet

### Reaaliaikainen synkronointi
- Kun yksi käyttäjä tallentaa esiasetuksen, kaikki muut näkevät sen välittömästi
- Checkbox-merkinnät synkronoituvat reaaliajassa
- Ei tarvitse päivittää sivua (F5)

### Admin-oikeudet
- Vain `admin@terasovi.local` voi poistaa esiasetuksia
- Muut käyttäjät voivat vain tallentaa ja katsella

### Offline-tuki
- Jos Firebase ei toimi, sovellus käyttää localStoragea
- Näkyy varoitus "Offline-tila"
- Synkronointistatus näyttää 🔴 Offline

### Synkronointistatus
- 🟢 Online = Firebase toimii, muutokset synkronoituvat
- 🔴 Offline = Vain localStorage, ei synkronointia

## 📊 Tietorakenne Firestoressa

### Collection: `presets`
```javascript
{
  name: "Ovi1",
  calculator: "janisol-pariovi",
  mainDoorWidth: 795,
  sideDoorWidth: 625,
  kickPlateHeight: 300,
  settings: { gapOption: 8, paneCount: 1 },
  paneHeights: [800],
  message: "Kohde A",
  createdBy: "soma@terasovi.local",
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### Collection: `checkedStates`
Document ID: `global`
```javascript
{
  checks: {
    "Ovi1": true,
    "Ovi2": false,
    "Ovi3": true
  },
  updatedAt: Timestamp
}
```

## 🔧 Vianmääritys

### "Firebase ei ole saatavilla"
- Tarkista että Firestore Database on aktivoitu
- Tarkista että Security Rules on julkaistu

### "Kirjautuminen epäonnistui"
- Tarkista että Authentication on aktivoitu
- Tarkista että Email/Password-metodi on enabled
- Tarkista että käyttäjät on luotu oikeilla sähköposteilla ja salasanoilla

### "Synkronointivirhe"
- Tarkista verkkoyhteytesi
- Avaa Developer Console ja katso virheilmoitukset
- Tarkista että Security Rules sallii operaation

### Testikäyttö konsolissa
Avaa Developer Console (F12) ja testaa:

```javascript
// Tarkista Firebase-tila
console.log(window.firebase);

// Tarkista kirjautunut käyttäjä
console.log(window.firebase.auth.currentUser);

// Testaa Firestore-yhteys
const { db, collection, getDocs } = window.firebase;
getDocs(collection(db, 'presets')).then(snap => {
  console.log('Presets:', snap.size);
});
```

## 📝 Tietosuoja

- Data tallennetaan Googlen palvelimille Euroopassa (Frankfurt)
- Vain kirjautuneet käyttäjät voivat nähdä ja tallentaa dataa
- Admin-käyttäjä voi poistaa kaikkien esiasetuksia
- Ei henkilötietoja (vain mittoja ja asetuksia)

## 🎯 Seuraavat askeleet

1. ✅ Aktivoi Firestore
2. ✅ Aktivoi Authentication
3. ✅ Luo käyttäjät
4. ✅ Aseta Security Rules
5. 🧪 Testaa sovellus
6. 🚀 Deployaa GitHub Pagesiin

Kun kaikki toimii paikallisesti, voit deployta GitHub Pagesiin:

```bash
git add .
git commit -m "Firebase-integraatio valmis"
git push origin main
```

Sovellus päivittyy automaattisesti osoitteessa: https://harro300.github.io/harrithemaster/

---

**Onnittelut! Sinulla on nyt reaaliaikainen, synkronoituva teräsovi-laskuri! 🎉**

