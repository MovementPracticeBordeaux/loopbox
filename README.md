# LoopBox

Studio de loops pour smartphone : beatbox, percussions, bruits du quotidien.
Application web de [Movement Practice Bordeaux](https://www.movementpracticebordeaux.com/).

**Ouvrir l'appli :** https://movementpracticebordeaux.github.io/loopbox/

## Fichiers

- `index.html` : la page.
- `style.css` : l'apparence (charte MPB : noir, dégradé rouge-orange-rose-violet, Bebas Neue / Barlow Condensed).
- `app.js` : tout le fonctionnement (audio, pistes, effets, projets…).
- `manifest.webmanifest`, `sw.js`, `icon-*.png` : installation sur l'écran d'accueil et fonctionnement hors connexion.
- `tests/` : les tests automatiques.

## Fonctions principales

Boucle calée automatiquement sur le jeu, pistes à la demande (nom, couleur, ordre, duplication), partie propre par piste,
recalage sur le rythme, jeu à l'envers, fondus, hauteur du son, changement de tempo du projet sans changer la note,
effets empilables, tonalité, mode live avec scènes, annuler / rétablir (réglages compris), projets et fichier `.loopbox`,
export WAV, partage direct, pistes séparées en `.zip`, diagnostic de l'appareil.

## Tests

Les tests chargent l'appli dans un navigateur simulé, avec un faux micro et un faux moteur audio, et vérifient notamment :
le calage de la boucle, la place des sons ajoutés, la durée ×N, annuler / rétablir, la partie propre, la hauteur,
la pause, l'import, les projets, le recalage, l'envers, les fondus, le changement de tempo, le mode live, le partage,
les pistes séparées et l'installation (21 tests).

```
npm install
npm test
```

Pour qu'ils tournent automatiquement sur GitHub à chaque modification, ajoute le fichier
`.github/workflows/tests.yml` suivant (bouton *Add file* → *Create new file* sur GitHub) :

```yaml
name: Tests
on:
  push:
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm install --no-audit --no-fund
      - run: npm test
```

Ils ne remplacent pas un essai sur un vrai téléphone : le menu « Diagnostic de l'appareil » de l'appli sert à ça.
