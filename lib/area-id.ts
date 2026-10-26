/** The slug the partner API and bulletin use for an area: "northern" or "northern--tamale". */
export function areaId(name: string, region?: string | null) {
  return [region, name]
    .filter((part): part is string => Boolean(part))
    .map((part) =>
      part
        .normalize("NFKD")
        .replace(/[^\x00-\x7f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""),
    )
    .join("--");
}
