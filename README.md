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
export WAV, partage direct, pistes séparées en `.zip`, diagnostic de l'appareil, nettoyage du bruit, piste de basse générée (aperçu, évolution vers une autre note), menus de piste en onglets.

## Sons de la bibliothèque

Les instruments réels (dossier `sounds/`) proviennent de la banque **FluidR3_GM** de **Frank Wen**,
publiée sous licence [Creative Commons Attribution 3.0](https://creativecommons.org/licenses/by/3.0/),
dans la version distribuée par [gleitz/midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts).
Modification : seule une note sur trois est conservée (l'appli complète en décalant la hauteur).
Pour refaire ces fichiers : `python3 tools/build_sounds.py` (liste des sons dans `tools/sounds_list.json`).
Les sons de jeux vidéo et d'ASMR (pièce, saut, laser, goutte d'eau, cloche 808…) sont synthétisés par l'appli.

## Tests

Les tests chargent l'appli dans un navigateur simulé, avec un faux micro et un faux moteur audio, et vérifient notamment :
le calage de la boucle, la place des sons ajoutés, la durée ×N, annuler / rétablir, la partie propre, la hauteur,
la pause, l'import, les projets, le recalage, l'envers, les fondus, le changement de tempo, le mode live, le partage,
les pistes séparées, l'installation et le mode casque (84 tests).

```
npm install
npm test
```

Ils tournent aussi automatiquement sur GitHub à chaque modification (onglet *Actions*).
Ils ne remplacent pas un essai sur un vrai téléphone : le menu « Diagnostic de l'appareil » de l'appli sert à ça.
