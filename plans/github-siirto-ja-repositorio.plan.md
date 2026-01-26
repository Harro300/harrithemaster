# GitHub-siirto ja repositorion luonti

## Tavoite

Kopioidaan teräsovi-laskin -projekti GitHub-kansioon ja pushataan olemassa olevaan GitHub-repositorioon: https://github.com/Harro300/harrithemaster.git

## Vaiheet

### 1. Projektin kopiointi GitHub-kansioon

Kopioidaan kaikki projektin tiedostot (paitsi `.git/`-kansio) uuteen sijaintiin:

- Lähde: `C:\Users\Harri\.cursor\`
- Kohde: `C:\Users\Harri\Documents\GitHub\cursor-project-1\`

Huom: Luodaan uusi Git-repositorio kohdekansiossa (ei kopioida vanhaa `.git/`-kansiota).

### 2. GitHub CLI:n asennus

GitHub CLI (gh) mahdollistaa GitHub-repositorioiden hallinnan komentoriviltä:

- Ladataan: https://cli.github.com/
- Asennetaan Windows Installer (.msi)
- Vahvistetaan: `gh --version`
- Käynnistetään Cursor uudelleen PATH-muuttujien päivittämiseksi

### 3. GitHub-kirjautuminen

Kirjaudutaan GitHub-tilille:

````bash
gh auth login
```
Valitaan:
- GitHub.com
- HTTPS
- Authenticate with a web browser (suositeltu)

### 4. Git-repositorion alustus kohdekansiossa

Kohdekansiossa:
```bash
cd C:\Users\Harri\Documents\GitHub\cursor-project-1
git init
git add .
git commit -m "Initial commit: Teräsovi-laskin projekti"
```

### 5. GitHub-repositorion luonti

Luodaan uusi private repositorio:
```bash
gh repo create cursor-project-1 --private --source=. --push
```

Tai vaihtoehtoisesti:
```bash
gh repo create cursor-project-1 --private
git remote add origin https://github.com/[käyttäjänimi]/cursor-project-1.git
git branch -M main
git push -u origin main
```

### 6. Vahvistus

Tarkistetaan että projekti on GitHubissa:
```bash
gh repo view --web
```

## Tiedostot

- Kopioidaan kaikki projektin tiedostot paitsi:
    - `node_modules/` (ohitetaan .gitignoren ansiosta)
    - `.git/` (luodaan uusi)
    - `*.db` (tietokanta-tiedostot)

## Lopputulos

- Projekti säilyy alkuperäisessä sijainnissa: `C:\Users\Harri\.cursor\`
- Kopio GitHub-kansiossa: `C:\Users\Harri\Documents\GitHub\cursor-project-1\`
- Projekti pushattu repositorioon: `https://github.com/Harro300/harrithemaster`
- Git-historia säilyy molemmissa paikoissa

## Huomiot

- GitHub CLI vaatii järjestelmänvalvojan oikeudet asennukseen
- Kirjautuminen vaatii web-selaimen



````