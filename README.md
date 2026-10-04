# LoopBox

Studio de loops pour smartphone : beatbox, percussions, bruits du quotidien.
Application web de [Movement Practice Bordeaux](https://www.movementpracticebordeaux.com/).

**Ouvrir l'appli :** https://movementpracticebordeaux.github.io/loopbox/

## Fichiers

- `index.html` : la page.
- `style.css` : l'apparence (charte MPB : noir, dégradé rouge-orange-rose-violet, Bebas Neue / Barlow Condensed).
- `app.js` : tout le fonctionnement (audio, pistes, effets, projets…).
- `tests/` : les tests automatiques.

## Tests

Les tests chargent l'appli dans un navigateur simulé, avec un faux micro et un faux moteur audio, et vérifient notamment :
le calage de la boucle sur le jeu, la place des sons ajoutés, la durée ×N réversible, annuler / rétablir,
la partie propre par piste, la hauteur du son, la pause, l'import de fichier et les projets.

```
npm install
npm test
```

Ils tournent aussi automatiquement sur GitHub à chaque modification (onglet *Actions*).
Ils ne remplacent pas un essai sur un vrai téléphone : le menu « Diagnostic de l'appareil » de l'appli sert à ça.
