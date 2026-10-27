import { CONTACT_EMAIL, INFO_PAGES } from './legal';

const LABELS = { privacy: 'פרטיות', terms: 'תנאי שימוש', accessibility: 'נגישות', credits: 'קרדיטים' };

// A real link to an info page (so it can open in a new tab), handled in-app on a plain click.
export function PageLink({ page, onOpen, children }) {
  return (
    <a
      href={INFO_PAGES[page].path}
      onClick={(event) => {
        if (!onOpen || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        onOpen(page);
      }}
    >
      {children}
    </a>
  );
}

const REPORT_SUBJECT = 'דיווח על בעיה ב־WikiWiki';

// A mail link to the same contact address the info pages use. Hidden while there is no address.
export function reportProblemHref() {
  if (!CONTACT_EMAIL) return '';
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(REPORT_SUBJECT)}`;
}

export function InfoLinks({ onOpen, current = '', className = 'info-links', report = false }) {
  const reportHref = report ? reportProblemHref() : '';
  return (
    <nav className={className} aria-label="מידע על האתר">
      {Object.keys(LABELS).map((key) => (
        key === current ? (
          <span key={key} aria-current="page">{LABELS[key]}</span>
        ) : (
          <PageLink key={key} page={key} onOpen={onOpen}>{LABELS[key]}</PageLink>
        )
      ))}
      {reportHref ? <a href={reportHref}>דיווח על בעיה</a> : null}
    </nav>
  );
}
