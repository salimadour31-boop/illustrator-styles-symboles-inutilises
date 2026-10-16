# SupprimerStylesSymbolesInutilises.jsx

**FR** — Détecte et supprime les styles graphiques (Graphic Styles) et/ou les symboles inutilisés dans un document Adobe Illustrator.

**EN** — Detects and removes unused graphic styles and/or symbols from an Adobe Illustrator document.

| | |
|---|---|
| **Version** | 1.0.0 |
| **Cible / Target** | Illustrator CC 2018–2026 (ExtendScript / JSX, ES3) |
| **Statut de test** | **Non testé dans Illustrator** — syntaxe ES3 vérifiée avec acorn |
| **Licence** | MIT — Copyright (c) 2026 Amirouche Amwanes |

> **Conseil / Tip :** travaillez toujours sur une **copie** de votre fichier.  
> Work on a **copy** of your file. Aucune connexion réseau, aucune collecte de données.

## Installation

1. Téléchargez `SupprimerStylesSymbolesInutilises.jsx`.
2. Dans Illustrator : **Fichier → Scripts → Autre script…** et choisissez le fichier.  
   Ou placez-le dans le dossier Presets/Scripts d’Illustrator, puis relancez l’application.

## Usage

1. Ouvrez un document Illustrator.
2. Lancez le script.
3. Choisissez la langue (FR/EN) si besoin.
4. Cochez les cibles : styles graphiques candidats et/ou symboles inutilisés.
5. Options prudentes : conserver les styles/symboles système (noms entre `[crochets]`).
6. Cliquez **Analyser** pour lister sans rien modifier (compteurs + aperçu des noms).
7. Cliquez **Appliquer** pour supprimer (une seule opération annulable via Ctrl+Z / Cmd+Z).

## Fonctionnalités

- Bouton **Analyser** (lecture seule) : styles protégés vs candidats ; symboles utilisés vs inutilisés.
- Suppression optionnelle des styles graphiques non système et/ou des symboles sans instance placée.
- Parcours récursif des `pageItems` (groupes, tracés composés, `SymbolItem`).
- Messages clairs si aucun document ouvert, ou si le document n’a ni styles ni symboles.
- Dialogue ScriptUI bilingue (détection `$.locale`, bascule manuelle).
- `app.beginUndoGroup` / `app.endUndoGroup` — une seule annulation.

## Limites de détection

- **Symboles** : détection via les instances placées (`SymbolItem.symbol`). Les symboles imbriqués uniquement dans la définition d’un autre symbole (jamais placés sur la page) peuvent échapper à la détection.
- **Styles graphiques** : l’API ExtendScript n’expose pas le style « appliqué » (les styles sont cuits dans l’apparence). Les styles système (noms entre crochets, ex. `[Default]`) sont protégés ; les autres sont listés comme **candidats**. Une confirmation est demandée avant suppression. Vérifiez la liste après Analyse.

## Fichiers

- `SupprimerStylesSymbolesInutilises.jsx` — le script
- `LICENSE` — MIT
- `.gitignore`

## Auteur

Amirouche Amwanes — 2026
