/**
 * The product name, the agency that delivers it and the partners behind the forecast models. Kept
 * in code (not in the admin), so they read the same everywhere whatever site text is stored.
 */
export const BRAND_NAME = "Cumulus";
export const DELIVERED_BY = "Delivered by GMet";
/** The Ghana Meteorological Agency crest, used as the logo mark. */
export const BRAND_MARK = "/partners/gmet.png";

export type Partner = {
  name: string;
  /** A file under public/partners/. */
  logo: string;
  url: string;
};

export const MODELS_CREDIT = "Forecast models by the Cumulus team";

/** In order of priority, first on the left. */
export const PARTNERS: Partner[] = [
  { name: "Ghana Meteorological Agency", logo: "/partners/gmet.png", url: "https://meteo.gov.gh/" },
  { name: "KNUST", logo: "/partners/knust.png", url: "https://www.knust.edu.gh/" },
  { name: "Rhiza Research", logo: "/partners/rhiza-research.png", url: "https://rhizaresearch.org/" },
  { name: "The Alan Turing Institute", logo: "/partners/alan-turing-institute.svg", url: "https://www.turing.ac.uk/" },
  { name: "University of Leeds", logo: "/partners/university-of-leeds.svg", url: "https://www.leeds.ac.uk/" },
  { name: "University of Cambridge", logo: "/partners/university-of-cambridge.svg", url: "https://www.cam.ac.uk/" },
];
