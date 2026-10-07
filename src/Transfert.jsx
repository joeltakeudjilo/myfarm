import { useEffect, useState } from "react";
import {
    collection, doc, onSnapshot, updateDoc, Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { num, statutDe, jourDepuis, joursEntre, dateFr } from "./utils";

export default function Transfert({ profil, bande }) {
    const st = statutDe(bande);
    const aujourdhui = new Date().toLocaleDateString("sv-SE");
    const [morts, setMorts] = useState([]);
    const [sorties, setSorties] = useState([]);
    const [date, setDate] = useState(aujourdhui);
    const [parti, setParti] = useState("");
    const [recu, setRecu] = useState("");
    const [prevu, setPrevu] = useState(String(num(bande.jourTransfertPrevu) || 15));
    const [msg, setMsg] = useState("");
    const [info, setInfo] = useState("");

    useEffect(() => {
        const b = ["bandes", bande.id];
        const u1 = onSnapshot(collection(db, ...b, "mortalites"), (s) =>
            setMorts(s.docs.map((d) => d.data())));
        const u2 = onSnapshot(collection(db, ...b, "sorties"), (s) =>
            setSorties(s.docs.map((d) => d.data())));
        return () => { u1(); u2(); };
    }, [bande.id]);

    const M = morts.filter((m) => !m.annule).reduce((s, m) => s + num(m.nombre), 0);
    const sortis = sorties.filter((s) => !s.annule && s.type !== "mort_vendu")
        .reduce((s, x) => s + num(x.quantite), 0);
    const estimation = num(bande.poussinsVivantsEntres) - M - sortis;
    const peutEcrire = profil && ["admin", "saisie"].includes(profil.role);

    if (st !== "site1") {
        const ecart = num(bande.effectifTransfere) - num(bande.effectifRecuSite2);
        return (
            <div>
                <h3>Transfert</h3>
                {bande.dateTransfert ? (
                    <p>
                        Transférée le <b>{dateFr(bande.dateTransfert)}</b> (jour{" "}
                        <b>{joursEntre(bande.dateArrivee, bande.dateTransfert)}</b>)<br />
                        Effectif parti : <b>{bande.effectifTransfere}</b> · reçu :{" "}
                        <b>{bande.effectifRecuSite2}</b> · écart : <b>{ecart}</b>
                    </p>
                ) : (
                    <p>Date de transfert non enregistrée (ancienne bande).</p>
                )}
                {info && <p style={{ color: "crimson" }}>{info}</p>}
            </div>
        );
    }

    function majPrevu() {
        const n = Number(prevu);
        if (!Number.isInteger(n) || n < 1 || n > 60)
            return setMsg("Jour prévu : entier entre 1 et 60.");
        updateDoc(doc(db, "bandes", bande.id), { jourTransfertPrevu: n })
            .catch((err) => setMsg("Refusé : " + err.code));
        setMsg("");
    }

    function transferer(e) {
        e.preventDefault();
        const p = Number(parti);
        const r = Number(recu);
        if (!Number.isInteger(p) || p < 1) return setMsg("Effectif parti : entier ≥ 1.");
        if (!Number.isInteger(r) || r < 0) return setMsg("Effectif reçu : entier ≥ 0.");
        if (r > p) return setMsg("L'effectif reçu ne peut pas dépasser l'effectif parti.");
        if (date > aujourdhui) return setMsg("La date de transfert ne peut pas être dans le futur.");
        const [y, m, j] = date.split("-").map(Number);
        const ts = Timestamp.fromDate(new Date(y, m - 1, j, 12));
        if (joursEntre(bande.dateArrivee, ts) < 0)
            return setMsg("Le transfert ne peut pas précéder l'installation.");
        const jour = joursEntre(bande.dateArrivee, ts);
        if (!window.confirm(
            `Transférer ${bande.libelle || "la bande"} vers le site 2 au jour ${jour} ` +
            `(${p} partis, ${r} reçus) ?`)) return;

        updateDoc(doc(db, "bandes", bande.id), {
            statut: "site2",
            dateTransfert: ts,
            effectifTransfere: p,
            effectifRecuSite2: r,
        }).catch((err) => setMsg("Refusé : " + err.code));
        if (p - r > 0)
            setInfo(
                `Écart de transfert : ${p - r} poulet(s). S'ils sont morts, saisissez-les ` +
                `dans Mortalité à la date du transfert.`);
        setMsg("");
    }

    const jour = jourDepuis(bande.dateArrivee);
    return (
        <div>
            <h3>Transfert vers le site 2</h3>
            <p>Jour actuel : <b>{jour}</b></p>

            {peutEcrire && (
                <>
                    <label>Jour de transfert prévu<br />
                        <input type="number" inputMode="numeric" value={prevu}
                            onChange={(e) => setPrevu(e.target.value)} />
                    </label>{" "}
                    <button type="button" onClick={majPrevu}>Enregistrer</button>
                    <hr />
                    <form onSubmit={transferer}>
                        <label>Date réelle du transfert<br />
                            <input type="date" value={date} max={aujourdhui}
                                onChange={(e) => setDate(e.target.value)} />
                        </label><br /><br />
                        <label>Effectif parti du site 1<br />
                            <input type="number" inputMode="numeric" value={parti}
                                onChange={(e) => setParti(e.target.value)} />
                        </label>{" "}
                        <button type="button" onClick={() => setParti(String(estimation))}>
                            Utiliser l'estimation ({estimation})
                        </button>
                        <br /><br />
                        <label>Effectif reçu au site 2<br />
                            <input type="number" inputMode="numeric" value={recu}
                                onChange={(e) => setRecu(e.target.value)} />
                        </label><br /><br />
                        <button type="submit">Transférer vers le site 2</button>
                    </form>
                </>
            )}
            {msg && <p style={{ color: "crimson" }}>{msg}</p>}
        </div>
    );
}