import { useEffect, useState } from "react";
import {
    collection, collectionGroup, doc, setDoc, updateDoc, onSnapshot,
    Timestamp, serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";

const fcfa = (n) => Math.round(Number(n) || 0).toLocaleString("fr-FR") + " F";

const TYPES = [
    ["vente", "Vente"],
    ["reserve", "Réservé"],
    ["maison", "Maison"],
    ["don", "Don"],
    ["abattu", "Abattu"],
    ["disparu", "Disparu"],
    ["ajustement", "Ajustement"],
    ["mort_vendu", "Mort vendu"],
];
const AVEC_PRIX = ["vente", "reserve", "mort_vendu"];
const libelleType = (t) => (TYPES.find((x) => x[0] === t) || [t, t])[1];

export default function Vente({ user, profil, bande }) {
    const [clients, setClients] = useState([]);
    const [toutes, setToutes] = useState([]); // toutes les sorties, toutes bandes
    const [rembs, setRembs] = useState([]);
    const [morts, setMorts] = useState([]);

    const [date, setDate] = useState(new Date().toLocaleDateString("sv-SE"));
    const [type, setType] = useState("vente");
    const [clientNom, setClientNom] = useState("");
    const [quantite, setQuantite] = useState("");
    const [prix, setPrix] = useState("");
    const [verse, setVerse] = useState("");
    const [note, setNote] = useState("");
    const [msg, setMsg] = useState("");

    useEffect(() => {
        return onSnapshot(collection(db, "clients"), (snap) => {
            setClients(
                snap.docs
                    .map((d) => ({ id: d.id, ...d.data() }))
                    .filter((c) => typeof c.nom === "string" && c.nom.trim() && c.actif !== false)
                    .sort((a, b) => a.nom.localeCompare(b.nom))
            );
        });
    }, []);

    // Toutes les sorties (sert au calcul des dettes sur toutes les bandes)
    useEffect(() => {
        return onSnapshot(
            collectionGroup(db, "sorties"),
            { includeMetadataChanges: true },
            (snap) =>
                setToutes(
                    snap.docs.map((d) => ({
                        id: d.id,
                        bandeId: d.ref.parent.parent.id,
                        ...d.data(),
                        enAttente: d.metadata.hasPendingWrites,
                    }))
                )
        );
    }, []);

    useEffect(() => {
        return onSnapshot(collection(db, "remboursements"), (snap) =>
            setRembs(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        );
    }, []);

    useEffect(() => {
        return onSnapshot(collection(db, "bandes", bande.id, "mortalites"), (snap) =>
            setMorts(snap.docs.map((d) => d.data()))
        );
    }, [bande.id]);

    const sortiesBande = toutes
        .filter((s) => s.bandeId === bande.id)
        .sort((a, b) => (b.creeLe?.toMillis?.() || 0) - (a.creeLe?.toMillis?.() || 0));
    const valides = sortiesBande.filter((s) => !s.annule);
    const totalMorts = morts
        .filter((m) => !m.annule)
        .reduce((s, m) => s + (Number(m.nombre) || 0), 0);
    const sortis = valides
        .filter((s) => s.type !== "mort_vendu")
        .reduce((s, x) => s + (Number(x.quantite) || 0), 0);
    const restants = bande.poussinsVivantsEntres - totalMorts - sortis;

    function detteDe(id) {
        if (!id) return 0;
        const du = toutes
            .filter((s) => !s.annule && s.clientId === id)
            .reduce((s, x) => s + (Number(x.resteAPayer) || 0), 0);
        const paye = rembs
            .filter((r) => !r.annule && r.clientId === id)
            .reduce((s, r) => s + (Number(r.montant) || 0), 0);
        return du - paye;
    }

    const nomNet = clientNom.trim();
    const clientTrouve = clients.find(
        (c) => c.nom.trim().toLowerCase() === nomNet.toLowerCase()
    );
    const avecPrix = AVEC_PRIX.includes(type);
    const q = Number(quantite) || 0;
    const totalVente = avecPrix ? Math.round(q * (Number(prix) || 0)) : 0;
    const verseN = avecPrix ? Number(verse) || 0 : 0;
    const reste = totalVente - verseN;
    const detteActuelle = detteDe(clientTrouve?.id);
    const detteApres = detteActuelle + reste;
    const statut = !avecPrix || totalVente === 0 ? "-"
        : reste === 0 ? "Payé" : verseN > 0 ? "Avance" : "Non payé";
    const enAttente = sortiesBande.filter((s) => s.enAttente).length;
    const peutEcrire =
        // profil && ["admin", "saisie"].includes(profil.role)
        profil && ["admin", "saisie"].includes(profil.role) && bande.statut !== "cloturee";


    function enregistrer(e) {
        e.preventDefault();
        const p = avecPrix ? Number(prix) : 0;
        const v = avecPrix ? Number(verse) || 0 : 0;

        if (!Number.isInteger(q) || q === 0)
            return setMsg("La quantité doit être un entier non nul.");
        if (q < 0 && type !== "ajustement")
            return setMsg("Seul un ajustement peut avoir une quantité négative.");
        if (type === "vente" && !nomNet)
            return setMsg("Choisissez ou tapez le nom du client.");
        if (avecPrix && (!Number.isInteger(p) || p < 0))
            return setMsg("Le prix unitaire doit être un nombre entier.");
        if (!Number.isInteger(v) || v < 0)
            return setMsg("Le montant versé doit être un nombre entier.");
        if (v > Math.round(q * p))
            return setMsg("Le montant versé dépasse le total de la vente.");

        // Client : existant, ou créé maintenant (fonctionne hors-ligne)
        let clientId = "";
        if (nomNet) {
            if (clientTrouve) {
                clientId = clientTrouve.id;
            } else {
                const cref = doc(collection(db, "clients"));
                clientId = cref.id;
                setDoc(cref, {
                    nom: nomNet, telephone: "", adresse: "", notes: "",
                    actif: true, creeLe: Timestamp.now(),
                }).catch((err) => setMsg("Client refusé : " + err.code));
            }
        }

        const total = Math.round(q * p);
        const [y, m, j] = date.split("-").map(Number);
        const ref = doc(collection(db, "bandes", bande.id, "sorties"));
        setDoc(ref, {
            date: Timestamp.fromDate(new Date(y, m - 1, j, 12)),
            type,
            clientId,
            clientNom: nomNet,
            quantite: q,
            prixUnitaire: p,
            montantTotal: total,
            montantVerse: v,
            resteAPayer: total - v,
            note: note.trim(),
            creePar: user.uid,
            creeLe: Timestamp.now(),
            syncLe: serverTimestamp(),
            source: "mobile",
            annule: false,
        }).catch((err) => setMsg("Refusé : " + err.code));

        setType("vente"); setClientNom(""); setQuantite("");
        setPrix(""); setVerse(""); setNote(""); setMsg("");
    }

    function annuler(s) {
        updateDoc(doc(db, "bandes", s.bandeId, "sorties", s.id), {
            annule: true,
        }).catch((err) => setMsg("Refusé : " + err.code));
    }

    return (
        <div>
            <p>
                Poulets restants : <b>{restants}</b>
                {enAttente > 0 && ` · ${enAttente} en attente d'envoi`}
            </p>

            {peutEcrire ? (
                <form onSubmit={enregistrer}>
                    <label>Date<br />
                        <input type="date" value={date}
                            onChange={(e) => setDate(e.target.value)} />
                    </label><br /><br />

                    <label>Type de sortie<br />
                        <select value={type} onChange={(e) => setType(e.target.value)}>
                            {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                    </label><br /><br />

                    <label>Client (choisir ou taper un nouveau nom)<br />
                        <input list="clients" value={clientNom}
                            onChange={(e) => setClientNom(e.target.value)}
                            placeholder="Ex. Ulrich" />
                    </label>
                    <datalist id="clients">
                        {clients.map((c) => (
                            <option key={c.id} value={c.nom}
                                label={"Dette : " + fcfa(detteDe(c.id))} />
                        ))}
                    </datalist>
                    <div style={{ fontSize: 13, opacity: 0.8 }}>
                        {nomNet && (clientTrouve
                            ? `Client existant · dette actuelle ${fcfa(detteActuelle)}`
                            : "Nouveau client : il sera créé à l'enregistrement")}
                    </div>
                    <br />

                    <label>Nombre de poulets<br />
                        <input type="number" inputMode="numeric" step="1" value={quantite}
                            onChange={(e) => setQuantite(e.target.value)} />
                    </label>
                    {type === "vente" && q > restants && (
                        <div style={{ color: "crimson", fontSize: 13 }}>
                            Attention : plus que les {restants} poulets restants.
                        </div>
                    )}
                    <br /><br />

                    {avecPrix && (
                        <>
                            <label>Prix unitaire (F)<br />
                                <input type="number" inputMode="numeric" min="0" step="1"
                                    value={prix} onChange={(e) => setPrix(e.target.value)} />
                            </label><br /><br />
                            <label>Montant versé aujourd'hui (F)<br />
                                <input type="number" inputMode="numeric" min="0" step="1"
                                    value={verse} onChange={(e) => setVerse(e.target.value)} />
                            </label>{" "}
                            <button type="button" onClick={() => setVerse(String(totalVente))}>
                                Tout payé
                            </button>
                            <br /><br />
                            <p>
                                Total : <b>{fcfa(totalVente)}</b><br />
                                Reste à payer : <b>{fcfa(reste)}</b><br />
                                Dette du client après : <b>{fcfa(detteApres)}</b><br />
                                Statut : <b>{statut}</b>
                            </p>
                        </>
                    )}

                    <label>Note (facultatif)<br />
                        <input value={note} onChange={(e) => setNote(e.target.value)} />
                    </label><br /><br />
                    <button type="submit">Enregistrer</button>
                </form>
            ) : (
                <p>Saisie impossible : bande clôturée ou rôle en lecture.</p>
            )}
            {msg && <p style={{ color: "crimson" }}>{msg}</p>}

            <h3>Dernières sorties</h3>
            <ul>
                {valides.slice(0, 10).map((s) => (
                    <li key={s.id}>
                        {s.date?.toDate ? s.date.toDate().toLocaleDateString("fr-FR") : "?"}{" "}
                        : {libelleType(s.type)}
                        {s.clientNom && ` – ${s.clientNom}`} – {s.quantite}
                        {AVEC_PRIX.includes(s.type) && (
                            <> × {fcfa(s.prixUnitaire)} = <b>{fcfa(s.montantTotal)}</b>
                                {" "}(versé {fcfa(s.montantVerse)}, reste {fcfa(s.resteAPayer)})</>
                        )}
                        {s.enAttente && " ⏳"}{" "}
                        {peutEcrire && (
                            <button type="button" onClick={() => annuler(s)}>Annuler</button>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}