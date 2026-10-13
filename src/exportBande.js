import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { num, statutDe, joursEntre } from "./utils";

const TYPES = {
    vente: "Vente", reserve: "Réservé", maison: "Maison", don: "Don",
    abattu: "Abattu", disparu: "Disparu", ajustement: "Ajustement",
    mort_vendu: "Mort vendu",
};
const MODES = { especes: "Espèces", mobile_money: "Mobile money", autre: "Autre" };
const NATURES = { reelle: "Réelle", imputee: "Imputée" };
const FAMILLES = { fixe: "Fixe", variable: "Variable", autre: "Autre" };

const FCFA = '#,##0 "F";[Red]-#,##0 "F"';
const FCFA2 = '#,##0.00 "F";[Red]-#,##0.00 "F"';
const DATE = "dd/mm/yyyy";
const PCT = "0.0%";

const toDate = (ts) => (ts?.toDate ? ts.toDate() : null);
const ms = (ts) => ts?.toMillis?.() || 0;
// Date locale vue comme minuit : Excel affiche le bon jour quel que soit le fuseau
const jourLocal = (d) =>
    d ? new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) : null;
const fr = (d) => (d ? d.toLocaleDateString("fr-FR") : "");

function entete(ws, colonnes) {
    ws.columns = colonnes.map(([header, key, width]) => ({ header, key, width }));
    const r = ws.getRow(1);
    r.font = { bold: true, color: { argb: "FFFFFFFF" } };
    r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E2923" } };
    r.alignment = { vertical: "middle", wrapText: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
}
const rng = (feuille, col, n) => `'${feuille}'!${col}2:${col}${Math.max(n + 1, 2)}`;

export async function exporterBande({ bande, user, profil }) {
    const mod = await import("exceljs");
    const ExcelJS = mod.default || mod;

    // ---- Lecture des données (fonctionne aussi hors-ligne, depuis le cache)
    const b = ["bandes", bande.id];
    const [dS, mS, sS, rS, cS] = await Promise.all([
        getDocs(collection(db, ...b, "depenses")),
        getDocs(collection(db, ...b, "mortalites")),
        getDocs(collection(db, ...b, "sorties")),
        getDocs(query(collection(db, "remboursements"), where("bandeId", "==", bande.id))),
        getDocs(collection(db, "clients")),
    ]);
    const tous = (s) => s.docs.map((d) => ({ id: d.id, ...d.data() }));
    const dep = tous(dS), mor = tous(mS), sor = tous(sS), rem = tous(rS);
    const nomClient = {};
    tous(cS).forEach((c) => { nomClient[c.id] = c.nom; });

    // Noms des utilisateurs : lisibles seulement par un admin (règles de sécurité)
    const noms = {};
    try {
        const uS = await getDocs(collection(db, "utilisateurs"));
        uS.docs.forEach((d) => { noms[d.id] = d.data().nom; });
    } catch (e) { /* compte non admin : on s'en passe */ }
    const auteur = (x) =>
        x.creeParNom || noms[x.creePar] ||
        (x.creePar === user.uid ? (profil?.nom || "Moi") : "Autre utilisateur");

    const parDate = (a, c) => ms(a.date) - ms(c.date);
    const depA = dep.filter((x) => !x.annule).sort(parDate);
    const morA = mor.filter((x) => !x.annule).sort(parDate);
    const sorA = sor.filter((x) => !x.annule).sort(parDate);
    const remA = rem.filter((x) => !x.annule).sort(parDate);
    const nd = depA.length, nm = morA.length, ns = sorA.length, nr = remA.length;

    const st = statutDe(bande);
    const cloturee = st === "cloturee";
    const tr = ms(bande.dateTransfert);
    const libelle = bande.libelle || `Bande ${bande.numero}`;

    // ---- Valeurs calculées ici et écrites avec chaque formule (affichage garanti)
    const somme = (l, f) => l.reduce((s, x) => s + f(x), 0);
    const totD = (d) => Math.round(num(d.quantite) * num(d.prixUnitaire));
    const totS = (s) => Math.round(num(s.quantite) * num(s.prixUnitaire));
    const Vn = num(bande.poussinsVivantsEntres);
    const Mn = somme(morA, (m) => num(m.nombre));
    const baseN = Vn - Mn;
    const coutN = somme(depA, totD);
    const coutReelN = somme(depA.filter((d) => d.nature === "reelle"), totD);
    const coutImpN = somme(depA.filter((d) => d.nature === "imputee"), totD);
    const prN = cloturee && num(bande.prixRevientFinal) > 0
        ? num(bande.prixRevientFinal) : baseN > 0 ? coutN / baseN : 0;
    const mortsS1N = somme(morA.filter((m) => !(tr && ms(m.date) > tr)), (m) => num(m.nombre));
    const sortisN = somme(sorA.filter((s) => s.type !== "mort_vendu"), (s) => num(s.quantite));
    const venduN = somme(sorA.filter((s) => s.type === "vente"), (s) => num(s.quantite));
    const mortsVendusN = somme(sorA.filter((s) => s.type === "mort_vendu"), (s) => num(s.quantite));
    const recMortsN = somme(sorA.filter((s) => s.type === "mort_vendu"), totS);
    const caN = somme(sorA, totS);
    const encN = somme(sorA, (s) => num(s.montantVerse));
    const duN = caN - encN;
    const rembN = somme(remA, (r) => num(r.montant));
    const margeS = (s) =>
        s.type === "vente" || s.type === "reserve"
            ? (num(s.prixUnitaire) - prN) * num(s.quantite) : 0;
    const mVentesN = somme(sorA, margeS);
    const aTr = bande.effectifTransfere != null && bande.effectifRecuSite2 != null;

    // ---- Disposition de la feuille Résumé (les autres feuilles s'y réfèrent)
    const L = [];
    const sec = (t) => L.push({ section: t });
    const add = (id, label, val, fmt, res) => L.push({ id, label, val, fmt, res });
    const pos = {};
    const R = (id) => `B${pos[id]}`;
    const RA = (id) => `'Résumé'!$B$${pos[id]}`;
    const D = (col) => rng("Dépenses", col, nd);
    const M = (col) => rng("Mortalité", col, nm);
    const S = (col) => rng("Sorties", col, ns);

    sec("La bande");
    add("souche", "Souche", bande.souche || "");
    add("origine", "Origine", bande.origine || "");
    add("install", "Installation (jour 0)", jourLocal(toDate(bande.dateArrivee)), DATE);
    add("transfert", "Date du transfert", tr ? jourLocal(toDate(bande.dateTransfert)) : "—", DATE);
    add("jourTr", "Jour du transfert",
        tr ? joursEntre(bande.dateArrivee, bande.dateTransfert) : "—");
    add("clot", "Date de clôture",
        cloturee && bande.dateCloture ? jourLocal(toDate(bande.dateCloture)) : "—", DATE);

    sec("Cheptel");
    add("payes", "Poussins payés", num(bande.poussinsPayes));
    add("vivants", "Poussins vivants entrés", Vn);
    add("morts", "Morts", () => `SUM(${M("D")})`, null, Mn);
    add("mortsS1", "dont site 1", () => `SUMIFS(${M("D")},${M("C")},1)`, null, mortsS1N);
    add("mortsS2", "dont site 2", () => `SUMIFS(${M("D")},${M("C")},2)`, null, Mn - mortsS1N);
    add("mortsVendus", "dont morts vendus",
        () => `SUMIFS(${S("D")},${S("C")},"Mort vendu")`, null, mortsVendusN);
    add("parti", "Effectif parti du site 1",
        bande.effectifTransfere != null ? num(bande.effectifTransfere) : "—");
    add("recu", "Effectif reçu au site 2",
        bande.effectifRecuSite2 != null ? num(bande.effectifRecuSite2) : "—");
    add("ecart", "Écart de transfert",
        aTr ? () => `${R("parti")}-${R("recu")}` : "—", null,
        aTr ? num(bande.effectifTransfere) - num(bande.effectifRecuSite2) : undefined);
    add("sortis", "Poulets sortis (tous types)",
        () => `SUMIFS(${S("D")},${S("C")},"<>Mort vendu")`, null, sortisN);
    add("restants", "Poulets restants",
        () => `${R("vivants")}-${R("morts")}-${R("sortis")}`, null, Vn - Mn - sortisN);
    add("vendus", "Poulets vendus",
        () => `SUMIFS(${S("D")},${S("C")},"Vente")`, null, venduN);
    add("tPerte", "Taux de perte",
        () => `IF(${R("vivants")}=0,0,${R("morts")}/${R("vivants")})`, PCT,
        Vn === 0 ? 0 : Mn / Vn);
    add("tVente", "Taux de vente (sur les survivants)",
        () => `IF(${R("vivants")}-${R("morts")}=0,0,${R("vendus")}/(${R("vivants")}-${R("morts")}))`,
        PCT, baseN === 0 ? 0 : venduN / baseN);

    sec("Coûts");
    add("cReel", "Dépenses réelles",
        () => `SUMIFS(${D("H")},${D("D")},"Réelle")`, FCFA, coutReelN);
    add("cImp", "Charges fixes imputées",
        () => `SUMIFS(${D("H")},${D("D")},"Imputée")`, FCFA, coutImpN);
    add("cTot", "Coût total", () => `SUM(${D("H")})`, FCFA, coutN);
    add("pr", cloturee ? "Prix de revient final (par poulet)" : "Prix de revient provisoire (par poulet)",
        cloturee && num(bande.prixRevientFinal) > 0
            ? num(bande.prixRevientFinal)
            : () => `IF(${R("vivants")}-${R("morts")}=0,0,${R("cTot")}/(${R("vivants")}-${R("morts")}))`,
        FCFA2, prN);

    sec("Argent");
    add("ca", "Chiffre d'affaires", () => `SUM(${S("F")})`, FCFA, caN);
    add("enc", "Encaissé à la vente", () => `SUM(${S("G")})`, FCFA, encN);
    add("du", "Reste dû sur les ventes de la bande", () => `SUM(${S("H")})`, FCFA, duN);
    add("recMorts", "dont recettes des morts vendus",
        () => `SUMIFS(${S("F")},${S("C")},"Mort vendu")`, FCFA, recMortsN);
    add("remb", "Remboursements de dettes reçus pendant la bande",
        () => `SUM(${rng("Remboursements", "C", nr)})`, FCFA, rembN);
    add("treso", "Trésorerie encaissée (vente + remboursements)",
        () => `${R("enc")}+${R("remb")}`, FCFA, encN + rembN);

    sec("Résultat");
    add("mVentes", "Marge sur ventes", () => `SUM(${S("K")})`, FCFA, mVentesN);
    add("mTot", "Marge totale (CA − coût total)",
        () => `${R("ca")}-${R("cTot")}`, FCFA, caN - coutN);
    add("mPoulet", "Marge par poulet vendu",
        () => `IF(${R("vendus")}=0,0,${R("mVentes")}/${R("vendus")})`, FCFA,
        venduN === 0 ? 0 : mVentesN / venduN);
    add("manque", "Manque à gagner (non vendus × prix de revient)",
        () => `(${R("vivants")}-${R("morts")}-${R("vendus")})*${R("pr")}`, FCFA,
        (baseN - venduN) * prN);
    add("perteNette", "Perte nette sur mortalité (morts × prix de revient − recettes)",
        () => `${R("morts")}*${R("pr")}-${R("recMorts")}`, FCFA, Mn * prN - recMortsN);

    let row = 6;
    L.forEach((x) => {
        if (x.section) row += 2;
        else { pos[x.id] = row; row += 1; }
    });

    // ---- Classeur
    const wb = new ExcelJS.Workbook();
    wb.creator = profil?.nom || "Suivi de bandes";
    wb.created = new Date();
    wb.calcProperties = { fullCalcOnLoad: true };
    const wsR = wb.addWorksheet("Résumé");
    const wsD = wb.addWorksheet("Dépenses");
    const wsM = wb.addWorksheet("Mortalité");
    const wsS = wb.addWorksheet("Sorties");
    const wsB = wb.addWorksheet("Remboursements");
    const wsJ = wb.addWorksheet("Journal");

    // Dépenses
    entete(wsD, [["Date", "date", 12], ["Rubrique", "rub", 28], ["Famille", "fam", 11],
    ["Nature", "nat", 11], ["Quantité", "q", 11], ["Unité", "u", 10],
    ["Prix unitaire", "p", 14], ["Total", "t", 14], ["Qté annoncée", "qa", 13],
    ["Écart", "ec", 9], ["Fournisseur", "f", 16], ["Note", "n", 26],
    ["Saisi par", "par", 18], ["Saisi le", "saisi", 17]]);
    depA.forEach((d, k) => {
        const i = k + 2;
        wsD.addRow({
            date: jourLocal(toDate(d.date)), rub: d.designation || "",
            fam: FAMILLES[d.famille] || d.famille || "", nat: NATURES[d.nature] || d.nature || "",
            q: num(d.quantite), u: d.unite || "", p: num(d.prixUnitaire),
            qa: d.quantiteDeclaree ?? null, f: d.fournisseur || "", n: d.note || "",
            par: auteur(d), saisi: toDate(d.creeLe),
        });
        wsD.getCell(`H${i}`).value = { formula: `ROUND(E${i}*G${i},0)`, result: totD(d) };
        wsD.getCell(`J${i}`).value = {
            formula: `IF(ISBLANK(I${i}),"",E${i}-I${i})`,
            result: d.quantiteDeclaree == null ? "" : num(d.quantite) - num(d.quantiteDeclaree),
        };
    });
    wsD.getColumn("date").numFmt = DATE;
    wsD.getColumn("p").numFmt = FCFA;
    wsD.getColumn("t").numFmt = FCFA;
    wsD.getColumn("saisi").numFmt = "dd/mm/yyyy hh:mm";
    wsD.autoFilter = "A1:N1";

    // Mortalité
    entete(wsM, [["Date", "date", 12], ["Jour d'élevage", "jour", 14], ["Site", "site", 7],
    ["Nombre", "nb", 10], ["Cumul", "cum", 10], ["Effectif restant", "rest", 16],
    ["Observation", "obs", 34]]);
    let cumul = 0;
    morA.forEach((m, k) => {
        const i = k + 2;
        cumul += num(m.nombre);
        wsM.addRow({
            date: jourLocal(toDate(m.date)), jour: joursEntre(bande.dateArrivee, m.date),
            site: tr && ms(m.date) > tr ? 2 : 1, nb: num(m.nombre), obs: m.observation || "",
        });
        wsM.getCell(`E${i}`).value = { formula: `SUM($D$2:D${i})`, result: cumul };
        wsM.getCell(`F${i}`).value = { formula: `${RA("vivants")}-E${i}`, result: Vn - cumul };
    });
    wsM.getColumn("date").numFmt = DATE;
    wsM.autoFilter = "A1:G1";

    // Sorties
    entete(wsS, [["Date", "date", 12], ["Client", "client", 20], ["Type", "type", 13],
    ["Quantité", "q", 10], ["Prix unitaire", "p", 14], ["Total", "tot", 14],
    ["Versé", "verse", 14], ["Reste à payer", "reste", 14], ["Statut", "statut", 11],
    ["Prix de revient", "pr", 14], ["Marge", "marge", 14], ["Note", "note", 26],
    ["Saisi par", "par", 18], ["Saisi le", "saisi", 17]]);
    sorA.forEach((s, k) => {
        const i = k + 2;
        const total = totS(s);
        const verse = num(s.montantVerse);
        const reste = total - verse;
        const statut = total === 0 ? "-" : reste === 0 ? "Payé" : verse > 0 ? "Avance" : "Non payé";
        wsS.addRow({
            date: jourLocal(toDate(s.date)),
            client: s.clientNom || nomClient[s.clientId] || "",
            type: TYPES[s.type] || s.type, q: num(s.quantite), p: num(s.prixUnitaire),
            verse, note: s.note || "",
            par: auteur(s), saisi: toDate(s.creeLe),
        });
        wsS.getCell(`F${i}`).value = { formula: `ROUND(D${i}*E${i},0)`, result: total };
        wsS.getCell(`H${i}`).value = { formula: `F${i}-G${i}`, result: reste };
        wsS.getCell(`I${i}`).value = {
            formula: `IF(F${i}=0,"-",IF(H${i}=0,"Payé",IF(G${i}>0,"Avance","Non payé")))`,
            result: statut,
        };
        wsS.getCell(`J${i}`).value = { formula: RA("pr"), result: prN };
        wsS.getCell(`K${i}`).value = {
            formula: `IF(OR(C${i}="Vente",C${i}="Réservé"),(E${i}-J${i})*D${i},0)`,
            result: margeS(s),
        };
    });
    wsS.getColumn("date").numFmt = DATE;
    ["p", "tot", "verse", "reste", "pr", "marge"].forEach((k) => { wsS.getColumn(k).numFmt = FCFA; });
    wsS.getColumn("saisi").numFmt = "dd/mm/yyyy hh:mm";
    wsS.autoFilter = "A1:N1";

    // Remboursements
    entete(wsB, [["Date", "date", 12], ["Client", "client", 22], ["Montant", "m", 14],
    ["Mode", "mode", 14], ["Note", "note", 30]]);
    remA.forEach((r) => {
        wsB.addRow({
            date: jourLocal(toDate(r.date)), client: nomClient[r.clientId] || "?",
            m: num(r.montant), mode: MODES[r.mode] || r.mode || "", note: r.note || "",
        });
    });
    if (nr === 0) {
        wsB.getCell("A3").value =
            "Aucun remboursement de dette enregistré depuis cette bande. Les avances versées " +
            "à la vente figurent dans la feuille Sorties (colonne Versé). Les remboursements " +
            "saisis depuis l'écran « Dettes clients » de l'accueil ne sont rattachés à aucune bande.";
        wsB.getCell("A3").font = { italic: true };
    }
    wsB.getColumn("date").numFmt = DATE;
    wsB.getColumn("m").numFmt = FCFA;
    wsB.autoFilter = "A1:E1";

    // Journal des lignes annulées
    entete(wsJ, [["Date de la ligne", "date", 16], ["Nature", "nat", 15],
    ["Libellé", "lib", 34], ["Quantité / montant", "val", 18],
    ["Saisi le", "saisi", 18], ["Saisi par", "par", 20]]);
    const annulees = [
        ...dep.filter((x) => x.annule).map((x) => ({ nat: "Dépense", lib: x.designation, val: num(x.total), x })),
        ...mor.filter((x) => x.annule).map((x) => ({ nat: "Mortalité", lib: x.observation || "", val: num(x.nombre), x })),
        ...sor.filter((x) => x.annule).map((x) => ({ nat: "Sortie", lib: `${TYPES[x.type] || x.type} ${x.clientNom || ""}`.trim(), val: num(x.quantite), x })),
        ...rem.filter((x) => x.annule).map((x) => ({ nat: "Remboursement", lib: nomClient[x.clientId] || "?", val: num(x.montant), x })),
    ].sort((a, c) => ms(a.x.creeLe) - ms(c.x.creeLe));
    annulees.forEach(({ nat, lib, val, x }) => {
        wsJ.addRow({
            date: jourLocal(toDate(x.date)), nat, lib: lib || "", val,
            saisi: toDate(x.creeLe), par: auteur(x),
        });
    });
    wsJ.getColumn("date").numFmt = DATE;
    wsJ.getColumn("saisi").numFmt = "dd/mm/yyyy hh:mm";

    // Résumé
    wsR.getColumn("A").width = 48;
    wsR.getColumn("B").width = 22;
    wsR.getCell("A1").value = `${libelle} : rapport de bande`;
    wsR.getCell("A1").font = { bold: true, size: 14 };
    wsR.getCell("A2").value =
        `Exporté le ${fr(new Date())} par ${profil?.nom || "?"}`;
    wsR.getCell("A3").value = cloturee
        ? `Bande clôturée le ${fr(toDate(bande.dateCloture))} : prix de revient final`
        : `Bande en cours (${st === "site1" ? "site 1" : "site 2"}) : prix de revient provisoire`;
    wsR.getCell("A3").font = { bold: true, color: { argb: cloturee ? "FF2C7A4B" : "FFB3402A" } };

    row = 6;
    L.forEach((x) => {
        if (x.section) {
            row += 1;
            const c = wsR.getCell(`A${row}`);
            c.value = x.section;
            c.font = { bold: true };
            ["A", "B"].forEach((col) => {
                wsR.getCell(`${col}${row}`).fill = {
                    type: "pattern", pattern: "solid", fgColor: { argb: "FFF2A900" }
                };
            });
            row += 1;
        } else {
            wsR.getCell(`A${row}`).value = x.label;
            const c = wsR.getCell(`B${row}`);
            c.value = typeof x.val === "function"
                ? { formula: x.val(), result: x.res }
                : x.val;
            if (x.fmt) c.numFmt = x.fmt;
            c.alignment = { horizontal: "right" };
            row += 1;
        }
    });

    // ---- Téléchargement
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    const nom = `${libelle} - ${new Date().toLocaleDateString("sv-SE")}.xlsx`
        .replace(/[\\/:*?"<>|]/g, "-");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = nom;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}