---
name: mitat-haku-vali
overview: Lisätään hakukentän ja työnumerolistan väliin pieni tila muuttamalla .mitat-search-row-elementin margin-bottom arvoa styles.css-tiedostossa.
todos:
  - id: add-spacing
    content: Kasvata .mitat-search-row margin-bottom 0.75rem -> 1.25rem styles.css:ssä.
    status: pending
isProject: false
---

# Hakukentän ja työnumeroiden välinen tila

## Muutos

[C:/Users/Harri/.cursor/styles.css](C:/Users/Harri/.cursor/styles.css) — kasvatetaan `.mitat-search-row`-elementin `margin-bottom`:

```css
/* ennen */
.mitat-search-row {
    margin-bottom: 0.75rem;
}

/* jälkeen */
.mitat-search-row {
    margin-bottom: 1.25rem;
}
```

