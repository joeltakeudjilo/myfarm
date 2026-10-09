// import { Component, useEffect, useState } from "react";
// import {
//   onAuthStateChanged, signInWithEmailAndPassword, signOut,
// } from "firebase/auth";
// import { doc, getDoc, collection, onSnapshot } from "firebase/firestore";
// import { auth, db } from "./firebase";
// import { statutDe, jourDepuis } from "./utils";
// import Accueil from "./Accueil";
// import NouvelleBande from "./NouvelleBande";
// import Mortalite from "./Mortalite";
// import Depense from "./Depense";
// import Vente from "./Vente";
// import Remboursement from "./Remboursement";
// import Bilan from "./Bilan";
// import Transfert from "./Transfert";
// import Cloture from "./Cloture";

// class Garde extends Component {
//   state = { erreur: null };
//   static getDerivedStateFromError(erreur) { return { erreur }; }
//   render() {
//     if (this.state.erreur)
//       return (
//         <p style={{ color: "crimson" }}>
//           Erreur d'affichage : {String(this.state.erreur.message)}
//         </p>
//       );
//     return this.props.children;
//   }
// }

// const ONGLETS = [
//   ["mortalite", "Mortalité"], ["depense", "Dépense"], ["vente", "Vente"],
//   ["dettes", "Dettes"], ["bilan", "Bilan"], ["transfert", "Transfert"], ["cloture", "Clôture"],
// ];

// export default function App() {
//   const [user, setUser] = useState(undefined);
//   const [profil, setProfil] = useState(null);
//   const [bandes, setBandes] = useState([]);
//   const [vue, setVue] = useState("accueil");
//   const [bandeId, setBandeId] = useState(null);
//   const [ecran, setEcran] = useState("mortalite");
//   const [email, setEmail] = useState("");
//   const [mdp, setMdp] = useState("");
//   const [erreur, setErreur] = useState("");

//   useEffect(() => onAuthStateChanged(auth, setUser), []);

//   useEffect(() => {
//     if (!user) { setProfil(null); setBandes([]); setVue("accueil"); return; }
//     getDoc(doc(db, "utilisateurs", user.uid))
//       .then((p) => setProfil(p.exists() ? p.data() : null))
//       .catch((e) => setErreur(e.code || e.message));
//     return onSnapshot(
//       collection(db, "bandes"),
//       (s) => { setBandes(s.docs.map((d) => ({ id: d.id, ...d.data() }))); setErreur(""); },
//       (e) => setErreur(e.code || e.message)
//     );
//   }, [user]);

//   async function connexion(e) {
//     e.preventDefault();
//     setErreur("");
//     try { await signInWithEmailAndPassword(auth, email, mdp); }
//     catch (err) { setErreur(err.code); }
//   }

//   function ouvrir(id) { setBandeId(id); setEcran("mortalite"); setVue("bande"); }
//   function accueil() { setVue("accueil"); setBandeId(null); }

//   if (user === undefined) return <p>Chargement…</p>;

//   if (!user) {
//     return (
//       <form onSubmit={connexion} style={{ padding: 20, maxWidth: 360 }}>
//         <h1>Suivi de bandes</h1>
//         <input placeholder="E-mail" value={email}
//           onChange={(e) => setEmail(e.target.value)} /><br /><br />
//         <input type="password" placeholder="Mot de passe" value={mdp}
//           onChange={(e) => setMdp(e.target.value)} /><br /><br />
//         <button type="submit">Se connecter</button>
//         {erreur && <p style={{ color: "crimson" }}>{erreur}</p>}
//       </form>
//     );
//   }

//   const bande = bandes.find((b) => b.id === bandeId);
//   const st = bande ? statutDe(bande) : null;

//   return (
//     <div style={{ padding: 20, maxWidth: 480 }}>
//       <h1>Bonjour {profil ? profil.nom : "(profil introuvable)"}</h1>
//       {vue !== "accueil" && (
//         <p><button type="button" onClick={accueil}>‹ Accueil</button></p>
//       )}

//       <Garde key={vue + (bandeId || "") + ecran}>
//         {vue === "accueil" && (
//           <Accueil profil={profil} bandes={bandes} onOuvrir={ouvrir}
//             onNouvelle={() => setVue("nouvelle")} onDettes={() => setVue("dettes")} />
//         )}
//         {vue === "nouvelle" && (
//           <NouvelleBande user={user} profil={profil} bandes={bandes}
//             onFini={ouvrir} onRetour={accueil} />
//         )}
//         {vue === "dettes" && <Remboursement user={user} profil={profil} />}
//         {vue === "bande" && !bande && <p>Bande introuvable.</p>}
//         {vue === "bande" && bande && (
//           <>
//             <h2>
//               {bande.libelle || `Bande ${bande.numero}`} ·{" "}
//               {st === "site1" ? "Site 1" : st === "site2" ? "Site 2" : "Clôturée"}
//               {" · jour "}{jourDepuis(bande.dateArrivee) ?? "?"}
//             </h2>
//             <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
//               {ONGLETS.map(([k, l]) => (
//                 <button key={k} type="button" onClick={() => setEcran(k)}
//                   disabled={ecran === k}>{l}</button>
//               ))}
//             </div>
//             {ecran === "mortalite" && <Mortalite user={user} profil={profil} bande={bande} />}
//             {ecran === "depense" && <Depense user={user} profil={profil} bande={bande} />}
//             {ecran === "vente" && <Vente user={user} profil={profil} bande={bande} />}
//             {ecran === "dettes" && <Remboursement user={user} profil={profil} bande={bande} />}
//             {ecran === "bilan" && <Bilan user={user} profil={profil} bande={bande} />}
//             {ecran === "transfert" && <Transfert profil={profil} bande={bande} />}
//             {ecran === "cloture" && <Cloture user={user} profil={profil} bande={bande} />}
//           </>
//         )}
//       </Garde>

//       {erreur && <p style={{ color: "crimson" }}>Erreur : {erreur}</p>}
//       <br />
//       <button onClick={() => signOut(auth)}>Se déconnecter</button>
//     </div>
//   );
// }

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
  ["mortalite", "🐥", "Mortalité"],
  ["depense", "🧾", "Dépense"],
  ["vente", "💰", "Vente"],
  ["bilan", "📊", "Bilan"],
  ["plus", "⋯", "Plus"],
];
const SOUS_PLUS = ["dettes", "transfert", "cloture"];

function useEnLigne() {
  const [en, setEn] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setEn(true);
    const off = () => setEn(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return en;
}

function messageConnexion(code) {
  if (/invalid-credential|wrong-password|user-not-found|invalid-email/.test(code))
    return "E-mail ou mot de passe incorrect.";
  if (/network/.test(code))
    return "Pas de réseau : la première connexion nécessite internet.";
  if (/too-many-requests/.test(code))
    return "Trop d'essais. Patientez quelques minutes.";
  return code;
}

export default function App() {
  const enLigne = useEnLigne();
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
    try { await signInWithEmailAndPassword(auth, email.trim(), mdp); }
    catch (err) { setErreur(messageConnexion(err.code || String(err))); }
  }

  function ouvrir(id) {
    const b = bandes.find((x) => x.id === id);
    setBandeId(id);
    setEcran(b && statutDe(b) === "cloturee" ? "bilan" : "mortalite");
    setVue("bande");
  }
  function accueil() { setVue("accueil"); setBandeId(null); }
  function quitter() { if (window.confirm("Se déconnecter ?")) signOut(auth); }

  if (user === undefined) return <div className="app"><p>Chargement…</p></div>;

  if (!user) {
    return (
      <div className="app">
        <form onSubmit={connexion} className="connexion">
          <img src="/pwa-192x192.png" alt="" width="72" height="72" />
          <h1>Suivi de bandes</h1>
          <label>E-mail
            <input type="email" value={email} autoComplete="email"
              inputMode="email" autoCapitalize="none"
              onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>Mot de passe
            <input type="password" value={mdp} autoComplete="current-password"
              onChange={(e) => setMdp(e.target.value)} />
          </label>
          <button type="submit">Se connecter</button>
          {erreur && <p style={{ color: "crimson" }}>{erreur}</p>}
        </form>
      </div>
    );
  }

  const bande = bandes.find((b) => b.id === bandeId);
  const st = bande ? statutDe(bande) : null;
  const barre = vue === "bande" && !!bande;

  let titre = "Suivi de bandes";
  if (vue === "accueil") titre = `Bonjour ${profil ? profil.nom : ""}`.trim();
  if (vue === "nouvelle") titre = "Nouvelle bande";
  if (vue === "dettes") titre = "Dettes clients";
  if (barre)
    titre = `${bande.libelle || "Bande " + bande.numero} · ` +
      `${st === "site1" ? "Site 1" : st === "site2" ? "Site 2" : "Clôturée"} · ` +
      `J${jourDepuis(bande.dateArrivee) ?? "?"}`;

  return (
    <div className={"app" + (barre ? " avec-barre" : "")}>
      <header className="entete">
        {vue !== "accueil" && (
          <button type="button" className="retour" onClick={accueil}
            aria-label="Retour à l'accueil">‹</button>
        )}
        <div className="titre">{titre}</div>
        <span className="etat">{enLigne ? "🟢" : "🔴 Hors-ligne"}</span>
        <button type="button" className="petit" onClick={quitter}>Quitter</button>
      </header>

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
        {barre && (
          <>
            {SOUS_PLUS.includes(ecran) && (
              <button type="button" className="lien" onClick={() => setEcran("plus")}>
                ‹ Plus
              </button>
            )}
            {ecran === "mortalite" && <Mortalite user={user} profil={profil} bande={bande} />}
            {ecran === "depense" && <Depense user={user} profil={profil} bande={bande} />}
            {ecran === "vente" && <Vente user={user} profil={profil} bande={bande} />}
            {ecran === "bilan" && <Bilan user={user} profil={profil} bande={bande} />}
            {ecran === "plus" && (
              <div>
                <h2>Plus</h2>
                <button type="button" className="gros" onClick={() => setEcran("dettes")}>
                  Dettes clients
                </button>
                <button type="button" className="gros" onClick={() => setEcran("transfert")}>
                  Transfert vers le site 2
                </button>
                <button type="button" className="gros" onClick={() => setEcran("cloture")}>
                  Clôture de la bande
                </button>
              </div>
            )}
            {ecran === "dettes" && <Remboursement user={user} profil={profil} bande={bande} />}
            {ecran === "transfert" && <Transfert profil={profil} bande={bande} />}
            {ecran === "cloture" && <Cloture user={user} profil={profil} bande={bande} />}
          </>
        )}
      </Garde>

      {erreur && <p style={{ color: "crimson" }}>Erreur : {erreur}</p>}

      {barre && (
        <nav className="bas" aria-label="Écrans de la bande">
          <div>
            {ONGLETS.map(([k, icone, libelle]) => {
              const actif = k === "plus" ? ["plus", ...SOUS_PLUS].includes(ecran) : ecran === k;
              return (
                <button key={k} type="button" className={actif ? "actif" : ""}
                  aria-current={actif ? "page" : undefined}
                  onClick={() => setEcran(k)}>
                  <span>{icone}</span>{libelle}
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}