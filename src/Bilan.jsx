import { useEffect, useState } from "react";
import {
    collection, doc, setDoc, onSnapshot, Timestamp, serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { exporterBande } from "./exportBande";

const num = (x) => Number(x) || 0;
const fcfa = (n) => Math.round(num(n)).toLocaleString("fr-FR") + " F";
const pct = (x) =>
    Number.isFinite(x) ? (x * 100).toFixed(1).replace(".", ",") + " %" : "-";
const AVEC_PRIX = ["vente", "reserve", "mort_vendu"];

export default function Bilan({ user, profil, bande }) {
    const [deps, setDeps] = useState([]);
    const [morts, setMorts] = useState([]);
    const [sorties, setSorties] = useState([]);
    const [modele, setModele] = useState([]);
    const [importe, setImporte] = useState(false);
    const [msg, setMsg] = useState("");
    const [exportEnCours, setExportEnCours] = useState(false);

    // Précharge le module d'export : il sera aussi disponible hors-ligne ensuite
    useEffect(() => { import("exceljs"); }, []);

    async function exporter() {
        setExportEnCours(true);
        setMsg("");
        try {
            await exporterBande({ bande, user, profil });
        } catch (err) {
            setMsg("Export impossible : " + (err.message || err));
        }
        setExportEnCours(false);
    }

    useEffect(() => {
        const b = ["bandes", bande.id];
        const u1 = onSnapshot(collection(db, ...b, "depenses"), (s) =>
            setDeps(s.docs.map((d) => d.data())));
        const u2 = onSnapshot(collection(db, ...b, "mortalites"), (s) =>
            setMorts(s.docs.map((d) => d.data())));
        const u3 = onSnapshot(collection(db, ...b, "sorties"), (s) =>
            setSorties(s.docs.map((d) => d.data())));
        const u4 = onSnapshot(collection(db, "modeleChargesFixes"), (s) =>
            setModele(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
        return () => { u1(); u2(); u3(); u4(); };
    }, [bande.id]);

    const dep = deps.filter((d) => !d.annule);
    const sor = sorties.filter((s) => !s.annule);

    // Cheptel
    const V = num(bande.poussinsVivantsEntres);
    const M = morts.filter((m) => !m.annule).reduce((s, m) => s + num(m.nombre), 0);
    const base = V - M;
    const tr = bande.dateTransfert?.toMillis?.();
    const mortsS1 = morts
        .filter((m) => !m.annule && (!tr || (m.date?.toMillis?.() || 0) <= tr))
        .reduce((s, m) => s + num(m.nombre), 0);
    const mortsS2 = tr ? M - mortsS1 : 0;
    const ecartTr = num(bande.effectifTransfere) - num(bande.effectifRecuSite2);

    const sortis = sor.filter((s) => s.type !== "mort_vendu")
        .reduce((s, x) => s + num(x.quantite), 0);
    const restants = base - sortis;
    const vendus = sor.filter((s) => s.type === "vente")
        .reduce((s, x) => s + num(x.quantite), 0);
    const nonVendus = base - vendus;

    // Coûts
    const cout = dep.reduce((s, d) => s + num(d.total), 0);
    const coutImpute = dep.filter((d) => d.nature === "imputee")
        .reduce((s, d) => s + num(d.total), 0);
    const coutReel = cout - coutImpute;
    const figé = bande.statut === "cloturee" && num(bande.prixRevientFinal) > 0;
    const pr = figé ? num(bande.prixRevientFinal) : base > 0 ? cout / base : 0;

    // Argent
    const prixSor = sor.filter((s) => AVEC_PRIX.includes(s.type));
    const ca = prixSor.reduce((s, x) => s + num(x.montantTotal), 0);
    const encaisse = prixSor.reduce((s, x) => s + num(x.montantVerse), 0);
    const resteDu = prixSor.reduce((s, x) => s + num(x.resteAPayer), 0);
    const margeVentes = sor
        .filter((s) => s.type === "vente" || s.type === "reserve")
        .reduce((s, x) => s + (num(x.prixUnitaire) - pr) * num(x.quantite), 0);
    const margeTotale = ca - cout;
    const mortsVendus = sor.filter((s) => s.type === "mort_vendu")
        .reduce((s, x) => s + num(x.quantite), 0);
    const recMorts = sor.filter((s) => s.type === "mort_vendu")
        .reduce((s, x) => s + num(x.montantTotal), 0);
    const perteNette = M * pr - recMorts;
    const manque = nonVendus * pr;

    // Coûts par rubrique
    const parRubrique = Object.entries(
        dep.reduce((acc, d) => {
            const k = d.designation || "Autres";
            acc[k] = (acc[k] || 0) + num(d.total);
            return acc;
        }, {})
    ).sort((a, b) => b[1] - a[1]);

    const peutEcrire = profil && profil.role === "admin";
    const dejaImporte = importe || deps.some((d) => d.nature === "imputee");

    function importerFixes() {
        if (!modele.length) return setMsg("Le modèle de charges fixes est vide.");
        modele.forEach((m) => {
            const q = num(m.quantite);
            const p = num(m.prixUnitaire);
            // ID fixe : impossible de créer deux fois la même charge
            setDoc(doc(db, "bandes", bande.id, "depenses", "fixe_" + m.id), {
                date: bande.dateArrivee || Timestamp.now(),
                rubriqueId: "",
                designation: String(m.nom || "Charge fixe"),
                famille: "fixe",
                nature: "imputee",
                quantite: q,
                quantiteDeclaree: null,
                unite: "forfait",
                prixUnitaire: p,
                total: Math.round(q * p),
                fournisseur: "",
                note: "Charge fixe imputée",
                creePar: user.uid,
                creeLe: Timestamp.now(),
                syncLe: serverTimestamp(),
                source: "mobile",
                annule: false,
            }).catch((err) => setMsg("Refusé : " + err.code));
        });
        setImporte(true);
        setMsg("");
    }

    const Ligne = ({ l, v }) => (
        <div style={{
            display: "flex", justifyContent: "space-between",
            borderBottom: "1px dashed #8886", padding: "4px 0"
        }}>
            <span>{l}</span><b>{v}</b>
        </div>
    );

    return (
        <div>
            {!dejaImporte && (
                <div style={{ border: "1px solid crimson", padding: 10, marginBottom: 12 }}>
                    <b>Charges fixes absentes.</b> Le prix de revient ci-dessous n'inclut
                    ni amortissements, ni salaires, ni location.
                    {peutEcrire ? (
                        <p>
                            <button type="button" onClick={importerFixes}>
                                Importer les {modele.length} charges fixes du modèle
                            </button>
                        </p>
                    ) : (
                        <p>Un administrateur doit les importer.</p>
                    )}
                </div>
            )}
            {msg && <p style={{ color: "crimson" }}>{msg}</p>}

            <p>
                <button type="button" onClick={exporter} disabled={exportEnCours}>
                    {exportEnCours ? "Export en cours…" : "Exporter en Excel"}
                </button>
            </p>

            <h3>Cheptel</h3>
            <Ligne l="Poussins vivants entrés" v={V} />
            <Ligne l="Morts" v={`${M} (${pct(V ? M / V : NaN)})`} />
            <Ligne l="Morts vendus" v={mortsVendus} />
            {tr && <Ligne l="Morts site 1 / site 2" v={`${mortsS1} / ${mortsS2}`} />}
            {tr && <Ligne l="Écart de transfert (parti − reçu)" v={ecartTr} />}
            <Ligne l="Poulets sortis (tous types)" v={sortis} />
            <Ligne l="Poulets restants" v={restants} />
            <Ligne l="Vendus" v={`${vendus} (${pct(base ? vendus / base : NaN)} des survivants)`} />

            <h3>Coûts</h3>
            <Ligne l="Dépenses réelles" v={fcfa(coutReel)} />
            <Ligne l="Charges fixes imputées" v={fcfa(coutImpute)} />
            <Ligne l="Coût total" v={fcfa(cout)} />
            <Ligne l={figé ? "Prix de revient final" : "Prix de revient provisoire"}
                v={fcfa(pr) + " / poulet"} />

            <h3>Argent</h3>
            {/* <Ligne l="Chiffre d'affaires" v={fcfa(ca)} /> */}
            <Ligne l="Ventes de poulets vivants et réservés" v={fcfa(ca - recMorts)} />
            <Ligne l="Recettes des morts vendus" v={fcfa(recMorts)} />
            <Ligne l="Chiffre d'affaires total" v={fcfa(ca)} />

            <Ligne l="Encaissé à la vente" v={fcfa(encaisse)} />
            <Ligne l="Reste dû sur les ventes de la bande" v={fcfa(resteDu)} />

            <h3>Résultat</h3>
            <Ligne l="Marge sur ventes" v={fcfa(margeVentes)} />
            <Ligne l="Marge totale (CA − coût total)" v={fcfa(margeTotale)} />
            <Ligne l={`Manque à gagner (${nonVendus} non vendus × prix de revient)`}
                v={fcfa(manque)} />

            <Ligne l="Perte nette sur mortalité (morts × prix de revient − recettes)"
                v={fcfa(perteNette)} />

            <Ligne l="Résultat net (marge totale − manque à gagner)"
                v={fcfa(margeTotale - manque)} />

            <h3>Coûts par rubrique</h3>
            {parRubrique.length === 0 && <p>Aucune dépense.</p>}
            {parRubrique.map(([k, v]) => (
                <Ligne key={k} l={k}
                    v={`${fcfa(v)} (${pct(cout ? v / cout : NaN)})`} />
            ))}

            <p style={{ fontSize: 12, opacity: 0.7 }}>
                Marge sur ventes : ventes et réservés au prix saisi, moins le prix de
                revient. Les « restants » incluent les poulets encore en stock.
                Les remboursements de dettes ne sont pas dans ce bilan : ils sont
                rattachés au client, pas à la bande.
            </p>
        </div>
    );
}