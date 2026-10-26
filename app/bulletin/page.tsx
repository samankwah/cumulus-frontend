import type { Metadata } from "next";
import Link from "next/link";

import { BRAND_MARK, BRAND_NAME, DELIVERED_BY } from "@/lib/brand";
import { listDistricts } from "@/lib/bulletin";

export const metadata: Metadata = {
  title: `District bulletins · ${BRAND_NAME}`,
  description: "GMet's 46-day rainfall bulletin for every district of Ghana, ready to print.",
};

export default async function BulletinIndexPage() {
  const districts = await listDistricts();
  const regions = Array.from(new Set(districts.map((district) => district.region)));
  return (
    <main className="bulletin-page">
      <div className="bulletin-sheet bulletin-index">
        <header className="bulletin-header">
          <div className="bulletin-brand">
            {/* eslint-disable-next-line @next/next/no-img-element -- small crest */}
            <img src={BRAND_MARK} alt="" width={48} height={48} />
            <div>
              <strong>{BRAND_NAME.toUpperCase()}</strong>
              <span>{DELIVERED_BY}</span>
            </div>
          </div>
          <Link href="/" className="bulletin-button">
            Open the map
          </Link>
        </header>
        <h1>District bulletins</h1>
        <p className="bulletin-lead">
          The 46-day rainfall outlook and farm advice for each district, from GMet&apos;s latest official forecast. Open a district to read
          it or print it for extension officers and radio.
        </p>
        <nav className="bulletin-regions" aria-label="Regions">
          {regions.map((region) => (
            <a key={region} href={`#${region.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
              {region}
            </a>
          ))}
        </nav>
        {regions.map((region) => (
          <section key={region} id={region.toLowerCase().replace(/[^a-z0-9]+/g, "-")} className="bulletin-region">
            <h2>{region}</h2>
            <ul>
              {districts
                .filter((district) => district.region === region)
                .map((district) => (
                  <li key={district.id}>
                    <Link href={`/bulletin/${district.id}`}>{district.name}</Link>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
