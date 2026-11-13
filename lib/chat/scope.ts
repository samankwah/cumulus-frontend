import { GHANA_AREA_NAMES } from "./ghana-places";

/**
 * Weather Skill answers about Ghana only. The scope rule sent with every question keeps the
 * upstream agent on topic; this catches the clear cases first, on our server, so a question about
 * Senegal or Paris gets an instant answer instead of minutes of work on somewhere else.
 *
 * Deliberately narrow: it only fires when a place outside Ghana is named and nothing in the
 * question points at Ghana. "Will rain from Togo reach Ho?" passes and the scope rule shapes it.
 */

/** Lower case, no accents, words separated by single spaces, padded so " word " matches. */
function normalise(text: string): string {
  return ` ${text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
}

const has = (haystack: string, phrase: string) => haystack.includes(` ${phrase} `);

// Sea and river names that contain a country but belong to Ghana's weather story.
const SHARED_FEATURES = ["gulf of guinea", "bight of benin", "volta basin"];

// Generic words that are also Ghana region names: they count only as "<name> region".
const GENERIC_REGIONS = new Set(["central", "eastern", "western", "northern", "north east"]);
const AREA_SUFFIX = /\s+(north|south|east|west|central|municipal|metropolitan|north east|south east|south west|north west)$/i;

const TOWNS = [
  "Takoradi", "Sekondi", "Koforidua", "Aflao", "Navrongo", "Winneba", "Damongo", "Kasoa", "Nalerigu", "Dambai",
  "Goaso", "Tarkwa", "Elmina", "Saltpond", "Akosombo", "Nkawkaw", "Konongo", "Ejura", "Wenchi", "Berekum",
  "Salaga", "Bimbilla", "Tumu", "Lawra", "Paga", "Sandema", "Walewale", "Gushegu", "Atebubu", "Kete Krachi",
  "Akim Oda", "Nsawam", "Dodowa", "Prampram", "Half Assini", "Axim", "Dunkwa", "Bibiani", "Lake Volta",
  "Volta Lake", "Kakum", "Mole",
];

const GHANA_PHRASES: readonly string[] = (() => {
  const phrases = new Set<string>(["ghana", "ghanaian", "ghanaians", "gmet"]);
  for (const name of [...GHANA_AREA_NAMES, ...TOWNS]) {
    const full = normalise(name).trim();
    if (GENERIC_REGIONS.has(full)) {
      phrases.add(`${full} region`);
      continue;
    }
    phrases.add(full);
    // "Nkwanta North" is also asked about as "Nkwanta"; "Ho Municipal" as "Ho".
    const base = normalise(name.replace(AREA_SUFFIX, "")).trim();
    if (base && base !== full && !GENERIC_REGIONS.has(base)) phrases.add(base);
  }
  return [...phrases];
})();

/** Neighbours: named with a cross-border word they are about Ghana's weather, so they pass. */
const NEIGHBOURS = new Set(["Togo", "Burkina Faso", "Côte d'Ivoire", "Ivory Coast", "Togolese", "Burkinabe", "Ivorian"]);
const CROSS_BORDER = /\b(border|borders|from|into|toward|towards|reach|reaches|reaching|cross|crosses|crossing|across)\b/i;

const COUNTRIES = [
  // West and Central Africa first: the likeliest to be asked about.
  "Togo", "Burkina Faso", "Côte d'Ivoire", "Ivory Coast", "Nigeria", "Benin", "Niger", "Mali", "Senegal", "Gambia",
  "Guinea", "Guinea-Bissau", "Sierra Leone", "Liberia", "Mauritania", "Cape Verde", "Cabo Verde", "Cameroon", "Chad",
  "Central African Republic", "Gabon", "Equatorial Guinea", "Congo", "DRC", "Sao Tome",
  // Rest of Africa.
  "Morocco", "Algeria", "Tunisia", "Libya", "Egypt", "Sudan", "South Sudan", "Ethiopia", "Eritrea", "Djibouti",
  "Somalia", "Kenya", "Uganda", "Rwanda", "Burundi", "Tanzania", "Zanzibar", "Angola", "Zambia", "Malawi",
  "Mozambique", "Zimbabwe", "Botswana", "Namibia", "South Africa", "Lesotho", "Eswatini", "Swaziland", "Madagascar",
  "Mauritius", "Seychelles", "Comoros",
  // Elsewhere.
  "United States", "USA", "America", "Canada", "Mexico", "Brazil", "Argentina", "Chile", "Peru", "Colombia",
  "Venezuela", "Ecuador", "Bolivia", "Paraguay", "Uruguay", "Cuba", "Jamaica", "Haiti", "Trinidad",
  "United Kingdom", "UK", "Britain", "England", "Scotland", "Wales", "Ireland", "France", "Germany", "Spain",
  "Portugal", "Italy", "Netherlands", "Belgium", "Switzerland", "Austria", "Sweden", "Norway", "Denmark", "Finland",
  "Iceland", "Poland", "Ukraine", "Russia", "Greece", "Turkey", "Türkiye", "Romania", "Hungary", "Czechia",
  "China", "Japan", "Korea", "India", "Pakistan", "Bangladesh", "Sri Lanka", "Nepal", "Afghanistan", "Iran", "Iraq",
  "Syria", "Lebanon", "Israel", "Palestine", "Jordan", "Saudi Arabia", "Yemen", "Oman", "UAE", "Qatar", "Kuwait",
  "Indonesia", "Malaysia", "Singapore", "Thailand", "Vietnam", "Philippines", "Myanmar", "Cambodia", "Laos",
  "Australia", "New Zealand", "Fiji", "Papua New Guinea",
  // Demonyms that are unambiguous.
  "Togolese", "Burkinabe", "Ivorian", "Nigerian", "Beninese", "Nigerien", "Malian", "Senegalese", "Gambian",
  "Guinean", "Liberian", "Cameroonian", "Kenyan", "Ethiopian", "Egyptian", "Moroccan", "South African",
];

const CITIES = [
  "Lomé", "Ouagadougou", "Bobo-Dioulasso", "Abidjan", "Yamoussoukro", "Bouaké", "Lagos", "Abuja", "Kano", "Ibadan",
  "Port Harcourt", "Cotonou", "Porto-Novo", "Niamey", "Bamako", "Dakar", "Banjul", "Conakry", "Freetown", "Monrovia",
  "Nouakchott", "Douala", "Yaoundé", "N'Djamena", "Libreville", "Kinshasa", "Brazzaville", "Nairobi", "Addis Ababa",
  "Kampala", "Kigali", "Dar es Salaam", "Johannesburg", "Cape Town", "Durban", "Pretoria", "Cairo", "Casablanca",
  "Rabat", "Algiers", "Tunis", "Tripoli", "Khartoum", "Luanda", "Lusaka", "Harare", "Maputo",
  "London", "Paris", "Berlin", "Madrid", "Rome", "Amsterdam", "Brussels", "Moscow", "Istanbul", "Dubai", "Mumbai",
  "Delhi", "Beijing", "Shanghai", "Tokyo", "Seoul", "Bangkok", "Jakarta", "Manila", "Sydney", "Melbourne",
  "New York", "Los Angeles", "Chicago", "Houston", "Miami", "Toronto", "Mexico City", "São Paulo", "Rio de Janeiro",
  "Buenos Aires",
];

const FOREIGN: readonly { name: string; phrase: string }[] = [...COUNTRIES, ...CITIES]
  .map((name) => ({ name, phrase: normalise(name).trim() }))
  // Longest first, so "South Sudan" is reported rather than "Sudan".
  .sort((a, b) => b.phrase.length - a.phrase.length);

export function isGhanaRelated(text: string): boolean {
  const haystack = normalise(text);
  return GHANA_PHRASES.some((phrase) => has(haystack, phrase));
}

/** The place outside Ghana a question is about, or null when it may be about Ghana. */
export function outOfScopePlace(question: string): string | null {
  let haystack = normalise(question);
  for (const feature of SHARED_FEATURES) haystack = haystack.split(` ${feature} `).join(" ");
  const found = FOREIGN.find(({ phrase }) => has(haystack, phrase));
  if (!found) return null;
  if (isGhanaRelated(question)) return null;
  if (NEIGHBOURS.has(found.name) && CROSS_BORDER.test(question)) return null;
  return found.name;
}

/** The instant reply for a question about somewhere else. Markdown. */
export function outOfScopeReply(place: string): string {
  return `Weather Skill covers Ghana only, so I can't answer about **${place}**. Try a question about a place in Ghana, for example *"How much rain fell in Tamale this week?"*`;
}
