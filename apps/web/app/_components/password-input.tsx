'use client';

import { InputHTMLAttributes, useId, useState } from 'react';

type PasswordInputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
};

export default function PasswordInput({ label, id, ...props }: PasswordInputProps) {
  const fallbackId = useId();
  const inputId = id || fallbackId;
  const [show, setShow] = useState(false);

  return (
    <>
      {label ? <span>{label}</span> : null}
      <div className="password-field">
        <input id={inputId} type={show ? 'text' : 'password'} {...props} />
        <button
          type="button"
          className="btn btn-outline password-toggle"
          onClick={() => setShow((prev) => !prev)}
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
    </>
  );
}
