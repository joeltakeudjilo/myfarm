import { useEffect, useState } from "react";
import {
    collection, collectionGroup, doc, setDoc, updateDoc, onSnapshot,
    Timestamp, serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";

const fcfa = (n) => Math.round(Number(n) || 0).toLocaleString("fr-FR") + " F";
const dec = (n) =>
    (Number(n) || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cleJour = (ts) => (ts?.toDate ? ts.toDate().toLocaleDateString("sv-SE") : "");

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
    const aujourdhui = new Date().toLocaleDateString("sv-SE");
    const [clients, setClients] = useState([]);
    const [toutes, setToutes] = useState([]); // toutes les sorties, toutes bandes
    const [rembs, setRembs] = useState([]);
    const [morts, setMorts] = useState([]);
    const [deps, setDeps] = useState([]);

    const [date, setDate] = useState(aujourdhui);
    const [type, setType] = useState("vente");
    const [clientNom, setClientNom] = useState("");
    const [quantite, setQuantite] = useState("");
    const [prix, setPrix] = useState("");
    const [prixTouche, setPrixTouche] = useState(false);
    const [verse, setVerse] = useState("");
    const [note, setNote] = useState("");
    const [msg, setMsg] = useState("");

    // Filtres de l'historique
    const [fClient, setFClient] = useState("");
    const [fDu, setFDu] = useState("");
    const [fAu, setFAu] = useState("");
    const [tout, setTout] = useState(false);

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

    useEffect(() => {
        return onSnapshot(collection(db, "bandes", bande.id, "depenses"), (snap) =>
            setDeps(snap.docs.map((d) => d.data()))
        );
    }, [bande.id]);

    const sortiesBande = toutes.filter((s) => s.bandeId === bande.id);
    const valides = sortiesBande.filter((s) => !s.annule);
    const totalMorts = morts
        .filter((m) => !m.annule)
        .reduce((s, m) => s + (Number(m.nombre) || 0), 0);
    const sortis = valides
        .filter((s) => s.type !== "mort_vendu")
        .reduce((s, x) => s + (Number(x.quantite) || 0), 0);
    const restants = bande.poussinsVivantsEntres - totalMorts - sortis;
    const mortsVendus = valides
        .filter((s) => s.type === "mort_vendu")
        .reduce((s, x) => s + (Number(x.quantite) || 0), 0);
    const mortsDispo = totalMorts - mortsVendus;

    // Prix de revient provisoire de la bande (coût total ÷ survivants)
    const coutTotal = deps
        .filter((d) => !d.annule)
        .reduce((s, d) => s + (Number(d.total) || 0), 0);
    const base = (Number(bande.poussinsVivantsEntres) || 0) - totalMorts;
    const pr = base > 0 ? coutTotal / base : 0;

    // Le prix est prérempli avec le prix de revient (arrondi), sauf pour les morts vendus
    const defautPrix = (t) =>
        (t === "vente" || t === "reserve") && pr > 0 ? String(Math.round(pr)) : "";
    useEffect(() => {
        if (prixTouche) return;
        setPrix(defautPrix(type));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [type, pr, prixTouche]);

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
    const pNum = Number(prix) || 0;
    const totalVente = avecPrix ? Math.round(q * pNum) : 0;
    const verseN = avecPrix ? Number(verse) || 0 : 0;
    const reste = totalVente - verseN;
    const detteActuelle = detteDe(clientTrouve?.id);
    const detteApres = detteActuelle + reste;
    const statut = !avecPrix || totalVente === 0 ? "-"
        : reste === 0 ? "Payé" : verseN > 0 ? "Avance" : "Non payé";
    const margeSaisie =
        (type === "vente" || type === "reserve") && q > 0 && pr > 0
            ? (pNum - pr) * q : null;
    const enAttente = sortiesBande.filter((s) => s.enAttente).length;
    const peutEcrire =
        profil && ["admin", "saisie"].includes(profil.role) && bande.statut !== "cloturee";

    // Historique filtré
    const cleClient = (s) => s.clientId || s.clientNom || "";
    const clientsHisto = [];
    const vus = new Set();
    valides.forEach((s) => {
        const k = cleClient(s);
        if (k && !vus.has(k)) {
            vus.add(k);
            clientsHisto.push({
                k,
                nom: s.clientNom || clients.find((c) => c.id === s.clientId)?.nom || "?",
            });
        }
    });
    clientsHisto.sort((a, b) => a.nom.localeCompare(b.nom));

    const filtreActif = !!(fClient || fDu || fAu);
    const filtrees = valides
        .filter(
            (s) =>
                (!fClient || cleClient(s) === fClient) &&
                (!fDu || cleJour(s.date) >= fDu) &&
                (!fAu || cleJour(s.date) <= fAu)
        )
        .sort(
            (a, b) =>
                (b.date?.toMillis?.() || 0) - (a.date?.toMillis?.() || 0) ||
                (b.creeLe?.toMillis?.() || 0) - (a.creeLe?.toMillis?.() || 0)
        );
    const affichees = filtreActif || tout ? filtrees : filtrees.slice(0, 10);
    const avecPrixF = filtrees.filter((s) => AVEC_PRIX.includes(s.type));
    const tot = {
        n: filtrees.length,
        poulets: filtrees.reduce((s, x) => s + (Number(x.quantite) || 0), 0),
        montant: avecPrixF.reduce((s, x) => s + (Number(x.montantTotal) || 0), 0),
        verse: avecPrixF.reduce((s, x) => s + (Number(x.montantVerse) || 0), 0),
        reste: avecPrixF.reduce((s, x) => s + (Number(x.resteAPayer) || 0), 0),
    };
    const auteur = (s) =>
        s.creeParNom || (s.creePar === user.uid ? profil?.nom : "") || "autre utilisateur";

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
        if (type === "mort_vendu" && q > mortsDispo)
            return setMsg(
                `Seulement ${mortsDispo} mort(s) disponible(s) à la vente ` +
                `(morts saisis : ${totalMorts}, déjà vendus : ${mortsVendus}). ` +
                `Saisissez d'abord la mortalité.`);
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
            creeParNom: profil?.nom || "",
            creeLe: Timestamp.now(),
            syncLe: serverTimestamp(),
            source: "mobile",
            annule: false,
        }).catch((err) => setMsg("Refusé : " + err.code));

        setType("vente"); setClientNom(""); setQuantite("");
        setPrixTouche(false); setPrix(defautPrix("vente"));
        setVerse(""); setNote(""); setMsg("");
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
                    <label>Date
                        <input type="date" value={date}
                            onChange={(e) => setDate(e.target.value)} />
                    </label>

                    <label>Type de sortie
                        <select value={type} onChange={(e) => setType(e.target.value)}>
                            {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                    </label>

                    <label>Client (choisir ou taper un nouveau nom)
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

                    <label>Nombre de poulets
                        <input type="number" inputMode="numeric" step="1" value={quantite}
                            onChange={(e) => setQuantite(e.target.value)} />
                    </label>
                    {type === "vente" && q > restants && (
                        <div style={{ color: "crimson", fontSize: 13 }}>
                            Attention : plus que les {restants} poulets restants.
                        </div>
                    )}
                    {type === "mort_vendu" && (
                        <div style={{ fontSize: 13 }}>
                            Morts disponibles à la vente : <b>{mortsDispo}</b> (saisis dans
                            Mortalité, pas encore vendus)
                        </div>
                    )}

                    {avecPrix && (
                        <>
                            <label>Prix unitaire (F)
                                <input type="number" inputMode="numeric" min="0" step="1"
                                    value={prix}
                                    onChange={(e) => { setPrix(e.target.value); setPrixTouche(true); }} />
                            </label>
                            {pr > 0 && (
                                <div style={{ fontSize: 13, opacity: 0.85 }}>
                                    Prix de revient provisoire : <b>{dec(pr)} F</b>{" "}
                                    {(type === "vente" || type === "reserve") && (
                                        <button type="button" className="petit"
                                            onClick={() => { setPrixTouche(false); setPrix(defautPrix(type)); }}>
                                            Utiliser ce prix
                                        </button>
                                    )}
                                </div>
                            )}
                            {margeSaisie != null && (
                                <div style={{
                                    fontSize: 13, fontWeight: 600,
                                    color: margeSaisie < 0 ? "crimson" : undefined,
                                }}>
                                    {margeSaisie < 0 ? "⚠ Sous le prix de revient : " : "Marge sur cette sortie : "}
                                    {fcfa(margeSaisie)}
                                </div>
                            )}
                            <label>Montant versé aujourd'hui (F)
                                <input type="number" inputMode="numeric" min="0" step="1"
                                    value={verse} onChange={(e) => setVerse(e.target.value)} />
                            </label>
                            <p>
                                <button type="button" className="petit"
                                    onClick={() => setVerse(String(totalVente))}>
                                    Tout payé
                                </button>
                            </p>
                            <p>
                                Total : <b>{fcfa(totalVente)}</b><br />
                                Reste à payer : <b>{fcfa(reste)}</b><br />
                                Dette du client après : <b>{fcfa(detteApres)}</b><br />
                                Statut : <b>{statut}</b>
                            </p>
                        </>
                    )}

                    <label>Note (facultatif)
                        <input value={note} onChange={(e) => setNote(e.target.value)} />
                    </label>
                    <button type="submit">Enregistrer</button>
                </form>
            ) : (
                <p>Saisie impossible : bande clôturée ou rôle en lecture.</p>
            )}
            {msg && <p style={{ color: "crimson" }}>{msg}</p>}

            <h3>Historique des sorties</h3>
            <div style={{ border: "1px solid #8886", borderRadius: 12, padding: 12, marginBottom: 12 }}>
                <label style={{ marginTop: 0 }}>Client
                    <select value={fClient} onChange={(e) => setFClient(e.target.value)}>
                        <option value="">Tous les clients</option>
                        {clientsHisto.map((c) => (
                            <option key={c.k} value={c.k}>{c.nom}</option>
                        ))}
                    </select>
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <label>Du
                        <input type="date" value={fDu} max={fAu || undefined}
                            onChange={(e) => setFDu(e.target.value)} />
                    </label>
                    <label>Au
                        <input type="date" value={fAu} min={fDu || undefined}
                            onChange={(e) => setFAu(e.target.value)} />
                    </label>
                </div>
                <p style={{ marginBottom: 0 }}>
                    <button type="button" className="petit"
                        onClick={() => { setFDu(aujourdhui); setFAu(aujourdhui); }}>
                        Aujourd'hui
                    </button>{" "}
                    {filtreActif && (
                        <button type="button" className="petit"
                            onClick={() => { setFClient(""); setFDu(""); setFAu(""); }}>
                            Effacer les filtres
                        </button>
                    )}
                </p>
            </div>

            {filtreActif && (
                <p style={{ fontSize: 14 }}>
                    <b>{tot.n}</b> sortie{tot.n > 1 ? "s" : ""} · <b>{tot.poulets}</b> poulets ·
                    total <b>{fcfa(tot.montant)}</b> · versé <b>{fcfa(tot.verse)}</b> ·
                    reste <b>{fcfa(tot.reste)}</b>
                </p>
            )}
            {filtrees.length === 0 && <p>Aucune sortie pour ces critères.</p>}
            <ul>
                {affichees.map((s) => (
                    <li key={s.id}>
                        {s.date?.toDate ? s.date.toDate().toLocaleDateString("fr-FR") : "?"}{" "}
                        : {libelleType(s.type)}
                        {s.clientNom && ` – ${s.clientNom}`} – {s.quantite}
                        {AVEC_PRIX.includes(s.type) && (
                            <> × {fcfa(s.prixUnitaire)} = <b>{fcfa(s.montantTotal)}</b>
                                {" "}(versé {fcfa(s.montantVerse)}, reste {fcfa(s.resteAPayer)})</>
                        )}
                        <br />
                        <span style={{ fontSize: 12, opacity: 0.75 }}>saisi par {auteur(s)}</span>
                        {s.enAttente && " ⏳"}{" "}
                        {peutEcrire && (
                            <button type="button" onClick={() => annuler(s)}>Annuler</button>
                        )}
                    </li>
                ))}
            </ul>
            {!filtreActif && filtrees.length > 10 && (
                <button type="button" className="petit" onClick={() => setTout(!tout)}>
                    {tout ? "Afficher moins" : `Afficher tout (${filtrees.length})`}
                </button>
            )}
        </div>
    );
}