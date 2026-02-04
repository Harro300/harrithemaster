# Firebase Firestore -säännöt

## Ongelma: Kaavasetit eivät synkronoidu käyttäjien välillä

Jos kaavasetit eivät synkronoidu, se johtuu todennäköisesti virheellisistä Firestore-säännöistä.

## Ratkaisu: Päivitä Firestore-säännöt

### Vaihe 1: Kirjaudu Firebase Consoleen
1. Avaa https://console.firebase.google.com/
2. Valitse projektisi (terasovi tai vastaava)

### Vaihe 2: Avaa Firestore Rules
1. Vasemmalta valikosta: **Firestore Database**
2. Ylhäältä välilehti: **Rules**

### Vaihe 3: Korvaa säännöt
Kopioi ja liitä nämä säännöt:

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    
    // Presets collection - kaikki kirjautuneet voivat lukea, vain adminit kirjoittaa
    match /presets/{presetId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.token.email in ['admin@terasovi.local'];
    }
    
    // Checked states - kaikki kirjautuneet voivat lukea ja kirjoittaa
    match /checkedStates/{document=**} {
      allow read, write: if request.auth != null;
    }
    
    // Formula sets collection - KAIKKI KIRJAUTUNEET VOIVAT LUKEA JA KIRJOITTAA
    match /formulaSets/{formulaSetId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null 
                    && request.resource.data.createdBy == request.auth.token.email;
      allow update, delete: if request.auth != null;
    }
    
    // Deny all other access by default
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

### Vaihe 4: Julkaise säännöt
1. Klikkaa **Publish** (Julkaise)
2. Vahvista muutokset

### Vaihe 5: Testaa
1. Avaa sovellus kahdella eri laitteella
2. Kirjaudu sisään molemmissa
3. Tallenna kaavasetti toisessa laitteessa
4. Tarkista että se ilmestyy toiselle laitteelle

## Debug-lokit

Jos ongelma jatkuu, avaa selaimen Console (F12) ja tarkista:

### Tallennuksen debug-lokit:
```
🔍 DEBUG - Tallennus alkaa:
  - Firebase käytössä: true/false
  - DB käytössä: true/false
  - Käyttäjä kirjautunut: true/false
  - Käyttäjän email: ...

🔥 Tallennetaan Firestoreen...
✅ ONNISTUI! Kaavasetti tallennettu Firestoreen: [ID]
```

### Listenerin debug-lokit:
```
🎧 Aloitetaan kaavasetit-listener...
🔔🔔🔔 KAAVASETIT PÄIVITETTY FIRESTORESTA!
  - Dokumentteja: X
  - Kaavasetit yhteensä: Y
```

## Yleisimmät virheet

### 1. "Missing or insufficient permissions"
- **Syy:** Firestore-säännöt estävät käytön
- **Ratkaisu:** Päivitä säännöt yllä olevien mukaisiksi

### 2. "Firebase ei käytettävissä"
- **Syy:** Käyttäjä ei ole kirjautunut sisään
- **Ratkaisu:** Kirjaudu sisään sovellukseen

### 3. "Tallennettu vain paikallisesti"
- **Syy:** Firebase-yhteys epäonnistui
- **Ratkaisu:** Tarkista internet-yhteys ja Firestore-säännöt

## Tuki

Jos ongelma jatkuu näiden ohjeiden jälkeen:
1. Ota kuvakaappaus Console-virheistä (F12)
2. Tarkista että käyttäjä on kirjautunut sisään
3. Tarkista että Firestore-säännöt on päivitetty

