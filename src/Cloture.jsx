import { useEffect, useState } from "react";
import {
    collection, doc, onSnapshot, writeBatch, Timestamp, serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { num, fcfa, statutDe, dateFr } from "./utils";

const AVEC_PRIX = ["vente", "reserve", "mort_vendu"];
const TYPES = [
    ["maison", "Maison"],
    ["abattu", "Abattus"],
    ["don", "Dons"],
    ["disparu", "Disparus"],
];

export default function Cloture({ user, profil, bande }) {
    const [deps, setDeps] = useState([]);
    const [morts, setMorts] = useState([]);
    const [sorties, setSorties] = useState([]);
    const [q, setQ] = useState({ maison: "", abattu: "", don: "", disparu: "" });
    const [msg, setMsg] = useState("");

    useEffect(() => {
        const b = ["bandes", bande.id];
        const u1 = onSnapshot(collection(db, ...b, "depenses"), (s) =>
            setDeps(s.docs.map((d) => d.data())));
        const u2 = onSnapshot(collection(db, ...b, "mortalites"), (s) =>
            setMorts(s.docs.map((d) => d.data())));
        const u3 = onSnapshot(collection(db, ...b, "sorties"), (s) =>
            setSorties(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
        return () => { u1(); u2(); u3(); };
    }, [bande.id]);

    const st = statutDe(bande);
    const sor = sorties.filter((s) => !s.annule);
    const dep = deps.filter((d) => !d.annule);
    const V = num(bande.poussinsVivantsEntres);
    const M = morts.filter((m) => !m.annule).reduce((s, m) => s + num(m.nombre), 0);
    const base = V - M;
    const sortis = sor.filter((s) => s.type !== "mort_vendu")
        .reduce((s, x) => s + num(x.quantite), 0);
    const restants = base - sortis;
    const cout = dep.reduce((s, d) => s + num(d.total), 0);
    const nbImputees = dep.filter((d) => d.nature === "imputee").length;
    const ca = sor.filter((s) => AVEC_PRIX.includes(s.type))
        .reduce((s, x) => s + num(x.montantTotal), 0);
    // const prixFinal = base > 0 ? Math.round(cout / base) : 0;
    const prixFinal = base > 0 ? Math.round((cout / base) * 100) / 100 : 0
    const classes = TYPES.reduce((s, [k]) => s + (Number(q[k]) || 0), 0);

    if (profil?.role !== "admin")
        return <p>Seul un administrateur peut clôturer ou rouvrir une bande.</p>;

    if (st === "cloturee") {
        function rouvrir() {
            if (!window.confirm(
                "Rouvrir cette bande ? Le prix de revient final sera effacé et les " +
                "poulets classés à la clôture seront remis en stock.")) return;
            const batch = writeBatch(db);
            batch.update(doc(db, "bandes", bande.id), {
                statut: "site2", dateCloture: null, prixRevientFinal: null,
            });
            sor.filter((s) => s.source === "cloture").forEach((s) =>
                batch.update(doc(db, "bandes", bande.id, "sorties", s.id), { annule: true }));
            batch.commit().catch((err) => setMsg("Refusé : " + err.code));
        }
        return (
            <div>
                <h3>Bande clôturée</h3>
                <p>
                    Clôturée le <b>{dateFr(bande.dateCloture)}</b><br />
                    Prix de revient final : <b>{fcfa(bande.prixRevientFinal)}</b> / poulet
                </p>
                <button type="button" onClick={rouvrir}>Rouvrir la bande</button>
                {msg && <p style={{ color: "crimson" }}>{msg}</p>}
            </div>
        );
    }

    if (st === "site1")
        return <p>La clôture n'est possible qu'après le transfert vers le site 2.</p>;

    function cloturer(e) {
        e.preventDefault();
        if (base <= 0) return setMsg("Aucun survivant : vérifiez les mortalités.");
        if (restants < 0)
            return setMsg(
                `Le stock est négatif (${restants}). Corrigez une vente ou une mortalité avant de clôturer.`);
        if (classes !== restants)
            return setMsg(
                `Il reste ${restants} poulet(s) à classer, vous en avez classé ${classes}.`);
        if (nbImputees === 0 && !window.confirm(
            "Aucune charge fixe n'est imputée à cette bande : le prix de revient sera trop bas. Clôturer quand même ?"))
            return;
        if (!window.confirm(
            `Clôturer ${bande.libelle || "la bande"} ?\n\n` +
            // `Prix de revient final : ${fcfa(prixFinal)} par poulet\n` +
            `Prix de revient final : ${prixFinal.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} par poulet\n` +
            `Plus aucune mortalité, dépense ni vente ne pourra y être saisie.`))
            return;

        const batch = writeBatch(db);
        batch.update(doc(db, "bandes", bande.id), {
            statut: "cloturee",
            dateCloture: Timestamp.now(),
            prixRevientFinal: prixFinal,
        });
        TYPES.forEach(([k]) => {
            const n = Number(q[k]) || 0;
            if (n <= 0) return;
            batch.set(doc(collection(db, "bandes", bande.id, "sorties")), {
                date: Timestamp.now(),
                type: k,
                clientId: "",
                clientNom: "",
                quantite: n,
                prixUnitaire: 0,
                montantTotal: 0,
                montantVerse: 0,
                resteAPayer: 0,
                note: "Classé à la clôture",
                creePar: user.uid,
                creeLe: Timestamp.now(),
                syncLe: serverTimestamp(),
                source: "cloture",
                annule: false,
            });
        });
        batch.commit().catch((err) => setMsg("Refusé : " + err.code));
        setMsg("");
    }

    return (
        <form onSubmit={cloturer}>
            <h3>Clôturer la bande</h3>
            <p>
                Poulets restants à classer : <b>{restants}</b><br />
                Coût total : <b>{fcfa(cout)}</b> ({nbImputees} charge
                {nbImputees > 1 ? "s" : ""} fixe{nbImputees > 1 ? "s" : ""})<br />
                Prix de revient final : <b>{fcfa(prixFinal)}</b> / poulet<br />
                Marge totale : <b>{fcfa(ca - cout)}</b>
            </p>

            {restants > 0 && (
                <>
                    <p>Classez les {restants} poulets restants :</p>
                    {TYPES.map(([k, l]) => (
                        <label key={k} style={{ display: "block", marginBottom: 8 }}>
                            {l}<br />
                            <input type="number" inputMode="numeric" min="0" step="1"
                                value={q[k]} onChange={(e) => setQ({ ...q, [k]: e.target.value })} />
                        </label>
                    ))}
                    <p>Classés : <b>{classes}</b> / {restants}</p>
                </>
            )}
            {restants === 0 && <p>Tous les poulets sont sortis : rien à classer.</p>}

            {msg && <p style={{ color: "crimson" }}>{msg}</p>}
            <button type="submit">Clôturer la bande</button>
        </form>
    );
}