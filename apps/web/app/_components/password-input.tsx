'use client';

import { InputHTMLAttributes, useId, useState } from 'react';

/**
 * Props for the PasswordInput component.
 * It extends the standard HTML input attributes and adds an optional label.
 */
type PasswordInputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
};

/**
 * A password input component that includes a button to toggle password visibility.
 * It enhances the standard password field with a "Show/Hide" functionality.
 */
export default function PasswordInput({ label, id, ...props }: PasswordInputProps) {
  const fallbackId = useId();
  const inputId = id || fallbackId;
  // State to manage whether the password text is visible.
  const [show, setShow] = useState(false);

  return (
    <>
      {/* Optional label for the input field */}
      {label ? <span>{label}</span> : null}
      <div className="password-field">
        {/* The password input itself */}
        <input id={inputId} type={show ? 'text' : 'password'} {...props} />
        {/* The button to toggle password visibility */}
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
