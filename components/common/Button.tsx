import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'ghost' | 'danger' | 'success' | 'icon';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  className?: string;
  children: React.ReactNode;
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'ux-btn-sm',
  md: '',
  lg: 'ux-btn-lg',
};

/**
 * Unified Button hierarchy (§9): Primary / Secondary / Tertiary / Danger /
 * Success / Ghost / Icon-only — every button gets hover, press, focus,
 * disabled, and loading states. Async actions must use `loading`.
 *
 * Usage:
 *   <Button variant="primary" loading={saving} onClick={save}>Save</Button>
 *   <Button variant="danger" onClick={remove}>Delete</Button>
 */
const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  type = 'button',
  className = '',
  children,
  ...rest
}) => {
  const isDisabled = disabled || loading;
  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-disabled={isDisabled}
      aria-busy={loading}
      data-variant={variant}
      className={`ux-btn ux-btn-${variant} pressable ${SIZES[size]} ${loading ? 'ux-btn-loading' : ''} ${className}`}
      {...rest}
    >
      {loading && <span className="ux-spinner" aria-hidden="true" />}
      {children}
    </button>
  );
};

export default Button;
