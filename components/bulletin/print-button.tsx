"use client";

/** Opens the browser's print dialog, where "Save as PDF" makes the PDF. */
export function PrintButton() {
  return (
    <button type="button" className="bulletin-button primary" onClick={() => window.print()} data-testid="bulletin-print">
      Print / Save as PDF
    </button>
  );
}
