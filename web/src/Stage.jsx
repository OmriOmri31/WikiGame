import ThemeButton from './ThemeButton';

export default function Stage({ children, className = '' }) {
  return (
    <div className={className ? `stage ${className}` : 'stage'}>
      <ThemeButton className="is-corner" />
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
