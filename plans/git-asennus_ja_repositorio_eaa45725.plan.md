---
name: Git-asennus ja repositorio
overview: Asennetaan Git for Windows ja alustetaan Git-repositorio projektille, mukaan lukien .gitignore-tiedosto ja ensimmäinen commit.
todos:
  - id: install-git
    content: Asenna Git for Windows järjestelmään
    status: completed
  - id: configure-git
    content: Konfiguroi Git-käyttäjätiedot (user.name ja user.email)
    status: completed
    dependencies:
      - install-git
  - id: init-repo
    content: Alusta Git-repositorio projektikansiossa
    status: completed
    dependencies:
      - configure-git
  - id: create-gitignore
    content: Luo .gitignore-tiedosto projektin tarpeisiin
    status: completed
    dependencies:
      - init-repo
  - id: initial-commit
    content: Tee ensimmäinen commit kaikista projektin tiedostoista
    status: completed
    dependencies:
      - create-gitignore
---

# Git-asennus ja repositorion alustus

## Tavoite

Asennetaan Git for Windows ja alustetaan versionhallinta teräsovi-laskin -projektille.

## Vaiheet

### 1. Git for Windowsin asennus

- Ladataan Git for Windows viralliselta sivustolta (https://git-scm.com/download/win)
- Asennetaan suositelluilla oletusasetuksilla
- Vahvistetaan asennus komennolla `git --version`

### 2. Git-konfiguraatio

Konfiguroidaan Git-käyttäjätiedot (tarvitaan commiteja varten):

```bash
git config --global user.name "Harro300"
git config --global user.email "harri.vaisanen@icloud.com"
```



### 3. Repositorion alustus

- Alustetaan Git-repositorio projektikansiossa: `git init`
- Luodaan [.gitignore](.gitignore) -tiedosto, joka sisältää:
- `node_modules/` (npm-paketit)
- `*.db` (tietokanta-tiedostot)
- `.vite/` ja `dist/` (build-tiedostot)
- IDE-asetukset (`.vscode/`, paitsi jaettavat asetukset)
- Väliaikaistiedostot

### 4. Ensimmäinen commit

- Lisätään kaikki projektin tiedostot: `git add .`
- Luodaan ensimmäinen commit: `git commit -m "Initial commit: Teräsovi-laskin projekti"`

## Tiedostot

- Luodaan: [.gitignore](.gitignore)

## Huomiot

- ✅ Git version 2.52.0 on asennettu onnistuneesti