import { NICKNAME_MAX, cleanNickname, nicknameFormatProblem, nicknameLength } from './nicknameRules';

// Nickname input with the rules under it and a live counter. Wrong characters or a name that's
// too long show up while typing; everything else (short, taken, blocked) is reported on submit.
export default function NicknameField({ id, value, onChange, ...inputProps }) {
  const clean = cleanNickname(value);
  const length = nicknameLength(clean);
  const problem = clean && length >= 2 ? nicknameFormatProblem(clean) : '';
  const hintId = `${id}-hint`;
  return (
    <>
      <input
        id={id}
        className="has-hint"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="nickname"
        autoCapitalize="words"
        autoCorrect="off"
        spellCheck={false}
        maxLength={NICKNAME_MAX}
        aria-describedby={hintId}
        aria-invalid={problem ? 'true' : undefined}
        {...inputProps}
      />
      <p id={hintId} className={problem ? 'nickname-hint is-error' : 'nickname-hint'} aria-live="polite">
        <span>
          {problem || (
            <>
              עד {NICKNAME_MAX} תווים: אותיות, מספרים, רווח והסימנים <span className="nickname-signs">- _ =</span>
            </>
          )}
        </span>
        <bdi dir="ltr" className="nickname-count" aria-label={`${length} מתוך ${NICKNAME_MAX} תווים`}>
          {length}/{NICKNAME_MAX}
        </bdi>
      </p>
    </>
  );
}
