import type { Translation } from "../i18n";
import { DatenschutzSection, ImpressumSection } from "../components/Legal";

interface LegalPageProps {
  kind: "impressum" | "datenschutz";
  t: Translation;
}

/** Eigenständige (noindex) Rechtsseiten unter /impressum bzw. /datenschutz (+ /de/…). */
export default function LegalPage(props: LegalPageProps) {
  return props.kind === "impressum" ? (
    <ImpressumSection t={props.t} />
  ) : (
    <DatenschutzSection t={props.t} />
  );
}
