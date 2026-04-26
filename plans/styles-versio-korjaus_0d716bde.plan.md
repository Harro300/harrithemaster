---
name: styles-versio-korjaus
overview: Päivitetään styles.css:n version string index.html:ssä, jotta selain pakottaa lataamaan uuden CSS-tiedoston eikä käytä välimuistissa olevaa vanhaa versiota.
todos:
  - id: bump-styles-version
    content: Päivitä styles.css?v=20260304R12 -> styles.css?v=20260425R13 index.html:ssä.
    status: pending
isProject: false
---

# styles.css version string -korjaus

## Syy

[index.html](C:/Users/Harri/.cursor/index.html) rivi 9:

```html
<link rel="stylesheet" href="styles.css?v=20260304R12">
```

Tämä versiotunniste ei ole muuttunut, vaikka `styles.css` on päivitetty (hakukentän marginaali, CSS-lisäykset jne.). Selain lataa vanhan välimuistissa olevan version.

## Muutos

```html
<link rel="stylesheet" href="styles.css?v=20260425R13">
```

