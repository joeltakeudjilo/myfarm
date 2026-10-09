import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import { num, fcfa, statutDe, jourDepuis, joursEntre, dateFr } from "./utils";
import { exporterSynthese } from "./exportSynthese";


const AVEC_PRIX = ["vente", "reserve", "mort_vendu"];

function CarteBande({ bande, onOuvrir }) {
    const [deps, setDeps] = useState([]);
    const [morts, setMorts] = useState([]);
    const [sorties, setSorties] = useState([]);

    useEffect(() => {
        const b = ["bandes", bande.id];
        const u1 = onSnapshot(collection(db, ...b, "depenses"), (s) =>
            setDeps(s.docs.map((d) => d.data())));
        const u2 = onSnapshot(collection(db, ...b, "mortalites"), (s) =>
            setMorts(s.docs.map((d) => d.data())));
        const u3 = onSnapshot(collection(db, ...b, "sorties"), (s) =>
            setSorties(s.docs.map((d) => d.data())));
        return () => { u1(); u2(); u3(); };
    }, [bande.id]);

    const st = statutDe(bande);
    const jour = jourDepuis(bande.dateArrivee);
    const M = morts.filter((m) => !m.annule).reduce((s, m) => s + num(m.nombre), 0);
    const sor = sorties.filter((s) => !s.annule);
    const sortis = sor.filter((s) => s.type !== "mort_vendu")
        .reduce((s, x) => s + num(x.quantite), 0);
    const vivants = num(bande.poussinsVivantsEntres) - M - sortis;
    const cout = deps.filter((d) => !d.annule).reduce((s, d) => s + num(d.total), 0);
    const ca = sor.filter((s) => AVEC_PRIX.includes(s.type))
        .reduce((s, x) => s + num(x.montantTotal), 0);

    let ligneTransfert = "";
    if (st === "site1") {
        const prevu = num(bande.jourTransfertPrevu) || 15;
        const reste = prevu - (jour ?? 0);
        ligneTransfert =
            `Transfert prévu au jour ${prevu} ` +
            (reste > 0 ? `(dans ${reste} jour${reste > 1 ? "s" : ""})`
                : reste === 0 ? "(aujourd'hui)"
                    : `(dépassé de ${-reste} jour${-reste > 1 ? "s" : ""})`);
    } else if (st === "site2" && bande.dateTransfert) {
        ligneTransfert =
            `Transférée au jour ${joursEntre(bande.dateArrivee, bande.dateTransfert)}`;
    }

    return (
        <div style={{ border: "1px solid #8886", borderRadius: 8, padding: 12, marginBottom: 10 }}>
            <b>{bande.libelle || `Bande ${bande.numero}`}</b>
            {" · "}{st === "site1" ? "Site 1" : "Site 2"} · jour {jour ?? "?"}
            <div style={{ fontSize: 13, opacity: 0.85 }}>{ligneTransfert}</div>
            <div style={{ marginTop: 6 }}>
                Vivants : <b>{vivants}</b> · Coût : <b>{fcfa(cout)}</b> · CA : <b>{fcfa(ca)}</b>
            </div>
            <p style={{ margin: "8px 0 0" }}>
                <button type="button" onClick={() => onOuvrir(bande.id)}>Ouvrir</button>
            </p>
        </div>
    );
}

export default function Accueil({ profil, bandes, onOuvrir, onNouvelle, onDettes }) {
    const [panneau, setPanneau] = useState(false);
    const [coches, setCoches] = useState({});
    const [exportEnCours, setExportEnCours] = useState(false);
    const [msgExport, setMsgExport] = useState("");
    const toutes = [...bandes].sort((a, b) => num(a.numero) - num(b.numero));

    function ouvrirPanneau() {
        setCoches(Object.fromEntries(toutes.map((b) => [b.id, true])));
        setMsgExport("");
        setPanneau(true);
        import("exceljs"); // précharge le module : il restera ensuite disponible hors-ligne
    }

    async function lancerExport() {
        const selection = toutes.filter((b) => coches[b.id]);
        if (selection.length === 0) return setMsgExport("Cochez au moins une bande.");
        setExportEnCours(true);
        setMsgExport("");
        try {
            await exporterSynthese({ bandes: toutes, selection, profil });
            setPanneau(false);
        } catch (err) {
            setMsgExport("Export impossible : " + (err.message || err));
        }
        setExportEnCours(false);
    }

    const enCours = bandes
        .filter((b) => ["site1", "site2"].includes(statutDe(b)))
        .sort((a, b) =>
            (statutDe(a) === "site1" ? 0 : 1) - (statutDe(b) === "site1" ? 0 : 1) ||
            num(b.numero) - num(a.numero));
    const terminees = bandes
        .filter((b) => statutDe(b) === "cloturee")
        .sort((a, b) => num(b.numero) - num(a.numero));

    return (
        <div>
            <h2>Bandes en cours</h2>
            {enCours.length === 0 && <p>Aucune bande en cours.</p>}
            {enCours.map((b) => (
                <CarteBande key={b.id} bande={b} onOuvrir={onOuvrir} />
            ))}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
                {profil?.role === "admin" && (
                    // <button type="button" onClick={onNouvelle}>Nouvelle bande</button>
                    <button type="button" className="primaire" onClick={onNouvelle}>Nouvelle bande</button>
                )}
                <button type="button" onClick={onDettes}>Dettes clients</button>
            </div>

            <p>
                <button type="button" onClick={ouvrirPanneau} disabled={toutes.length === 0}>
                    Exporter la synthèse (Excel)
                </button>
            </p>
            {panneau && (
                // <div style={{ border: "1px solid #8886", borderRadius: 8, padding: 12, marginBottom: 12 }}>
                <div className="carte">
                    <b>Bandes à inclure</b>
                    <p>
                        <button type="button"
                            onClick={() => setCoches(Object.fromEntries(toutes.map((b) => [b.id, true])))}>
                            Tout cocher
                        </button>{" "}
                        <button type="button" onClick={() => setCoches({})}>Tout décocher</button>
                    </p>
                    {toutes.map((b) => (
                        <label key={b.id} style={{ display: "block" }}>
                            <input type="checkbox" checked={!!coches[b.id]}
                                onChange={(e) => setCoches({ ...coches, [b.id]: e.target.checked })} />{" "}
                            {b.libelle || `Bande ${b.numero}`}
                        </label>
                    ))}
                    {msgExport && <p style={{ color: "crimson" }}>{msgExport}</p>}
                    <p>
                        <button type="button" onClick={lancerExport} disabled={exportEnCours}>
                            {exportEnCours ? "Export en cours…" : "Exporter"}
                        </button>{" "}
                        <button type="button" onClick={() => setPanneau(false)}>Fermer</button>
                    </p>
                </div>
            )}

            <h2>Bandes terminées ({terminees.length})</h2>
            {terminees.length === 0 && <p>Aucune bande terminée.</p>}
            <ul>
                {terminees.map((b) => (
                    <li key={b.id}>
                        {b.libelle || `Bande ${b.numero}`} · arrivée {dateFr(b.dateArrivee)}{" "}
                        <button type="button" onClick={() => onOuvrir(b.id)}>Ouvrir</button>
                    </li>
                ))}
            </ul>
        </div>
    );
}