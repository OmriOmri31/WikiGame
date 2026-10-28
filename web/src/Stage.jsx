import ThemeButton from './ThemeButton';

// `corner`: more round icon buttons shown in a row with the theme button (the home screen's
// share and help buttons).
export default function Stage({ children, className = '', corner = null }) {
  return (
    <div className={className ? `stage ${className}` : 'stage'}>
      {corner ? (
        <div className="corner-actions">
          <ThemeButton />
          {corner}
        </div>
      ) : (
        <ThemeButton className="is-corner" />
      )}
      <div className="atmosphere" aria-hidden="true">
        <span className="cloud cloud-a" />
        <span className="cloud cloud-b" />
        <span className="cloud cloud-c" />
      </div>
      <div className="stage-frame" aria-hidden="true">
        <i /><i /><i /><i />
      </div>
      <div className="gradient-blur" aria-hidden="true">
        <div /><div /><div /><div />
      </div>
      {children}
    </div>
  );
}
