import { useEffect, useState } from "react";
import {
    collection, doc, setDoc, updateDoc, onSnapshot, query, orderBy,
    Timestamp, serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { num, joursEntre, statutDe } from "./utils";

const POIDS_SAC = 50; // kg
const cle = (ts) => (ts?.toDate ? ts.toDate().toLocaleDateString("sv-SE") : "");
const un = (x) => (Math.round(x * 10) / 10).toLocaleString("fr-FR");
const jourFr = (k) => new Date(k + "T12:00:00").toLocaleDateString("fr-FR");

export default function Aliment({ user, profil, bande }) {
    const aujourdhui = new Date().toLocaleDateString("sv-SE");
    const [lignes, setLignes] = useState([]);
    const [morts, setMorts] = useState([]);
    const [sorties, setSorties] = useState([]);
    const [date, setDate] = useState(aujourdhui);
    const [sacs, setSacs] = useState("");
    const [note, setNote] = useState("");
    const [msg, setMsg] = useState("");
    const [tout, setTout] = useState(false);

    useEffect(() => {
        const b = ["bandes", bande.id];
        const q = query(collection(db, ...b, "aliment"), orderBy("creeLe", "desc"));
        const u1 = onSnapshot(q, { includeMetadataChanges: true }, (s) =>
            setLignes(
                s.docs.map((d) => ({
                    id: d.id, ...d.data(), enAttente: d.metadata.hasPendingWrites,
                }))
            )
        );
        const u2 = onSnapshot(collection(db, ...b, "mortalites"), (s) =>
            setMorts(s.docs.map((d) => d.data())));
        const u3 = onSnapshot(collection(db, ...b, "sorties"), (s) =>
            setSorties(s.docs.map((d) => d.data())));
        return () => { u1(); u2(); u3(); };
    }, [bande.id]);

    const peutEcrire =
        profil && ["admin", "saisie"].includes(profil.role) &&
        statutDe(bande) !== "cloturee";

    const valides = lignes.filter((l) => !l.annule);
    const parJour = {};
    valides.forEach((l) => {
        const k = cle(l.date);
        if (k) parJour[k] = (parJour[k] || 0) + num(l.sacs);
    });
    const jours = Object.keys(parJour).sort();

    const V = num(bande.poussinsVivantsEntres);
    const mv = morts.filter((m) => !m.annule);
    const sv = sorties.filter((s) => !s.annule && s.type !== "mort_vendu");
    // Effectif du matin : entrés − morts et sorties des jours précédents
    const effectifMatin = (k) =>
        V -
        mv.filter((x) => cle(x.date) < k).reduce((s, x) => s + num(x.nombre), 0) -
        sv.filter((x) => cle(x.date) < k).reduce((s, x) => s + num(x.quantite), 0);

    let gPrec = null;
    const detail = jours.map((k) => {
        const sacsJ = parJour[k];
        const eff = effectifMatin(k);
        const g = eff > 0 ? (sacsJ * POIDS_SAC * 1000) / eff : null;
        const variation = g != null && gPrec ? (g - gPrec) / gPrec : null;
        if (g != null) gPrec = g;
        const jour = joursEntre(
            bande.dateArrivee, Timestamp.fromDate(new Date(k + "T12:00:00")));
        return { k, sacsJ, eff, g, variation, jour };
    });
    const affiche = detail.slice().reverse().slice(0, tout ? detail.length : 14);

    const totalSacs = jours.reduce((s, k) => s + parJour[k], 0);
    const dejaCeJour = parJour[date] || 0;
    const enAttente = lignes.filter((l) => l.enAttente).length;

    function enregistrer(e) {
        e.preventDefault();
        const q = Number(sacs);
        if (!(q > 0) || q > 500) return setMsg("Entrez un nombre de sacs entre 0 et 500.");
        if (date > aujourdhui) return setMsg("La date ne peut pas être dans le futur.");
        const [y, m, j] = date.split("-").map(Number);
        setDoc(doc(collection(db, "bandes", bande.id, "aliment")), {
            date: Timestamp.fromDate(new Date(y, m - 1, j, 12)),
            sacs: q,
            poidsSac: POIDS_SAC,
            note: note.trim(),
            creePar: user.uid,
            creeLe: Timestamp.now(),
            syncLe: serverTimestamp(),
            source: "mobile",
            annule: false,
        }).catch((err) => setMsg("Refusé : " + err.code));
        setSacs(""); setNote(""); setMsg("");
    }

    function annuler(l) {
        updateDoc(doc(db, "bandes", bande.id, "aliment", l.id), { annule: true })
            .catch((err) => setMsg("Refusé : " + err.code));
    }

    return (
        <div>
            <p>
                Cumul : <b>{un(totalSacs)} sacs</b> ({un(totalSacs * POIDS_SAC)} kg)
                {enAttente > 0 && ` · ${enAttente} en attente d'envoi`}
            </p>

            {peutEcrire ? (
                <form onSubmit={enregistrer}>
                    <label>Date
                        <input type="date" value={date} max={aujourdhui}
                            onChange={(e) => setDate(e.target.value)} />
                    </label>
                    <label>Sacs servis dans les mangeoires
                        <input type="number" inputMode="decimal" step="0.5" min="0"
                            value={sacs} onChange={(e) => setSacs(e.target.value)} />
                    </label>
                    <div style={{ fontSize: 13, opacity: 0.85 }}>
                        Comptez les sacs servis, pas les sacs détachés. 1 sac = {POIDS_SAC} kg.
                        {dejaCeJour > 0 &&
                            ` Déjà saisi ce jour : ${un(dejaCeJour)} sacs (la saisie s'ajoute).`}
                    </div>
                    <label>Note (facultatif)
                        <input value={note} onChange={(e) => setNote(e.target.value)} />
                    </label>
                    <button type="submit">Enregistrer</button>
                </form>
            ) : (
                <p>Saisie impossible : bande clôturée ou rôle en lecture.</p>
            )}
            {msg && <p style={{ color: "crimson" }}>{msg}</p>}

            <h3>Par jour</h3>
            {affiche.length === 0 && <p>Aucune saisie d'aliment.</p>}
            <ul>
                {affiche.map((d) => {
                    const baisse = d.variation != null && d.variation < -0.15;
                    return (
                        <li key={d.k}>
                            <b>{jourFr(d.k)}</b> · J{d.jour}<br />
                            {un(d.sacsJ)} sacs ({un(d.sacsJ * POIDS_SAC)} kg)
                            {d.g != null && <> · <b>{Math.round(d.g)} g</b> par poulet</>}
                            {d.variation != null && (
                                <span style={{ color: baisse ? "crimson" : undefined, fontWeight: baisse ? 700 : 400 }}>
                                    {" "}· {baisse ? "⚠ " : ""}
                                    {d.variation >= 0 ? "+" : "−"}
                                    {Math.abs(Math.round(d.variation * 100))} %
                                </span>
                            )}
                        </li>
                    );
                })}
            </ul>
            {detail.length > 14 && (
                <button type="button" className="petit" onClick={() => setTout(!tout)}>
                    {tout ? "Afficher moins" : "Afficher tout"}
                </button>
            )}
            <p style={{ fontSize: 12, opacity: 0.75 }}>
                Effectif du matin = poussins entrés − morts et sorties des jours précédents.
                Variation = écart de grammes par poulet avec le jour saisi précédent.
            </p>

            <h3>Dernières saisies</h3>
            <ul>
                {valides.slice(0, 8).map((l) => (
                    <li key={l.id}>
                        {l.date?.toDate ? l.date.toDate().toLocaleDateString("fr-FR") : "?"} :{" "}
                        <b>{un(num(l.sacs))} sacs</b>
                        {l.note && ` – ${l.note}`}
                        {l.enAttente && " ⏳"}{" "}
                        {peutEcrire && (
                            <button type="button" onClick={() => annuler(l)}>Annuler</button>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}