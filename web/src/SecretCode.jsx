import { useEffect, useRef, useState } from 'react';

// Test site only (loaded behind __WIKIGAME_TEST__): five taps on the game header within two
// seconds of each other open a code prompt, and the right code jumps to the goal page.
// The code comes from WIKIGAME_SECRET_CODE, baked in only for test builds. Without it, no code opens it.
const SECRET_CODE = __WIKIGAME_SECRET_CODE__;

export default function SecretCode({ targetRef, resetKey, onUnlock }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const taps = useRef({ count: 0, last: 0 });

  useEffect(() => {
    setOpen(false);
    setValue('');
    taps.current = { count: 0, last: 0 };
  }, [resetKey]);

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return undefined;
    const onClick = (event) => {
      if (event.target.closest('button, a, input')) return;
      const now = Date.now();
      const previous = taps.current;
      const count = now - previous.last < 2000 ? previous.count + 1 : 1;
      taps.current = { count, last: now };
      if (count >= 5) {
        taps.current = { count: 0, last: 0 };
        setOpen(true);
      }
    };
    target.addEventListener('click', onClick);
    return () => target.removeEventListener('click', onClick);
  });

  function submit(event) {
    event.preventDefault();
    const code = value;
    setValue('');
    setOpen(false);
    if (SECRET_CODE && code === SECRET_CODE) onUnlock();
  }

  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onClick={() => setOpen(false)}>
      <form
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="קוד סודי"
        onClick={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <label htmlFor="secret-code">הזן קוד סודי:</label>
        <input
          id="secret-code"
          type="password"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="קוד סודי"
          autoFocus
        />
        <button className="primary" type="submit">שלח</button>
      </form>
    </div>
  );
}
