// import { useEffect, useState } from "react";
// import {
//     collection, doc, setDoc, updateDoc, onSnapshot, query, orderBy,
//     Timestamp, serverTimestamp,
// } from "firebase/firestore";
// import { db } from "./firebase";

// const fcfa = (n) => Math.round(Number(n) || 0).toLocaleString("fr-FR") + " F";

// export default function Depense({ user, profil, bande }) {
//     const [catalogue, setCatalogue] = useState([]);
//     const [lignes, setLignes] = useState([]);
//     const [date, setDate] = useState(new Date().toLocaleDateString("sv-SE"));
//     const [designation, setDesignation] = useState("");
//     const [quantite, setQuantite] = useState("");
//     const [unite, setUnite] = useState("");
//     const [prix, setPrix] = useState("");
//     const [declaree, setDeclaree] = useState("");
//     const [note, setNote] = useState("");
//     const [msg, setMsg] = useState("");

//     // Catalogue : rubriques actives avec un nom valide, triées par nom
//     useEffect(() => {
//         return onSnapshot(collection(db, "catalogue"), (snap) => {
//             const l = snap.docs
//                 .map((d) => ({ id: d.id, ...d.data() }))
//                 .filter(
//                     (r) => typeof r.nom === "string" && r.nom.trim() && r.actif !== false
//                 )
//                 .sort((a, b) => a.nom.localeCompare(b.nom));
//             setCatalogue(l);
//         });
//     }, []);

//     // Dépenses de la bande
//     useEffect(() => {
//         const q = query(
//             collection(db, "bandes", bande.id, "depenses"),
//             orderBy("creeLe", "desc")
//         );
//         return onSnapshot(q, { includeMetadataChanges: true }, (snap) =>
//             setLignes(
//                 snap.docs.map((d) => ({
//                     id: d.id,
//                     ...d.data(),
//                     enAttente: d.metadata.hasPendingWrites,
//                 }))
//             )
//         );
//     }, [bande.id]);

//     const trouve = catalogue.find(
//         (r) => r.nom.trim().toLowerCase() === designation.trim().toLowerCase()
//     );
//     const total = Math.round((Number(quantite) || 0) * (Number(prix) || 0));
//     const valides = lignes.filter((l) => !l.annule);
//     const coutTotal = valides.reduce((s, l) => s + (Number(l.total) || 0), 0);
//     const enAttente = lignes.filter((l) => l.enAttente).length;
//     const peutEcrire =
//         // profil && ["admin", "saisie"].includes(profil.role)
//         profil && ["admin", "saisie"].includes(profil.role) && bande.statut !== "cloturee";

//     function changerDesignation(v) {
//         setDesignation(v);
//         const r = catalogue.find(
//             (x) => x.nom.trim().toLowerCase() === v.trim().toLowerCase()
//         );
//         if (r) {
//             setUnite(String(r.unite ?? ""));
//             setPrix(String(r.prixParDefaut ?? ""));
//         }
//     }

//     function enregistrer(e) {
//         e.preventDefault();
//         const q = Number(quantite);
//         const p = Number(prix);
//         if (!designation.trim()) return setMsg("Choisissez ou tapez une rubrique.");
//         if (!(q > 0)) return setMsg("La quantité doit être supérieure à 0.");
//         if (!Number.isInteger(p) || p < 0)
//             return setMsg("Le prix unitaire doit être un nombre entier.");
//         if (!unite.trim()) return setMsg("Indiquez l'unité (sac, bouteille…).");

//         const [y, m, j] = date.split("-").map(Number);
//         const ref = doc(collection(db, "bandes", bande.id, "depenses"));
//         setDoc(ref, {
//             date: Timestamp.fromDate(new Date(y, m - 1, j, 12)),
//             rubriqueId: trouve ? trouve.id : "",
//             designation: designation.trim(),
//             famille: trouve ? trouve.famille : "variable",
//             nature: "reelle",
//             quantite: q,
//             quantiteDeclaree: declaree === "" ? null : Number(declaree),
//             unite: unite.trim(),
//             prixUnitaire: p,
//             total: Math.round(q * p),
//             fournisseur: "",
//             note: note.trim(),
//             creePar: user.uid,
//             creeLe: Timestamp.now(),
//             syncLe: serverTimestamp(),
//             source: "mobile",
//             annule: false,
//         }).catch((err) => setMsg("Refusé : " + err.code));

//         setDesignation(""); setQuantite(""); setUnite("");
//         setPrix(""); setDeclaree(""); setNote(""); setMsg("");
//     }

//     function annuler(l) {
//         updateDoc(doc(db, "bandes", bande.id, "depenses", l.id), {
//             annule: true,
//         }).catch((err) => setMsg("Refusé : " + err.code));
//     }

//     return (
//         <div>
//             <p>
//                 Coût saisi : <b>{fcfa(coutTotal)}</b>
//                 {enAttente > 0 && ` · ${enAttente} en attente d'envoi`}
//             </p>

//             {peutEcrire ? (
//                 <form onSubmit={enregistrer}>
//                     <label>Date<br />
//                         <input type="date" value={date}
//                             onChange={(e) => setDate(e.target.value)} />
//                     </label><br /><br />

//                     <label>Rubrique (choisir ou taper)<br />
//                         <input list="rubriques" value={designation}
//                             onChange={(e) => changerDesignation(e.target.value)}
//                             placeholder="Ex. Gaz et charbon" />
//                     </label>
//                     <datalist id="rubriques">
//                         {catalogue.map((r) => <option key={r.id} value={r.nom} />)}
//                     </datalist>
//                     <div style={{ fontSize: 13, opacity: 0.8 }}>
//                         {designation.trim() &&
//                             (trouve ? "Rubrique du catalogue" : "Libellé libre (rangé dans « Autres »)")}
//                     </div>
//                     <br />

//                     <label>Quantité<br />
//                         <input type="number" inputMode="decimal" step="any" min="0"
//                             value={quantite} onChange={(e) => setQuantite(e.target.value)} />
//                     </label><br /><br />
//                     <label>Unité<br />
//                         <input value={unite} onChange={(e) => setUnite(e.target.value)}
//                             placeholder="sac, bouteille, voyage…" />
//                     </label><br /><br />
//                     <label>Prix unitaire (F)<br />
//                         <input type="number" inputMode="numeric" min="0" step="1"
//                             value={prix} onChange={(e) => setPrix(e.target.value)} />
//                     </label><br /><br />

//                     <p>Total : <b>{fcfa(total)}</b></p>

//                     <label>Quantité annoncée par l'autre fichier (facultatif)<br />
//                         <input type="number" inputMode="decimal" step="any" min="0"
//                             value={declaree} onChange={(e) => setDeclaree(e.target.value)} />
//                     </label><br /><br />
//                     <label>Note (facultatif)<br />
//                         <input value={note} onChange={(e) => setNote(e.target.value)} />
//                     </label><br /><br />
//                     <button type="submit">Enregistrer</button>
//                 </form>
//             ) : (
//                 <p>Saisie impossible : bande clôturée ou rôle en lecture.</p>
//             )}
//             {msg && <p style={{ color: "crimson" }}>{msg}</p>}

//             <h3>Dernières dépenses</h3>
//             <ul>
//                 {valides.slice(0, 10).map((l) => (
//                     <li key={l.id}>
//                         {l.date?.toDate ? l.date.toDate().toLocaleDateString("fr-FR") : "?"}{" "}
//                         : {l.designation} – {l.quantite} {l.unite} × {fcfa(l.prixUnitaire)} ={" "}
//                         <b>{fcfa(l.total)}</b>
//                         {l.enAttente && " ⏳"}{" "}
//                         {peutEcrire && (
//                             <button type="button" onClick={() => annuler(l)}>Annuler</button>
//                         )}
//                     </li>
//                 ))}
//             </ul>
//         </div>
//     );
// }

import { useEffect, useState } from "react";
import {
    collection, doc, onSnapshot, query, orderBy, writeBatch,
    Timestamp, serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";

const fcfa = (n) => Math.round(Number(n) || 0).toLocaleString("fr-FR") + " F";
const jourISO = (ts) =>
    ts?.toDate ? ts.toDate().toLocaleDateString("sv-SE") : new Date().toLocaleDateString("sv-SE");

export default function Depense({ user, profil, bande }) {
    const [catalogue, setCatalogue] = useState([]);
    const [lignes, setLignes] = useState([]);
    const [edition, setEdition] = useState(null); // ligne en cours de modification
    const [date, setDate] = useState(new Date().toLocaleDateString("sv-SE"));
    const [designation, setDesignation] = useState("");
    const [quantite, setQuantite] = useState("");
    const [unite, setUnite] = useState("");
    const [prix, setPrix] = useState("");
    const [declaree, setDeclaree] = useState("");
    const [note, setNote] = useState("");
    const [msg, setMsg] = useState("");

    useEffect(() => {
        return onSnapshot(collection(db, "catalogue"), (snap) => {
            const l = snap.docs
                .map((d) => ({ id: d.id, ...d.data() }))
                .filter((r) => typeof r.nom === "string" && r.nom.trim() && r.actif !== false)
                .sort((a, b) => a.nom.localeCompare(b.nom));
            setCatalogue(l);
        });
    }, []);

    useEffect(() => {
        const q = query(
            collection(db, "bandes", bande.id, "depenses"),
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

    const trouve = catalogue.find(
        (r) => r.nom.trim().toLowerCase() === designation.trim().toLowerCase()
    );
    const total = Math.round((Number(quantite) || 0) * (Number(prix) || 0));
    const valides = lignes.filter((l) => !l.annule);
    const coutTotal = valides.reduce((s, l) => s + (Number(l.total) || 0), 0);
    const enAttente = lignes.filter((l) => l.enAttente).length;
    const peutEcrire =
        profil && ["admin", "saisie"].includes(profil.role) && bande.statut !== "cloturee";

    function vider() {
        setEdition(null);
        setDesignation(""); setQuantite(""); setUnite("");
        setPrix(""); setDeclaree(""); setNote(""); setMsg("");
        setDate(new Date().toLocaleDateString("sv-SE"));
    }

    function changerDesignation(v) {
        setDesignation(v);
        const r = catalogue.find((x) => x.nom.trim().toLowerCase() === v.trim().toLowerCase());
        if (r) {
            setUnite(String(r.unite ?? ""));
            setPrix(String(r.prixParDefaut ?? ""));
        }
    }

    function commencerEdition(l) {
        setEdition(l);
        setDate(jourISO(l.date));
        setDesignation(l.designation || "");
        setQuantite(String(l.quantite ?? ""));
        setUnite(String(l.unite ?? ""));
        setPrix(String(l.prixUnitaire ?? ""));
        setDeclaree(l.quantiteDeclaree == null ? "" : String(l.quantiteDeclaree));
        setNote(l.note || "");
        setMsg("");
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function enregistrer(e) {
        e.preventDefault();
        const q = Number(quantite);
        const p = Number(prix);
        if (!designation.trim()) return setMsg("Choisissez ou tapez une rubrique.");
        if (!(q > 0)) return setMsg("La quantité doit être supérieure à 0.");
        if (!Number.isInteger(p) || p < 0)
            return setMsg("Le prix unitaire doit être un nombre entier.");
        if (!unite.trim()) return setMsg("Indiquez l'unité (sac, bouteille…).");

        const [y, m, j] = date.split("-").map(Number);
        const batch = writeBatch(db);
        const ref = doc(collection(db, "bandes", bande.id, "depenses"));

        batch.set(ref, {
            date: Timestamp.fromDate(new Date(y, m - 1, j, 12)),
            rubriqueId: trouve ? trouve.id : edition?.rubriqueId || "",
            designation: designation.trim(),
            // en modification, la famille et la nature d'origine sont conservées
            famille: edition ? edition.famille : trouve ? trouve.famille : "variable",
            nature: edition ? edition.nature : "reelle",
            quantite: q,
            quantiteDeclaree: declaree === "" ? null : Number(declaree),
            unite: unite.trim(),
            prixUnitaire: p,
            total: Math.round(q * p),
            fournisseur: edition?.fournisseur || "",
            note: note.trim(),
            creePar: user.uid,
            creeLe: Timestamp.now(),
            syncLe: serverTimestamp(),
            source: "mobile",
            annule: false,
            ...(edition ? { remplaceId: edition.id } : {}),
        });
        if (edition) {
            batch.update(doc(db, "bandes", bande.id, "depenses", edition.id), {
                annule: true,
            });
        }
        batch.commit().catch((err) => setMsg("Refusé : " + err.code));
        vider();
    }

    function annuler(l) {
        if (!window.confirm(`Annuler la dépense « ${l.designation} » ?`)) return;
        const batch = writeBatch(db);
        batch.update(doc(db, "bandes", bande.id, "depenses", l.id), { annule: true });
        batch.commit().catch((err) => setMsg("Refusé : " + err.code));
    }

    return (
        <div>
            <p>
                Coût saisi : <b>{fcfa(coutTotal)}</b>
                {enAttente > 0 && ` · ${enAttente} en attente d'envoi`}
            </p>

            {peutEcrire ? (
                <form onSubmit={enregistrer}>
                    {edition && (
                        <div className="carte" style={{ borderColor: "var(--yolk)" }}>
                            ✏️ Modification de <b>{edition.designation}</b> (
                            {fcfa(edition.total)}). L'ancienne valeur sera conservée dans le journal.
                        </div>
                    )}
                    <label>Date
                        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                    </label>

                    <label>Rubrique (choisir ou taper)
                        <input list="rubriques" value={designation}
                            onChange={(e) => changerDesignation(e.target.value)}
                            placeholder="Ex. Gaz et charbon" />
                    </label>
                    <datalist id="rubriques">
                        {catalogue.map((r) => <option key={r.id} value={r.nom} />)}
                    </datalist>
                    <div style={{ fontSize: 13, opacity: 0.8 }}>
                        {designation.trim() && !edition &&
                            (trouve ? "Rubrique du catalogue" : "Libellé libre (rangé dans « Autres »)")}
                    </div>

                    <label>Quantité
                        <input type="number" inputMode="decimal" step="any" min="0"
                            value={quantite} onChange={(e) => setQuantite(e.target.value)} />
                    </label>
                    <label>Unité
                        <input value={unite} onChange={(e) => setUnite(e.target.value)}
                            placeholder="sac, bouteille, voyage…" />
                    </label>
                    <label>Prix unitaire (F)
                        <input type="number" inputMode="numeric" min="0" step="1"
                            value={prix} onChange={(e) => setPrix(e.target.value)} />
                    </label>

                    <p>Total : <b>{fcfa(total)}</b></p>

                    <label>Quantité annoncée par l'autre fichier (facultatif)
                        <input type="number" inputMode="decimal" step="any" min="0"
                            value={declaree} onChange={(e) => setDeclaree(e.target.value)} />
                    </label>
                    <label>Note (facultatif)
                        <input value={note} onChange={(e) => setNote(e.target.value)} />
                    </label>
                    <button type="submit">{edition ? "Enregistrer la modification" : "Enregistrer"}</button>
                    {edition && (
                        <button type="button" onClick={vider}>Annuler la modification</button>
                    )}
                </form>
            ) : (
                <p>Saisie impossible : bande clôturée ou rôle en lecture.</p>
            )}
            {msg && <p style={{ color: "crimson" }}>{msg}</p>}

            <h3>Dépenses de la bande</h3>
            <ul>
                {valides.map((l) => (
                    <li key={l.id}>
                        {l.date?.toDate ? l.date.toDate().toLocaleDateString("fr-FR") : "?"}
                        {" : "}{l.designation} – {l.quantite} {l.unite} × {fcfa(l.prixUnitaire)} ={" "}
                        <b>{fcfa(l.total)}</b>
                        {l.nature === "imputee" && " · fixe"}
                        {l.remplaceId && " · modifiée"}
                        {l.enAttente && " ⏳"}
                        <div>
                            {peutEcrire && (
                                <>
                                    <button type="button" onClick={() => commencerEdition(l)}>Modifier</button>
                                    <button type="button" onClick={() => annuler(l)}>Annuler</button>
                                </>
                            )}
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}