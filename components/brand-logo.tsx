import { BRAND_MARK, BRAND_NAME, DELIVERED_BY } from "@/lib/brand";

/** The logo over the map's top-left corner: the GMet crest, the Cumulus name and "Delivered by GMet". */
export function BrandLogo() {
  return (
    <a className="map-brand" href="/" aria-label={`${BRAND_NAME} home`} data-testid="map-brand">
      {/* eslint-disable-next-line @next/next/no-img-element -- a small PNG crest, sized by CSS */}
      <img className="map-brand-mark" src={BRAND_MARK} alt="" width={44} height={44} decoding="async" />
      <span className="map-brand-text">
        <span className="map-brand-name">{BRAND_NAME}</span>
        <span className="map-brand-by">{DELIVERED_BY}</span>
      </span>
    </a>
  );
}
