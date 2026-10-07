import { useEffect, useState } from "react";
import {
    collection, doc, setDoc, updateDoc, onSnapshot, query, orderBy,
    Timestamp, serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";

export default function Mortalite({ user, profil, bande }) {
    const [date, setDate] = useState(new Date().toLocaleDateString("sv-SE"));
    const [nombre, setNombre] = useState("");
    const [obs, setObs] = useState("");
    const [lignes, setLignes] = useState([]);
    const [msg, setMsg] = useState("");
    const [enLigne, setEnLigne] = useState(navigator.onLine);

    useEffect(() => {
        const on = () => setEnLigne(true);
        const off = () => setEnLigne(false);
        window.addEventListener("online", on);
        window.addEventListener("offline", off);
        return () => {
            window.removeEventListener("online", on);
            window.removeEventListener("offline", off);
        };
    }, []);

    useEffect(() => {
        const q = query(
            collection(db, "bandes", bande.id, "mortalites"),
            orderBy("creeLe", "desc")
        );
        return onSnapshot(q, { includeMetadataChanges: true }, (snap) =>
            setLignes(
                snap.docs.map((d) => ({
                    id: d.id,
                    ...d.data(),
                    enAttente: d.metadata.hasPendingWrites,
                }))
            )
        );
    }, [bande.id]);

    const valides = lignes.filter((l) => !l.annule);
    const totalMorts = valides.reduce((s, l) => s + l.nombre, 0);
    const enAttente = lignes.filter((l) => l.enAttente).length;
    const peutEcrire =
        // profil && ["admin", "saisie"].includes(profil.role)
        profil && ["admin", "saisie"].includes(profil.role) && bande.statut !== "cloturee";

    function enregistrer(e) {
        e.preventDefault();
        const n = Number(nombre);
        if (!Number.isInteger(n) || n < 1) {
            setMsg("Entrez un nombre entier supérieur ou égal à 1.");
            return;
        }
        const [y, m, j] = date.split("-").map(Number);
        // Identifiant créé sur le téléphone : fonctionne hors-ligne
        const ref = doc(collection(db, "bandes", bande.id, "mortalites"));
        // Pas de "await" : hors-ligne, la promesse n'aboutit qu'à la reconnexion
        setDoc(ref, {
            date: Timestamp.fromDate(new Date(y, m - 1, j, 12)),
            nombre: n,
            observation: obs.trim(),
            creePar: user.uid,
            creeLe: Timestamp.now(),
            syncLe: serverTimestamp(),
            source: "mobile",
            annule: false,
        }).catch((err) => setMsg("Refusé : " + err.code));
        setNombre("");
        setObs("");
        setMsg("");
    }

    function annuler(l) {
        updateDoc(doc(db, "bandes", bande.id, "mortalites", l.id), {
            annule: true,
        }).catch((err) => setMsg("Refusé : " + err.code));
    }

    return (
        <div>
            <p>
                {enLigne ? "🟢 En ligne" : "🔴 Hors-ligne"}
                {enAttente > 0 && ` · ${enAttente} en attente d'envoi`}
            </p>
            <p>
                Morts cumulés : <b>{totalMorts}</b> · Vivants (hors ventes) :{" "}
                <b>{bande.poussinsVivantsEntres - totalMorts}</b>
            </p>

            {peutEcrire ? (
                <form onSubmit={enregistrer}>
                    <label>Date<br />
                        <input type="date" value={date}
                            onChange={(e) => setDate(e.target.value)} />
                    </label><br /><br />
                    <label>Nombre de morts<br />
                        <input type="number" inputMode="numeric" min="1" value={nombre}
                            onChange={(e) => setNombre(e.target.value)} />
                    </label><br /><br />
                    <label>Observation (facultatif)<br />
                        <input value={obs} onChange={(e) => setObs(e.target.value)} />
                    </label><br /><br />
                    <button type="submit">Enregistrer</button>
                </form>
            ) : (
                <p>Saisie impossible : bande clôturée ou rôle en lecture.</p>
            )}
            {msg && <p style={{ color: "crimson" }}>{msg}</p>}

            <h3>Dernières saisies</h3>
            <ul>
                {valides.slice(0, 10).map((l) => (
                    <li key={l.id}>
                        {l.date.toDate().toLocaleDateString("fr-FR")} : {l.nombre} mort(s)
                        {l.observation && ` – ${l.observation}`}
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