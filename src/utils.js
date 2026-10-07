export const num = (x) => Number(x) || 0;

export const fcfa = (n) =>
    Math.round(num(n)).toLocaleString("fr-FR") + " F";

// Les anciennes bandes en "en_cours" sont traitées comme des bandes en site 2
export const statutDe = (b) => (b.statut === "en_cours" ? "site2" : b.statut);

const minuit = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// Jours calendaires entre deux horodatages (jour 0 = jour d'installation)
export function joursEntre(debut, fin) {
    if (!debut?.toDate || !fin?.toDate) return null;
    return Math.round((minuit(fin.toDate()) - minuit(debut.toDate())) / 86400000);
}

export function jourDepuis(ts) {
    if (!ts?.toDate) return null;
    return Math.round((minuit(new Date()) - minuit(ts.toDate())) / 86400000);
}

export const dateFr = (ts) =>
    ts?.toDate ? ts.toDate().toLocaleDateString("fr-FR") : "?";