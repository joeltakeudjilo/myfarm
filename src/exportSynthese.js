import { collection, getDocs } from "firebase/firestore";
import { db } from "./firebase";
import { num, statutDe, joursEntre, jourDepuis } from "./utils";

const AVEC_PRIX = ["vente", "reserve", "mort_vendu"];
const TYPES = {
    vente: "Vente", reserve: "Réservé", maison: "Maison", don: "Don",
    abattu: "Abattu", disparu: "Disparu", ajustement: "Ajustement",
    mort_vendu: "Mort vendu",
};
const MODES = { especes: "Espèces", mobile_money: "Mobile money", autre: "Autre" };
const NATURES = { reelle: "Réelle", imputee: "Imputée" };
const FAMILLES = { fixe: "Fixe", variable: "Variable", autre: "Autre" };
const STATUTS = { site1: "Site 1", site2: "Site 2", cloturee: "Clôturée" };

const FCFA = '#,##0 "F";[Red]-#,##0 "F"';
const DATE = "dd/mm/yyyy";
const PCT = "0.0%";

const toDate = (ts) => (ts?.toDate ? ts.toDate() : null);
const ms = (ts) => ts?.toMillis?.() || 0;
const jourLocal = (d) =>
    d ? new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) : null;
const somme = (l, k) => l.reduce((s, x) => s + num(x[k]), 0);
const col = (n) => {
    let s = "";
    while (n > 0) {
        const r = (n - 1) % 26;
        s = String.fromCharCode(65 + r) + s;
        n = Math.floor((n - 1) / 26);
    }
    return s;
};

function entete(ws, colonnes) {
    ws.columns = colonnes.map(([header, key, width]) => ({ header, key, width }));
    const r = ws.getRow(1);
    r.font = { bold: true, color: { argb: "FFFFFFFF" } };
    r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E2923" } };
    r.alignment = { vertical: "middle", wrapText: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
}

function calculer(b, dep, mor, sor) {
    const d = dep.filter((x) => !x.annule);
    const m = mor.filter((x) => !x.annule);
    const s = sor.filter((x) => !x.annule);
    const V = num(b.poussinsVivantsEntres);
    const M = somme(m, "nombre");
    const base = V - M;
    const vendus = somme(s.filter((x) => x.type === "vente"), "quantite");
    const cout = somme(d, "total");
    const imp = somme(d.filter((x) => x.nature === "imputee"), "total");
    const cloturee = statutDe(b) === "cloturee";
    const pr = cloturee && num(b.prixRevientFinal) > 0
        ? num(b.prixRevientFinal) : base > 0 ? cout / base : 0;
    const ca = somme(s.filter((x) => AVEC_PRIX.includes(x.type)), "montantTotal");
    const mv = s
        .filter((x) => x.type === "vente" || x.type === "reserve")
        .reduce((t, x) => t + (num(x.prixUnitaire) - pr) * num(x.quantite), 0);
    const duree = cloturee && b.dateCloture
        ? joursEntre(b.dateArrivee, b.dateCloture) : jourDepuis(b.dateArrivee);
    return {
        V, M, vendus, cout, imp, ca, duree,
        pr: Math.round(pr), mv: Math.round(mv),
        mt: ca - cout, mq: Math.round((base - vendus) * pr),
    };
}

export async function exporterSynthese({ bandes, selection, profil }) {
    const mod = await import("exceljs");
    const ExcelJS = mod.default || mod;

    const tous = (s) => s.docs.map((d) => ({ id: d.id, ...d.data() }));
    const donnees = {};
    await Promise.all(bandes.map(async (b) => {
        const p = ["bandes", b.id];
        const [d, m, s] = await Promise.all([
            getDocs(collection(db, ...p, "depenses")),
            getDocs(collection(db, ...p, "mortalites")),
            getDocs(collection(db, ...p, "sorties")),
        ]);
        donnees[b.id] = { dep: tous(d), mor: tous(m), sor: tous(s) };
    }));
    const [rS, cS] = await Promise.all([
        getDocs(collection(db, "remboursements")),
        getDocs(collection(db, "clients")),
    ]);
    const rems = tous(rS);
    const infoClient = {};
    tous(cS).forEach((c) => { infoClient[c.id] = c; });
    const nomClient = (id) => infoClient[id]?.nom || "?";

    const libelle = (b) => b.libelle || `Bande ${b.numero}`;
    const parNumero = (a, c) => num(a.numero) - num(c.numero);
    const sel = [...selection].sort(parNumero);
    const toutes = [...bandes].sort(parNumero);
    const nomBande = {};
    bandes.forEach((b) => { nomBande[b.id] = libelle(b); });

    const wb = new ExcelJS.Workbook();
    wb.creator = profil?.nom || "Suivi de bandes";
    wb.created = new Date();
    wb.calcProperties = { fullCalcOnLoad: true };

    // ---------- Bandes
    const wsB = wb.addWorksheet("Bandes");
    entete(wsB, [
        ["Bande", "bande", 12], ["Statut", "statut", 11], ["Souche", "souche", 12],
        ["Origine", "origine", 16], ["Installation", "inst", 13],
        ["Jour du transfert", "jt", 12], ["Clôture", "clot", 13],
        ["Durée (jours)", "duree", 11], ["Poussins entrés", "V", 11],
        ["Morts", "M", 9], ["Taux de perte", "tp", 10], ["Vendus", "vendus", 9],
        ["Taux de vente", "tv", 10], ["Coût total", "cout", 14],
        ["dont charges fixes", "imp", 14], ["Prix de revient", "pr", 13],
        ["Chiffre d'affaires", "ca", 15], ["Marge sur ventes", "mv", 15],
        ["Marge totale", "mt", 15], ["Marge par poulet vendu", "mp", 14],
        ["Manque à gagner", "mq", 14],
    ]);
    sel.forEach((b, k) => {
        const i = k + 2;
        const c = calculer(b, donnees[b.id].dep, donnees[b.id].mor, donnees[b.id].sor);
        wsB.addRow({
            bande: libelle(b), statut: STATUTS[statutDe(b)] || statutDe(b),
            souche: b.souche || "", origine: b.origine || "",
            inst: jourLocal(toDate(b.dateArrivee)),
            jt: b.dateTransfert ? joursEntre(b.dateArrivee, b.dateTransfert) : "",
            clot: b.dateCloture ? jourLocal(toDate(b.dateCloture)) : "",
            duree: c.duree, V: c.V, M: c.M, vendus: c.vendus, cout: c.cout,
            imp: c.imp, pr: c.pr, ca: c.ca, mv: c.mv, mt: c.mt, mq: c.mq,
        });
        wsB.getCell(`K${i}`).value = { formula: `IF(I${i}=0,0,J${i}/I${i})` };
        wsB.getCell(`M${i}`).value = { formula: `IF(I${i}-J${i}=0,0,L${i}/(I${i}-J${i}))` };
        wsB.getCell(`T${i}`).value = { formula: `IF(L${i}=0,0,R${i}/L${i})` };
    });
    const n = sel.length;
    const rt = n + 3;
    const rm = n + 4;
    wsB.getCell(`A${rt}`).value = "Total";
    wsB.getCell(`A${rm}`).value = "Moyenne";
    ["I", "J", "L", "N", "O", "Q", "R", "S", "U"].forEach((x) => {
        wsB.getCell(`${x}${rt}`).value = { formula: `SUM(${x}2:${x}${n + 1})` };
    });
    wsB.getCell(`K${rt}`).value = { formula: `IF(I${rt}=0,0,J${rt}/I${rt})` };
    wsB.getCell(`M${rt}`).value = { formula: `IF(I${rt}-J${rt}=0,0,L${rt}/(I${rt}-J${rt}))` };
    wsB.getCell(`T${rt}`).value = { formula: `IF(L${rt}=0,0,R${rt}/L${rt})` };
    ["H", "K", "M", "N", "P", "Q", "R", "S", "T", "U"].forEach((x) => {
        wsB.getCell(`${x}${rm}`).value = { formula: `AVERAGE(${x}2:${x}${n + 1})` };
    });
    wsB.getRow(rt).font = { bold: true };
    wsB.getRow(rm).font = { bold: true };
    wsB.getCell(`A${n + 6}`).value =
        "Les bandes en cours affichent un prix de revient provisoire ; les moyennes les incluent.";
    wsB.getCell(`A${n + 6}`).font = { italic: true };
    ["inst", "clot"].forEach((k) => { wsB.getColumn(k).numFmt = DATE; });
    ["cout", "imp", "pr", "ca", "mv", "mt", "mp", "mq"].forEach((k) => {
        wsB.getColumn(k).numFmt = FCFA;
    });
    ["tp", "tv"].forEach((k) => { wsB.getColumn(k).numFmt = PCT; });
    wsB.getColumn("duree").numFmt = "0";
    wsB.autoFilter = `A1:U1`;

    // ---------- Coûts par rubrique
    const wsC = wb.addWorksheet("Coûts par rubrique");
    const rub = {};
    sel.forEach((b) => {
        donnees[b.id].dep.filter((x) => !x.annule).forEach((x) => {
            const k = String(x.designation || "Autres").trim() || "Autres";
            rub[k] = rub[k] || {};
            rub[k][b.id] = (rub[k][b.id] || 0) + num(x.total);
        });
    });
    const totalRub = (k) => Object.values(rub[k]).reduce((s, v) => s + v, 0);
    const rubs = Object.keys(rub).sort((a, c) => totalRub(c) - totalRub(a));
    const nb = sel.length;
    entete(wsC, [
        ["Rubrique", "r", 32],
        ...sel.map((b, i) => [libelle(b), "b" + i, 14]),
        ["Moyenne (bandes concernées)", "moy", 16], ["Total", "tot", 15],
    ]);
    const cMoy = col(nb + 2);
    const cTot = col(nb + 3);
    rubs.forEach((k, r) => {
        const i = r + 2;
        const o = { r: k };
        sel.forEach((b, j) => { o["b" + j] = rub[k][b.id] || 0; });
        wsC.addRow(o);
        wsC.getCell(`${cMoy}${i}`).value = {
            formula: `IFERROR(AVERAGEIF(B${i}:${col(nb + 1)}${i},">0"),0)`
        };
        wsC.getCell(`${cTot}${i}`).value = { formula: `SUM(B${i}:${col(nb + 1)}${i})` };
    });
    const rtC = rubs.length + 3;
    wsC.getCell(`A${rtC}`).value = "Total";
    for (let j = 2; j <= nb + 1; j++) {
        wsC.getCell(`${col(j)}${rtC}`).value = {
            formula: `SUM(${col(j)}2:${col(j)}${rubs.length + 1})`
        };
    }
    wsC.getCell(`${cTot}${rtC}`).value = {
        formula: `SUM(${cTot}2:${cTot}${rubs.length + 1})`
    };
    wsC.getRow(rtC).font = { bold: true };
    for (let j = 2; j <= nb + 3; j++) wsC.getColumn(j).numFmt = FCFA;

    // ---------- Clients et dettes (toujours sur toutes les bandes)
    const cl = {};
    const vide = () => ({ du: {}, achats: 0, poulets: 0, ca: 0, remb: 0, dernier: 0 });
    toutes.forEach((b) => {
        donnees[b.id].sor.filter((x) => !x.annule && x.clientId).forEach((x) => {
            const c = (cl[x.clientId] = cl[x.clientId] || vide());
            c.du[b.id] = (c.du[b.id] || 0) + num(x.resteAPayer);
            if (x.type === "vente") { c.achats += 1; c.poulets += num(x.quantite); }
            if (AVEC_PRIX.includes(x.type)) c.ca += num(x.montantTotal);
        });
    });
    rems.filter((r) => !r.annule && r.clientId).forEach((r) => {
        const c = (cl[r.clientId] = cl[r.clientId] || vide());
        c.remb += num(r.montant);
        c.dernier = Math.max(c.dernier, ms(r.date));
    });
    const reste = (c) => Object.values(c.du).reduce((s, v) => s + v, 0);
    const ids = Object.keys(cl);

    const wsK = wb.addWorksheet("Clients (toutes bandes)");
    entete(wsK, [
        ["Client", "nom", 24], ["Téléphone", "tel", 16], ["Achats", "ach", 9],
        ["Poulets achetés", "pou", 12], ["Chiffre d'affaires", "ca", 15],
        ["Reste dû sur les ventes", "du", 16], ["Remboursé", "rb", 14],
        ["Dette actuelle", "dette", 15], ["Dernier remboursement", "der", 16],
    ]);
    ids.sort((a, c) => cl[c].ca - cl[a].ca).forEach((id, k) => {
        const c = cl[id];
        wsK.addRow({
            nom: nomClient(id), tel: infoClient[id]?.telephone || "", ach: c.achats,
            pou: c.poulets, ca: c.ca, du: reste(c), rb: c.remb,
            der: c.dernier ? jourLocal(new Date(c.dernier)) : "",
        });
        wsK.getCell(`H${k + 2}`).value = { formula: `F${k + 2}-G${k + 2}` };
    });
    ["ca", "du", "rb", "dette"].forEach((k) => { wsK.getColumn(k).numFmt = FCFA; });
    wsK.getColumn("der").numFmt = DATE;
    wsK.autoFilter = "A1:I1";

    const wsD = wb.addWorksheet("Dettes (toutes bandes)");
    const T = toutes.length;
    entete(wsD, [
        ["Client", "nom", 24],
        ...toutes.map((b, i) => [`Reste dû ${libelle(b)}`, "b" + i, 15]),
        ["Remboursé (toutes bandes)", "rb", 16], ["Dette actuelle", "dette", 16],
    ]);
    const debiteurs = ids
        .filter((id) => reste(cl[id]) - cl[id].remb > 0)
        .sort((a, c) => (reste(cl[c]) - cl[c].remb) - (reste(cl[a]) - cl[a].remb));
    debiteurs.forEach((id, k) => {
        const i = k + 2;
        const o = { nom: nomClient(id), rb: cl[id].remb };
        toutes.forEach((b, j) => { o["b" + j] = cl[id].du[b.id] || 0; });
        wsD.addRow(o);
        wsD.getCell(`${col(T + 3)}${i}`).value = {
            formula: `SUM(B${i}:${col(T + 1)}${i})-${col(T + 2)}${i}`
        };
    });
    const rtD = debiteurs.length + 3;
    wsD.getCell(`A${rtD}`).value = "Total";
    for (let j = 2; j <= T + 3; j++) {
        wsD.getCell(`${col(j)}${rtD}`).value = {
            formula: `SUM(${col(j)}2:${col(j)}${debiteurs.length + 1})`
        };
    }
    wsD.getRow(rtD).font = { bold: true };
    for (let j = 2; j <= T + 3; j++) wsD.getColumn(j).numFmt = FCFA;
    wsD.getCell(`A${rtD + 2}`).value =
        "Les remboursements sont rattachés au client, pas à une bande : la dette actuelle = somme des restes dus − remboursé.";
    wsD.getCell(`A${rtD + 2}`).font = { italic: true };

    // ---------- Données à plat (pour tableaux croisés dynamiques)
    const oui = (x) => (x.annule ? "Oui" : "Non");
    const wsXD = wb.addWorksheet("Données dépenses");
    entete(wsXD, [["Bande", "b", 12], ["Date", "d", 12], ["Rubrique", "r", 28],
    ["Famille", "f", 10], ["Nature", "n", 10], ["Quantité", "q", 10],
    ["Unité", "u", 10], ["Prix unitaire", "p", 13], ["Total", "t", 13],
    ["Qté annoncée", "qa", 12], ["Fournisseur", "fo", 16], ["Note", "no", 24],
    ["Annulée", "an", 9]]);
    const wsXM = wb.addWorksheet("Données mortalités");
    entete(wsXM, [["Bande", "b", 12], ["Date", "d", 12], ["Jour d'élevage", "j", 13],
    ["Site", "s", 7], ["Nombre", "n", 9], ["Observation", "o", 34], ["Annulée", "an", 9]]);
    const wsXS = wb.addWorksheet("Données sorties");
    entete(wsXS, [["Bande", "b", 12], ["Date", "d", 12], ["Client", "c", 20],
    ["Type", "t", 12], ["Quantité", "q", 10], ["Prix unitaire", "p", 13],
    ["Total", "tot", 13], ["Versé", "v", 13], ["Reste à payer", "r", 13],
    ["Note", "no", 24], ["Annulée", "an", 9]]);
    const wsXR = wb.addWorksheet("Données remboursements");
    entete(wsXR, [["Date", "d", 12], ["Client", "c", 22], ["Montant", "m", 13],
    ["Mode", "mo", 14], ["Bande", "b", 12], ["Note", "no", 26], ["Annulée", "an", 9]]);

    const selIds = new Set(sel.map((b) => b.id));
    sel.forEach((b) => {
        const { dep, mor, sor } = donnees[b.id];
        const tr = ms(b.dateTransfert);
        dep.sort((a, c) => ms(a.date) - ms(c.date)).forEach((x) => wsXD.addRow({
            b: libelle(b), d: jourLocal(toDate(x.date)), r: x.designation || "",
            f: FAMILLES[x.famille] || x.famille || "", n: NATURES[x.nature] || x.nature || "",
            q: num(x.quantite), u: x.unite || "", p: num(x.prixUnitaire), t: num(x.total),
            qa: x.quantiteDeclaree ?? null, fo: x.fournisseur || "", no: x.note || "",
            an: oui(x),
        }));
        mor.sort((a, c) => ms(a.date) - ms(c.date)).forEach((x) => wsXM.addRow({
            b: libelle(b), d: jourLocal(toDate(x.date)),
            j: joursEntre(b.dateArrivee, x.date),
            s: tr && ms(x.date) > tr ? 2 : 1, n: num(x.nombre),
            o: x.observation || "", an: oui(x),
        }));
        sor.sort((a, c) => ms(a.date) - ms(c.date)).forEach((x) => wsXS.addRow({
            b: libelle(b), d: jourLocal(toDate(x.date)),
            c: x.clientNom || (x.clientId ? nomClient(x.clientId) : ""),
            t: TYPES[x.type] || x.type, q: num(x.quantite), p: num(x.prixUnitaire),
            tot: num(x.montantTotal), v: num(x.montantVerse), r: num(x.resteAPayer),
            no: x.note || "", an: oui(x),
        }));
    });
    rems
        .filter((x) => !x.bandeId || selIds.has(x.bandeId))
        .sort((a, c) => ms(a.date) - ms(c.date))
        .forEach((x) => wsXR.addRow({
            d: jourLocal(toDate(x.date)), c: nomClient(x.clientId), m: num(x.montant),
            mo: MODES[x.mode] || x.mode || "", b: nomBande[x.bandeId] || "",
            no: x.note || "", an: oui(x),
        }));
    [wsXD, wsXM, wsXS, wsXR].forEach((ws) => {
        ws.getColumn("d").numFmt = DATE;
        ws.autoFilter = { from: "A1", to: { row: 1, column: ws.columns.length } };
    });
    ["p", "t"].forEach((k) => { wsXD.getColumn(k).numFmt = FCFA; });
    ["p", "tot", "v", "r"].forEach((k) => { wsXS.getColumn(k).numFmt = FCFA; });
    wsXR.getColumn("m").numFmt = FCFA;

    // ---------- Téléchargement
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Synthèse bandes - ${new Date().toLocaleDateString("sv-SE")}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}