import { useEffect, useState } from "react";
import {
    collection, doc, onSnapshot, writeBatch, Timestamp, serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { num, statutDe } from "./utils";

const maintenantLocal = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
};

export default function NouvelleBande({ user, profil, bandes, onFini, onRetour }) {
    const derniere = [...bandes].sort((a, b) => num(b.numero) - num(a.numero))[0];
    const [modele, setModele] = useState([]);
    const [numero, setNumero] = useState(String(num(derniere?.numero) + 1));
    const [souche, setSouche] = useState(derniere?.souche || "");
    const [origine, setOrigine] = useState(derniere?.origine || "");
    const [arrivee, setArrivee] = useState(maintenantLocal());
    const [payes, setPayes] = useState("");
    const [vivants, setVivants] = useState("");
    const [prevu, setPrevu] = useState("15");
    const [note, setNote] = useState("");
    const [msg, setMsg] = useState("");

    useEffect(() => {
        return onSnapshot(collection(db, "modeleChargesFixes"), (s) =>
            setModele(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
    }, []);

    const bloquante = bandes.find((b) => statutDe(b) === "site1");

    if (profil?.role !== "admin")
        return <p>Seul un administrateur peut créer une bande.</p>;

    if (bloquante)
        return (
            <div>
                <p style={{ color: "crimson" }}>
                    La {bloquante.libelle || `bande ${bloquante.numero}`} est encore en
                    site 1. Transférez-la vers le site 2 avant d'en créer une nouvelle.
                </p>
                <button type="button" onClick={onRetour}>Retour</button>
            </div>
        );

    function creer(e) {
        e.preventDefault();
        const n = Number(numero);
        const p = Number(payes);
        const v = Number(vivants);
        const j = Number(prevu);
        if (!Number.isInteger(n) || n < 1) return setMsg("Numéro invalide.");
        if (bandes.some((b) => num(b.numero) === n))
            return setMsg(`Le numéro ${n} existe déjà.`);
        if (!souche.trim() || !origine.trim())
            return setMsg("Indiquez la souche et l'origine.");
        if (!arrivee) return setMsg("Indiquez la date d'arrivée.");
        if (!Number.isInteger(p) || p < 1) return setMsg("Poussins payés : entier ≥ 1.");
        if (!Number.isInteger(v) || v < 1) return setMsg("Poussins vivants entrés : entier ≥ 1.");
        if (!Number.isInteger(j) || j < 1 || j > 60)
            return setMsg("Jour de transfert prévu : entre 1 et 60.");
        if (modele.length === 0 &&
            !window.confirm("Le modèle de charges fixes est vide. Créer la bande quand même ?"))
            return;

        const dateArrivee = Timestamp.fromDate(new Date(arrivee));
        const bref = doc(collection(db, "bandes"));
        const batch = writeBatch(db);
        batch.set(bref, {
            numero: n,
            libelle: `Bande ${n}`,
            souche: souche.trim(),
            origine: origine.trim(),
            dateArrivee,
            poussinsPayes: p,
            poussinsVivantsEntres: v,
            statut: "site1",
            jourTransfertPrevu: j,
            dateTransfert: null,
            effectifTransfere: null,
            effectifRecuSite2: null,
            dateCloture: null,
            prixRevientFinal: null,
            note: note.trim(),
            creePar: user.uid,
            creeLe: Timestamp.now(),
        });
        // Charges fixes : un forfait complet par bande, importé d'un seul coup
        modele.forEach((m) => {
            const q = num(m.quantite);
            const pu = num(m.prixUnitaire);
            batch.set(doc(db, "bandes", bref.id, "depenses", "fixe_" + m.id), {
                date: dateArrivee,
                rubriqueId: "",
                designation: String(m.nom || "Charge fixe"),
                famille: "fixe",
                nature: "imputee",
                quantite: q,
                quantiteDeclaree: null,
                unite: "forfait",
                prixUnitaire: pu,
                total: Math.round(q * pu),
                fournisseur: "",
                note: "Charge fixe imputée",
                creePar: user.uid,
                creeLe: Timestamp.now(),
                syncLe: serverTimestamp(),
                source: "mobile",
                annule: false,
            });
        });
        batch.commit().catch((err) => alert("Création refusée : " + err.code));
        onFini(bref.id);
    }

    const champ = { display: "block", marginBottom: 12 };
    return (
        <form onSubmit={creer}>
            <h2>Nouvelle bande</h2>
            <label style={champ}>Numéro<br />
                <input type="number" value={numero} onChange={(e) => setNumero(e.target.value)} />
            </label>
            <label style={champ}>Souche<br />
                <input value={souche} onChange={(e) => setSouche(e.target.value)} />
            </label>
            <label style={champ}>Origine des poussins<br />
                <input value={origine} onChange={(e) => setOrigine(e.target.value)} />
            </label>
            <label style={champ}>Date et heure d'installation (jour 0)<br />
                <input type="datetime-local" value={arrivee}
                    onChange={(e) => setArrivee(e.target.value)} />
            </label>
            <label style={champ}>Poussins payés<br />
                <input type="number" inputMode="numeric" value={payes}
                    onChange={(e) => setPayes(e.target.value)} />
            </label>
            <label style={champ}>Poussins vivants entrés<br />
                <input type="number" inputMode="numeric" value={vivants}
                    onChange={(e) => setVivants(e.target.value)} />
            </label>
            <label style={champ}>Jour de transfert prévu (modifiable plus tard)<br />
                <input type="number" inputMode="numeric" value={prevu}
                    onChange={(e) => setPrevu(e.target.value)} />
            </label>
            <label style={champ}>Note (facultatif)<br />
                <input value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <p style={{ fontSize: 13, opacity: 0.85 }}>
                {modele.length} charge{modele.length > 1 ? "s" : ""} fixe
                {modele.length > 1 ? "s" : ""} du modèle seront importées
                automatiquement.
            </p>
            {msg && <p style={{ color: "crimson" }}>{msg}</p>}
            <button type="submit">Créer la bande</button>{" "}
            <button type="button" onClick={onRetour}>Annuler</button>
        </form>
    );
}