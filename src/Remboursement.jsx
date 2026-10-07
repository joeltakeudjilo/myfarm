import { useEffect, useState } from "react";
import {
    collection, collectionGroup, doc, setDoc, updateDoc, onSnapshot,
    Timestamp, serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";

const fcfa = (n) => Math.round(Number(n) || 0).toLocaleString("fr-FR") + " F";

const MODES = [
    ["especes", "Espèces"],
    ["mobile_money", "Mobile money"],
    ["autre", "Autre"],
];
const libelleMode = (m) => (MODES.find((x) => x[0] === m) || [m, m || "-"])[1];

export default function Remboursement({ user, profil, bande }) {
    const [clients, setClients] = useState([]);
    const [sorties, setSorties] = useState([]);
    const [rembs, setRembs] = useState([]);

    const [date, setDate] = useState(new Date().toLocaleDateString("sv-SE"));
    const [clientId, setClientId] = useState("");
    const [montant, setMontant] = useState("");
    const [mode, setMode] = useState("especes");
    const [note, setNote] = useState("");
    const [msg, setMsg] = useState("");

    useEffect(() => {
        return onSnapshot(collection(db, "clients"), (snap) =>
            setClients(
                snap.docs
                    .map((d) => ({ id: d.id, ...d.data() }))
                    .filter((c) => typeof c.nom === "string" && c.nom.trim())
            )
        );
    }, []);

    useEffect(() => {
        return onSnapshot(collectionGroup(db, "sorties"), (snap) =>
            setSorties(snap.docs.map((d) => d.data()))
        );
    }, []);

    useEffect(() => {
        return onSnapshot(
            collection(db, "remboursements"),
            { includeMetadataChanges: true },
            (snap) =>
                setRembs(
                    snap.docs.map((d) => ({
                        id: d.id,
                        ...d.data(),
                        enAttente: d.metadata.hasPendingWrites,
                    }))
                )
        );
    }, []);

    function detteDe(id) {
        const du = sorties
            .filter((s) => !s.annule && s.clientId === id)
            .reduce((s, x) => s + (Number(x.resteAPayer) || 0), 0);
        const paye = rembs
            .filter((r) => !r.annule && r.clientId === id)
            .reduce((s, r) => s + (Number(r.montant) || 0), 0);
        return du - paye;
    }

    const dettes = clients
        .map((c) => ({ ...c, dette: detteDe(c.id) }))
        .filter((c) => c.dette !== 0)
        .sort((a, b) => b.dette - a.dette);
    const totalDettes = dettes.reduce((s, c) => s + c.dette, 0);

    const client = clients.find((c) => c.id === clientId);
    const detteActuelle = client ? detteDe(client.id) : 0;
    const m = Number(montant) || 0;
    const detteApres = detteActuelle - m;
    const nomClient = (id) => clients.find((c) => c.id === id)?.nom || "?";

    const recents = rembs
        .filter((r) => !r.annule)
        .sort((a, b) => (b.creeLe?.toMillis?.() || 0) - (a.creeLe?.toMillis?.() || 0))
        .slice(0, 10);
    const enAttente = rembs.filter((r) => r.enAttente).length;
    const peutEcrire = profil && ["admin", "saisie"].includes(profil.role);

    function enregistrer(e) {
        e.preventDefault();
        if (!client) return setMsg("Choisissez un client.");
        if (!Number.isInteger(m) || m < 1)
            return setMsg("Le montant doit être un entier supérieur ou égal à 1.");
        if (m > detteActuelle)
            return setMsg(
                `Le montant dépasse la dette actuelle (${fcfa(detteActuelle)}).`
            );

        const [y, mo, j] = date.split("-").map(Number);
        const ref = doc(collection(db, "remboursements"));
        setDoc(ref, {
            date: Timestamp.fromDate(new Date(y, mo - 1, j, 12)),
            clientId: client.id,
            montant: m,
            mode,
            sortieId: "",
            bandeId: bande ? bande.id : "",
            note: note.trim(),
            creePar: user.uid,
            creeLe: Timestamp.now(),
            syncLe: serverTimestamp(),
            source: "mobile",
            annule: false,
        }).catch((err) => setMsg("Refusé : " + err.code));

        setClientId(""); setMontant(""); setMode("especes");
        setNote(""); setMsg("");
    }

    function annuler(r) {
        updateDoc(doc(db, "remboursements", r.id), { annule: true }).catch((err) =>
            setMsg("Refusé : " + err.code)
        );
    }

    return (
        <div>
            <p>
                Dettes clients : <b>{fcfa(totalDettes)}</b>
                {enAttente > 0 && ` · ${enAttente} en attente d'envoi`}
            </p>

            <h3>Qui doit quoi</h3>
            {dettes.length === 0 ? (
                <p>Aucune dette en cours.</p>
            ) : (
                <ul>
                    {dettes.map((c) => (
                        <li key={c.id}>
                            {c.nom} : <b>{fcfa(c.dette)}</b>{" "}
                            {peutEcrire && c.dette > 0 && (
                                <button type="button" onClick={() => setClientId(c.id)}>
                                    Rembourser
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {peutEcrire ? (
                <form onSubmit={enregistrer}>
                    <h3>Nouveau remboursement</h3>
                    <label>Date<br />
                        <input type="date" value={date}
                            onChange={(e) => setDate(e.target.value)} />
                    </label><br /><br />

                    <label>Client<br />
                        <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
                            <option value="">— choisir —</option>
                            {dettes.filter((c) => c.dette > 0).map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.nom} (doit {fcfa(c.dette)})
                                </option>
                            ))}
                        </select>
                    </label><br /><br />

                    <label>Montant remboursé (F)<br />
                        <input type="number" inputMode="numeric" min="1" step="1"
                            value={montant} onChange={(e) => setMontant(e.target.value)} />
                    </label>{" "}
                    {client && (
                        <button type="button" onClick={() => setMontant(String(detteActuelle))}>
                            Tout rembourser
                        </button>
                    )}
                    <br /><br />

                    <label>Mode de paiement<br />
                        <select value={mode} onChange={(e) => setMode(e.target.value)}>
                            {MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                    </label><br /><br />

                    {client && (
                        <p>
                            Dette avant : <b>{fcfa(detteActuelle)}</b><br />
                            Dette après : <b>{fcfa(detteApres)}</b>
                        </p>
                    )}

                    <label>Note (facultatif)<br />
                        <input value={note} onChange={(e) => setNote(e.target.value)} />
                    </label><br /><br />
                    <button type="submit">Enregistrer</button>
                </form>
            ) : (
                <p>Votre rôle ne permet pas de saisir.</p>
            )}
            {msg && <p style={{ color: "crimson" }}>{msg}</p>}

            <h3>Derniers remboursements</h3>
            <ul>
                {recents.map((r) => (
                    <li key={r.id}>
                        {r.date?.toDate ? r.date.toDate().toLocaleDateString("fr-FR") : "?"}{" "}
                        : {nomClient(r.clientId)} – <b>{fcfa(r.montant)}</b> (
                        {libelleMode(r.mode)})
                        {r.enAttente && " ⏳"}{" "}
                        {peutEcrire && (
                            <button type="button" onClick={() => annuler(r)}>Annuler</button>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}