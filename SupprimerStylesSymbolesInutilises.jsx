//@target illustrator
/*
 * SupprimerStylesSymbolesInutilises.jsx  —  v1.0.0
 * ----------------------------------------------------------------------------
 * FR : Détecte et supprime les styles graphiques (Graphic Styles) et/ou les
 *      symboles inutilisés du document Illustrator. Le bouton « Analyser »
 *      compte et liste d'abord utilisés vs inutilisés sans rien modifier ;
 *      « Appliquer » les supprime selon les options cochées.
 * EN : Detects and removes unused graphic styles and/or symbols from the
 *      Illustrator document. "Analyze" first counts and lists used vs unused
 *      without changing anything; "Apply" removes them per checked options.
 *
 * Cible / Target : Illustrator CC (2018+) jusqu'aux versions récentes.
 * Statut / Status : NON TESTÉ DANS ILLUSTRATOR — syntaxe ES3 vérifiée (acorn).
 *                   NOT TESTED IN ILLUSTRATOR — ES3 syntax checked (acorn).
 * Annulation / Undo : une seule opération annulable (beginUndoGroup).
 *                     single undoable operation (beginUndoGroup).
 * Conseil : travaillez sur une copie de votre fichier.
 * Tip     : work on a copy of your file.
 * Aucune connexion réseau, aucune collecte de données.
 * No network access, no data collection.
 *
 * Détection / Detection :
 * - Symboles : parcours récursif des pageItems (groupes, tracés composés,
 *   SymbolItem.symbol). Les symboles imbriqués uniquement dans la définition
 *   d'un symbole (jamais placés) peuvent échapper à la détection.
 *   Symbols: recursive walk of pageItems (groups, compound paths,
 *   SymbolItem.symbol). Symbols nested only inside a symbol definition
 *   (never placed) may be missed.
 * - Styles graphiques : l'API ExtendScript n'expose pas le style appliqué
 *   (les styles sont « cuits » dans l'apparence). Les styles système (nom
 *   entre crochets, ex. [Default]) sont protégés ; les autres sont listés
 *   comme candidats à suppression. Vérifiez avant d'appliquer.
 *   Graphic styles: ExtendScript does not expose the applied style (styles
 *   are baked into appearance). System styles (bracketed names, e.g.
 *   [Default]) are protected; others are listed as removal candidates.
 *   Review before applying.
 *
 * Licence MIT — (c) 2026 Amirouche Amwanes. Code original.
 */

(function () {

    var VERSION = "1.0.0";

    // ------------------------------------------------------------------
    // Langue de l'interface / UI language
    // ------------------------------------------------------------------
    var FR = String($.locale || "").toLowerCase().indexOf("fr") === 0;
    function t(fr, en) { return FR ? fr : en; }

    // ------------------------------------------------------------------
    // Garde-fous / Guards
    // ------------------------------------------------------------------
    if (app.documents.length === 0) {
        alert(t("Aucun document ouvert.\nOuvrez un document puis relancez le script.",
                "No document open.\nOpen a document and run the script again."));
        return;
    }

    var doc = app.activeDocument;

    // ------------------------------------------------------------------
    // Utilitaires / Utilities
    // ------------------------------------------------------------------
    function safe(fn, fallback) {
        try { return fn(); } catch (e) { return fallback; }
    }

    function copyCollection(col) {
        var a = [];
        var i;
        for (i = 0; i < col.length; i++) { a.push(col[i]); }
        return a;
    }

    function isBracketedName(name) {
        var n = String(name || "");
        return n.length >= 2 && n.charAt(0) === "[" && n.charAt(n.length - 1) === "]";
    }

    function isDefaultStyleName(name) {
        var n = String(name || "").toLowerCase();
        return n === "[default]" ||
               n === "[défaut]" ||
               n === "[defaut]" ||
               n === "default" ||
               n === "défaut" ||
               n === "defaut";
    }

    function isProtectedStyleName(name) {
        return isBracketedName(name) || isDefaultStyleName(name);
    }

    function isProtectedSymbolName(name) {
        // Symboles système éventuels / Possible system symbols
        return isBracketedName(name);
    }

    // ------------------------------------------------------------------
    // Collecte d'usage des symboles / Symbol usage collection
    // ------------------------------------------------------------------
    function UsedSymbols() {
        this.byName = {}; // name -> true
        this.count = 0;
    }

    UsedSymbols.prototype.mark = function (sym) {
        if (!sym) { return; }
        var name = safe(function () { return sym.name; }, "");
        if (!name) { return; }
        if (!this.byName[name]) {
            this.byName[name] = true;
            this.count++;
        }
    };

    UsedSymbols.prototype.hasName = function (name) {
        return !!this.byName[String(name)];
    };

    function scanPageItemForSymbols(used, item) {
        var type = safe(function () { return item.typename; }, "");
        var i, kids, sym;

        if (type === "GroupItem") {
            kids = safe(function () { return item.pageItems; }, null);
            if (kids) {
                for (i = 0; i < kids.length; i++) {
                    scanPageItemForSymbols(used, kids[i]);
                }
            }
            return;
        }

        if (type === "CompoundPathItem") {
            kids = safe(function () { return item.pathItems; }, null);
            if (kids) {
                for (i = 0; i < kids.length; i++) {
                    scanPageItemForSymbols(used, kids[i]);
                }
            }
            return;
        }

        if (type === "SymbolItem") {
            sym = safe(function () { return item.symbol; }, null);
            used.mark(sym);
            return;
        }

        // TextFrame, PathItem, Mesh, Plugin, Raster, PlacedItem, GraphItem…
        // Pas d'instance de symbole directe / No direct symbol instance
    }

    function scanLayerForSymbols(used, layer) {
        var i, items, subs;
        items = safe(function () { return layer.pageItems; }, null);
        if (items) {
            for (i = 0; i < items.length; i++) {
                scanPageItemForSymbols(used, items[i]);
            }
        }
        subs = safe(function () { return layer.layers; }, null);
        if (subs) {
            for (i = 0; i < subs.length; i++) {
                scanLayerForSymbols(used, subs[i]);
            }
        }
    }

    function scanDocumentSymbols(used) {
        var layers = doc.layers;
        var i;
        for (i = 0; i < layers.length; i++) {
            scanLayerForSymbols(used, layers[i]);
        }
    }

    // ------------------------------------------------------------------
    // Analyse / Analysis
    // ------------------------------------------------------------------
    function analyzeAll(opts) {
        var result = {
            stylesTotal: 0,
            stylesProtected: [],
            stylesCandidates: [],
            stylesSkipped: false,
            symbolsTotal: 0,
            symbolsUsed: [],
            symbolsUnused: [],
            symbolsProtected: [],
            symbolsSkipped: false,
            emptyDoc: false
        };

        var styles = safe(function () { return doc.graphicStyles; }, null);
        var symbols = safe(function () { return doc.symbols; }, null);

        var stylesLen = styles ? styles.length : 0;
        var symbolsLen = symbols ? symbols.length : 0;

        if (stylesLen === 0 && symbolsLen === 0) {
            result.emptyDoc = true;
            return result;
        }

        // --- Styles graphiques / Graphic styles ---
        if (!opts.doStyles) {
            result.stylesSkipped = true;
        } else if (stylesLen === 0) {
            result.stylesTotal = 0;
        } else {
            result.stylesTotal = stylesLen;
            var styleList = copyCollection(styles);
            var si, st, stName;
            for (si = 0; si < styleList.length; si++) {
                st = styleList[si];
                stName = safe(function () { return st.name; }, "");
                if (opts.keepSystemStyles && isProtectedStyleName(stName)) {
                    result.stylesProtected.push(stName);
                } else {
                    result.stylesCandidates.push({
                        name: stName,
                        removable: true,
                        style: st
                    });
                }
            }
        }

        // --- Symboles / Symbols ---
        if (!opts.doSymbols) {
            result.symbolsSkipped = true;
        } else if (symbolsLen === 0) {
            result.symbolsTotal = 0;
        } else {
            result.symbolsTotal = symbolsLen;
            var used = new UsedSymbols();
            scanDocumentSymbols(used);

            var symList = copyCollection(symbols);
            var sj, sym, symName, isUsed;
            for (sj = 0; sj < symList.length; sj++) {
                sym = symList[sj];
                symName = safe(function () { return sym.name; }, "");
                isUsed = used.hasName(symName);

                if (opts.keepSystemSymbols && isProtectedSymbolName(symName)) {
                    result.symbolsProtected.push(symName);
                    if (isUsed) {
                        result.symbolsUsed.push({ name: symName, reason: "used+system" });
                    } else {
                        result.symbolsUnused.push({
                            name: symName,
                            reason: "keep-system",
                            removable: false
                        });
                    }
                    continue;
                }

                if (isUsed) {
                    result.symbolsUsed.push({ name: symName, reason: "used" });
                } else {
                    result.symbolsUnused.push({
                        name: symName,
                        reason: "unused",
                        removable: true,
                        symbol: sym
                    });
                }
            }
        }

        return result;
    }

    function countRemovableStyles(analysis) {
        var n = 0;
        var i;
        for (i = 0; i < analysis.stylesCandidates.length; i++) {
            if (analysis.stylesCandidates[i].removable) { n++; }
        }
        return n;
    }

    function countRemovableSymbols(analysis) {
        var n = 0;
        var i;
        for (i = 0; i < analysis.symbolsUnused.length; i++) {
            if (analysis.symbolsUnused[i].removable) { n++; }
        }
        return n;
    }

    function previewNames(list, getName, maxShow) {
        var lines = [];
        var shown = 0;
        var i, name;
        var total = 0;
        for (i = 0; i < list.length; i++) {
            if (typeof getName === "function") {
                name = getName(list[i]);
                if (name === null) { continue; }
            } else {
                name = list[i];
            }
            total++;
            if (shown < maxShow) {
                lines.push("  • " + name);
                shown++;
            }
        }
        if (total === 0) {
            return t("  (aucun)", "  (none)");
        }
        if (shown < total) {
            lines.push("  … +" + (total - shown));
        }
        return lines.join("\n");
    }

    function formatAnalysis(analysis) {
        var lines = [];

        if (analysis.emptyDoc) {
            lines.push(t("Ce document n'a ni style graphique ni symbole.",
                         "This document has neither graphic styles nor symbols."));
            return lines.join("\n");
        }

        // Styles
        lines.push(t("=== Styles graphiques ===", "=== Graphic styles ==="));
        if (analysis.stylesSkipped) {
            lines.push(t("(analyse des styles désactivée)", "(style analysis disabled)"));
        } else {
            var remS = countRemovableStyles(analysis);
            lines.push(t("Total : ", "Total: ") + analysis.stylesTotal);
            lines.push(t("Protégés (système) : ", "Protected (system): ") + analysis.stylesProtected.length);
            lines.push(t("Candidats à suppression : ", "Removal candidates: ") + remS);
            if (analysis.stylesProtected.length) {
                lines.push(t("  — protégés : ", "  — protected: ") +
                    (analysis.stylesProtected.length > 6
                        ? analysis.stylesProtected.slice(0, 6).join(", ") + "…"
                        : analysis.stylesProtected.join(", ")));
            }
            lines.push("");
            lines.push(t("Note : l'API ne dit pas quel style est appliqué",
                         "Note: the API does not report which style is applied"));
            lines.push(t("(styles « cuits » dans l'apparence). Vérifiez la liste.",
                         "(styles are baked into appearance). Review the list."));
            lines.push("");
            lines.push(t("Aperçu des candidats :", "Preview of candidates:"));
            lines.push(previewNames(analysis.stylesCandidates, function (c) {
                return c.removable ? c.name : null;
            }, 30));
        }

        lines.push("");

        // Symboles
        lines.push(t("=== Symboles ===", "=== Symbols ==="));
        if (analysis.symbolsSkipped) {
            lines.push(t("(analyse des symboles désactivée)", "(symbol analysis disabled)"));
        } else {
            var remY = countRemovableSymbols(analysis);
            lines.push(t("Total : ", "Total: ") + analysis.symbolsTotal);
            lines.push(t("Utilisés (instances placées) : ", "Used (placed instances): ") + analysis.symbolsUsed.length);
            lines.push(t("Inutilisés : ", "Unused: ") + analysis.symbolsUnused.length);
            lines.push(t("Supprimables (selon options) : ", "Removable (per options): ") + remY);
            if (analysis.symbolsProtected.length) {
                lines.push(t("  — protégés : ", "  — protected: ") +
                    (analysis.symbolsProtected.length > 6
                        ? analysis.symbolsProtected.slice(0, 6).join(", ") + "…"
                        : analysis.symbolsProtected.join(", ")));
            }
            lines.push("");
            lines.push(t("Aperçu des utilisés :", "Preview of used:"));
            lines.push(previewNames(analysis.symbolsUsed, function (u) { return u.name; }, 15));
            lines.push("");
            lines.push(t("Aperçu des inutilisés supprimables :", "Preview of removable unused:"));
            lines.push(previewNames(analysis.symbolsUnused, function (u) {
                return u.removable ? u.name : null;
            }, 30));
        }

        return lines.join("\n");
    }

    // ------------------------------------------------------------------
    // Suppression / Removal
    // ------------------------------------------------------------------
    function removeStyles(analysis) {
        var removed = 0;
        var failed = 0;
        var i, c, st;
        var toRemove = [];
        for (i = 0; i < analysis.stylesCandidates.length; i++) {
            if (analysis.stylesCandidates[i].removable) {
                toRemove.push(analysis.stylesCandidates[i]);
            }
        }
        for (i = toRemove.length - 1; i >= 0; i--) {
            c = toRemove[i];
            st = c.style;
            if (!st) {
                st = safe(function () { return doc.graphicStyles.getByName(c.name); }, null);
            }
            if (!st) { failed++; continue; }
            try {
                st.remove();
                removed++;
            } catch (e) {
                failed++;
            }
        }
        return { removed: removed, failed: failed };
    }

    function removeSymbols(analysis) {
        var removed = 0;
        var failed = 0;
        var i, u, sym;
        var toRemove = [];
        for (i = 0; i < analysis.symbolsUnused.length; i++) {
            if (analysis.symbolsUnused[i].removable) {
                toRemove.push(analysis.symbolsUnused[i]);
            }
        }
        for (i = toRemove.length - 1; i >= 0; i--) {
            u = toRemove[i];
            sym = u.symbol;
            if (!sym) {
                sym = safe(function () { return doc.symbols.getByName(u.name); }, null);
            }
            if (!sym) { failed++; continue; }
            try {
                sym.remove();
                removed++;
            } catch (e) {
                failed++;
            }
        }
        return { removed: removed, failed: failed };
    }

    // ------------------------------------------------------------------
    // Dialogue / Dialog (ScriptUI)
    // ------------------------------------------------------------------
    var w = new Window("dialog",
        t("Supprimer styles & symboles inutilisés",
          "Remove unused styles & symbols") + " v" + VERSION);
    w.orientation = "column";
    w.alignChildren = ["fill", "top"];

    var pLang = w.add("group");
    pLang.alignment = ["right", "top"];
    pLang.add("statictext", undefined, t("Langue :", "Language:"));
    var ddLang = pLang.add("dropdownlist", undefined, ["Français", "English"]);
    ddLang.selection = FR ? 0 : 1;

    var tip = w.add("statictext", undefined,
        t("Conseil : travaillez sur une copie de votre fichier.\nAucune connexion réseau, aucune collecte de données.",
          "Tip: work on a copy of your file.\nNo network access, no data collection."),
        { multiline: true });
    tip.preferredSize = [460, 36];

    var pWhat = w.add("panel", undefined, t("À traiter", "Targets"));
    pWhat.orientation = "column";
    pWhat.alignChildren = ["left", "top"];
    pWhat.margins = [12, 16, 12, 10];

    var cbStyles = pWhat.add("checkbox", undefined,
        t("Supprimer les styles graphiques candidats (non système)",
          "Remove candidate graphic styles (non-system)"));
    cbStyles.value = true;

    var cbSymbols = pWhat.add("checkbox", undefined,
        t("Supprimer les symboles inutilisés (sans instance placée)",
          "Remove unused symbols (no placed instance)"));
    cbSymbols.value = true;

    var pOpts = w.add("panel", undefined, t("Options prudentes", "Cautious options"));
    pOpts.orientation = "column";
    pOpts.alignChildren = ["left", "top"];
    pOpts.margins = [12, 16, 12, 10];

    var cbKeepSysStyles = pOpts.add("checkbox", undefined,
        t("Conserver les styles système (noms entre [crochets], ex. [Default])",
          "Keep system styles (bracketed names, e.g. [Default])"));
    cbKeepSysStyles.value = true;

    var cbKeepSysSymbols = pOpts.add("checkbox", undefined,
        t("Conserver les symboles dont le nom est entre [crochets]",
          "Keep symbols whose name is bracketed [like this]"));
    cbKeepSysSymbols.value = true;

    var noteDoc = pOpts.add("statictext", undefined,
        t("Portée : document actif uniquement. Styles : candidats = non protégés\n(usage non vérifiable via l'API). Symboles : détection via SymbolItem.",
          "Scope: active document only. Styles: candidates = non-protected\n(usage not verifiable via API). Symbols: detection via SymbolItem."),
        { multiline: true });
    noteDoc.preferredSize = [440, 40];

    var resultBox = w.add("edittext", undefined,
        t("Cliquez sur « Analyser » pour compter et lister sans rien modifier.",
          "Click \"Analyze\" to count and list without changing anything."),
        { multiline: true, readonly: true });
    resultBox.preferredSize = [460, 260];

    var gBtn = w.add("group");
    gBtn.alignment = ["right", "top"];
    var bAnalyze = gBtn.add("button", undefined, t("Analyser", "Analyze"));
    var bCancel = gBtn.add("button", undefined, t("Annuler", "Cancel"), { name: "cancel" });
    var bApply = gBtn.add("button", undefined, t("Appliquer", "Apply"), { name: "ok" });

    var lastAnalysis = null;

    function readOpts() {
        return {
            doStyles: cbStyles.value,
            doSymbols: cbSymbols.value,
            keepSystemStyles: cbKeepSysStyles.value,
            keepSystemSymbols: cbKeepSysSymbols.value
        };
    }

    function refreshLabels() {
        tip.text = t("Conseil : travaillez sur une copie de votre fichier.\nAucune connexion réseau, aucune collecte de données.",
                     "Tip: work on a copy of your file.\nNo network access, no data collection.");
        pWhat.text = t("À traiter", "Targets");
        cbStyles.text = t("Supprimer les styles graphiques candidats (non système)",
                          "Remove candidate graphic styles (non-system)");
        cbSymbols.text = t("Supprimer les symboles inutilisés (sans instance placée)",
                           "Remove unused symbols (no placed instance)");
        pOpts.text = t("Options prudentes", "Cautious options");
        cbKeepSysStyles.text = t("Conserver les styles système (noms entre [crochets], ex. [Default])",
                                 "Keep system styles (bracketed names, e.g. [Default])");
        cbKeepSysSymbols.text = t("Conserver les symboles dont le nom est entre [crochets]",
                                  "Keep symbols whose name is bracketed [like this]");
        noteDoc.text = t("Portée : document actif uniquement. Styles : candidats = non protégés\n(usage non vérifiable via l'API). Symboles : détection via SymbolItem.",
                         "Scope: active document only. Styles: candidates = non-protected\n(usage not verifiable via API). Symbols: detection via SymbolItem.");
        bAnalyze.text = t("Analyser", "Analyze");
        bCancel.text = t("Annuler", "Cancel");
        bApply.text = t("Appliquer", "Apply");
        w.text = t("Supprimer styles & symboles inutilisés",
                   "Remove unused styles & symbols") + " v" + VERSION;
        if (!lastAnalysis) {
            resultBox.text = t("Cliquez sur « Analyser » pour compter et lister sans rien modifier.",
                               "Click \"Analyze\" to count and list without changing anything.");
        } else {
            resultBox.text = formatAnalysis(lastAnalysis);
        }
    }

    ddLang.onChange = function () {
        FR = (ddLang.selection && ddLang.selection.index === 0);
        refreshLabels();
    };

    bAnalyze.onClick = function () {
        try {
            var opts = readOpts();
            if (!opts.doStyles && !opts.doSymbols) {
                resultBox.text = t("Cochez au moins une cible (styles et/ou symboles).",
                                   "Check at least one target (styles and/or symbols).");
                lastAnalysis = null;
                return;
            }
            lastAnalysis = analyzeAll(opts);
            resultBox.text = formatAnalysis(lastAnalysis);
        } catch (e) {
            resultBox.text = t("Erreur pendant l'analyse : ", "Error during analysis: ") + e.message;
            lastAnalysis = null;
        }
    };

    bApply.onClick = function () {
        w.close(1);
    };

    if (w.show() !== 1) { return; }

    // ------------------------------------------------------------------
    // Application réelle / Actual apply
    // ------------------------------------------------------------------
    var opts = readOpts();

    if (!opts.doStyles && !opts.doSymbols) {
        alert(t("Aucune cible cochée. Rien à faire.",
                "No target checked. Nothing to do."));
        return;
    }

    try {
        var analysis = analyzeAll(opts);

        if (analysis.emptyDoc) {
            alert(t("Ce document n'a ni style graphique ni symbole.",
                    "This document has neither graphic styles nor symbols."));
            return;
        }

        var remS = opts.doStyles ? countRemovableStyles(analysis) : 0;
        var remY = opts.doSymbols ? countRemovableSymbols(analysis) : 0;

        if (remS === 0 && remY === 0) {
            alert(t("Rien à supprimer avec les options actuelles.",
                    "Nothing to remove with the current options.") +
                  "\n\n" + formatAnalysis(analysis));
            return;
        }

        // Confirmation si styles candidats (usage non vérifiable)
        // Confirm when style candidates (usage not verifiable)
        if (remS > 0) {
            var conf = confirm(
                t("Attention : " + remS + " style(s) graphique(s) candidat(s) seront supprimés.\n" +
                  "L'API ne peut pas vérifier s'ils sont encore « appliqués ».\n" +
                  (remY > 0 ? ("Également " + remY + " symbole(s) inutilisé(s).\n") : "") +
                  "\nContinuer ?",
                  "Warning: " + remS + " candidate graphic style(s) will be removed.\n" +
                  "The API cannot verify whether they are still \"applied\".\n" +
                  (remY > 0 ? ("Also " + remY + " unused symbol(s).\n") : "") +
                  "\nContinue?")
            );
            if (!conf) { return; }
        }

        app.beginUndoGroup(t("Supprimer styles/symboles inutilisés",
                             "Remove unused styles/symbols"));
        var resStyles = { removed: 0, failed: 0 };
        var resSymbols = { removed: 0, failed: 0 };
        try {
            if (opts.doStyles && remS > 0) {
                resStyles = removeStyles(analysis);
            }
            if (opts.doSymbols && remY > 0) {
                resSymbols = removeSymbols(analysis);
            }
        } finally {
            app.endUndoGroup();
        }
        app.redraw();

        var totalRemoved = resStyles.removed + resSymbols.removed;
        var totalFailed = resStyles.failed + resSymbols.failed;
        var msg = t("Suppression terminée.", "Removal complete.") + "\n\n";
        if (opts.doStyles) {
            msg += t("Styles graphiques supprimés : ", "Graphic styles removed: ") +
                   resStyles.removed + "\n";
        }
        if (opts.doSymbols) {
            msg += t("Symboles supprimés : ", "Symbols removed: ") +
                   resSymbols.removed + "\n";
        }
        msg += t("Total supprimé : ", "Total removed: ") + totalRemoved;
        if (totalFailed > 0) {
            msg += "\n" + t("Échecs : ", "Failed: ") + totalFailed;
        }
        msg += "\n\n" + t("Ctrl+Z / Cmd+Z pour annuler.", "Ctrl+Z / Cmd+Z to undo.");
        alert(msg);
    } catch (err) {
        try { app.endUndoGroup(); } catch (e2) {}
        alert(t("Erreur pendant la suppression : ", "Error during removal: ") + err.message +
              (err.line ? " (ligne/line " + err.line + ")" : "") + "\n" +
              t("Utilisez Ctrl+Z / Cmd+Z pour revenir en arrière.",
                "Use Ctrl+Z / Cmd+Z to go back."));
    }

}());
