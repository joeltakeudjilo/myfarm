import { Component, useEffect, useState } from "react";
import {
  onAuthStateChanged, signInWithEmailAndPassword, signOut,
} from "firebase/auth";
import { doc, getDoc, collection, onSnapshot } from "firebase/firestore";
import { auth, db } from "./firebase";
import { statutDe, jourDepuis } from "./utils";
import Accueil from "./Accueil";
import NouvelleBande from "./NouvelleBande";
import Mortalite from "./Mortalite";
import Depense from "./Depense";
import Vente from "./Vente";
import Remboursement from "./Remboursement";
import Bilan from "./Bilan";
import Transfert from "./Transfert";
import Cloture from "./Cloture";

class Garde extends Component {
  state = { erreur: null };
  static getDerivedStateFromError(erreur) { return { erreur }; }
  render() {
    if (this.state.erreur)
      return (
        <p style={{ color: "crimson" }}>
          Erreur d'affichage : {String(this.state.erreur.message)}
        </p>
      );
    return this.props.children;
  }
}

const ONGLETS = [
  ["mortalite", "Mortalité"], ["depense", "Dépense"], ["vente", "Vente"],
  ["dettes", "Dettes"], ["bilan", "Bilan"], ["transfert", "Transfert"], ["cloture", "Clôture"],
];

export default function App() {
  const [user, setUser] = useState(undefined);
  const [profil, setProfil] = useState(null);
  const [bandes, setBandes] = useState([]);
  const [vue, setVue] = useState("accueil");
  const [bandeId, setBandeId] = useState(null);
  const [ecran, setEcran] = useState("mortalite");
  const [email, setEmail] = useState("");
  const [mdp, setMdp] = useState("");
  const [erreur, setErreur] = useState("");

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  useEffect(() => {
    if (!user) { setProfil(null); setBandes([]); setVue("accueil"); return; }
    getDoc(doc(db, "utilisateurs", user.uid))
      .then((p) => setProfil(p.exists() ? p.data() : null))
      .catch((e) => setErreur(e.code || e.message));
    return onSnapshot(
      collection(db, "bandes"),
      (s) => { setBandes(s.docs.map((d) => ({ id: d.id, ...d.data() }))); setErreur(""); },
      (e) => setErreur(e.code || e.message)
    );
  }, [user]);

  async function connexion(e) {
    e.preventDefault();
    setErreur("");
    try { await signInWithEmailAndPassword(auth, email, mdp); }
    catch (err) { setErreur(err.code); }
  }

  function ouvrir(id) { setBandeId(id); setEcran("mortalite"); setVue("bande"); }
  function accueil() { setVue("accueil"); setBandeId(null); }

  if (user === undefined) return <p>Chargement…</p>;

  if (!user) {
    return (
      <form onSubmit={connexion} style={{ padding: 20, maxWidth: 360 }}>
        <h1>Suivi de bandes</h1>
        <input placeholder="E-mail" value={email}
          onChange={(e) => setEmail(e.target.value)} /><br /><br />
        <input type="password" placeholder="Mot de passe" value={mdp}
          onChange={(e) => setMdp(e.target.value)} /><br /><br />
        <button type="submit">Se connecter</button>
        {erreur && <p style={{ color: "crimson" }}>{erreur}</p>}
      </form>
    );
  }

  const bande = bandes.find((b) => b.id === bandeId);
  const st = bande ? statutDe(bande) : null;

  return (
    <div style={{ padding: 20, maxWidth: 480 }}>
      <h1>Bonjour {profil ? profil.nom : "(profil introuvable)"}</h1>
      {vue !== "accueil" && (
        <p><button type="button" onClick={accueil}>‹ Accueil</button></p>
      )}

      <Garde key={vue + (bandeId || "") + ecran}>
        {vue === "accueil" && (
          <Accueil profil={profil} bandes={bandes} onOuvrir={ouvrir}
            onNouvelle={() => setVue("nouvelle")} onDettes={() => setVue("dettes")} />
        )}
        {vue === "nouvelle" && (
          <NouvelleBande user={user} profil={profil} bandes={bandes}
            onFini={ouvrir} onRetour={accueil} />
        )}
        {vue === "dettes" && <Remboursement user={user} profil={profil} />}
        {vue === "bande" && !bande && <p>Bande introuvable.</p>}
        {vue === "bande" && bande && (
          <>
            <h2>
              {bande.libelle || `Bande ${bande.numero}`} ·{" "}
              {st === "site1" ? "Site 1" : st === "site2" ? "Site 2" : "Clôturée"}
              {" · jour "}{jourDepuis(bande.dateArrivee) ?? "?"}
            </h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              {ONGLETS.map(([k, l]) => (
                <button key={k} type="button" onClick={() => setEcran(k)}
                  disabled={ecran === k}>{l}</button>
              ))}
            </div>
            {ecran === "mortalite" && <Mortalite user={user} profil={profil} bande={bande} />}
            {ecran === "depense" && <Depense user={user} profil={profil} bande={bande} />}
            {ecran === "vente" && <Vente user={user} profil={profil} bande={bande} />}
            {ecran === "dettes" && <Remboursement user={user} profil={profil} bande={bande} />}
            {ecran === "bilan" && <Bilan user={user} profil={profil} bande={bande} />}
            {ecran === "transfert" && <Transfert profil={profil} bande={bande} />}
            {ecran === "cloture" && <Cloture user={user} profil={profil} bande={bande} />}
          </>
        )}
      </Garde>

      {erreur && <p style={{ color: "crimson" }}>Erreur : {erreur}</p>}
      <br />
      <button onClick={() => signOut(auth)}>Se déconnecter</button>
    </div>
  );
}