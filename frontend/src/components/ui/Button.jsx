import React from 'react';

/**
 * <Button> — unified button using --ds-* design system tokens.
 *
 * Variants: primary | secondary | ghost | danger
 * Sizes:    sm | md | lg
 *
 * Replaces every inline `<button style={{...}}>` scattered across tabs that
 * created 3+ different "primary" button styles (gold fill in Agentes, green
 * fill in Earnings/Currency, outline in Macro).
 */
const SIZE_STYLES = {
  sm: { padding: '4px 10px', fontSize: 'var(--ds-text-sm)', borderRadius: 'var(--ds-radius-md)' },
  md: { padding: '8px 14px', fontSize: 'var(--ds-text-sm)', borderRadius: 'var(--ds-radius-md)' },
  lg: { padding: '12px 20px', fontSize: 'var(--ds-text-md)', borderRadius: 'var(--ds-radius-lg)' },
};

const VARIANT_STYLES = {
  primary: {
    background: 'var(--ds-accent)',
    color: '#000',
    border: '1px solid var(--ds-accent)',
    fontWeight: 'var(--ds-font-bold)',
    boxShadow: 'var(--ds-shadow-sm)',
  },
  secondary: {
    background: 'var(--ds-accent-dim)',
    color: 'var(--ds-accent)',
    border: '1px solid var(--ds-accent)',
    fontWeight: 'var(--ds-font-bold)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border)',
    fontWeight: 'var(--ds-font-medium)',
  },
  danger: {
    background: 'var(--ds-danger-dim)',
    color: 'var(--ds-danger)',
    border: '1px solid var(--ds-danger)',
    fontWeight: 'var(--ds-font-bold)',
  },
};

const DISABLED_STYLES = {
  background: 'var(--border)',
  color: 'var(--text-tertiary)',
  cursor: 'default',
  opacity: 0.6,
  boxShadow: 'none',
};

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon = null,
  fullWidth = false,
  onClick,
  type = 'button',
  title,
  style: styleOverride = {},
  ...rest
}) {
  const sizeStyle = SIZE_STYLES[size] || SIZE_STYLES.md;
  const variantStyle = VARIANT_STYLES[variant] || VARIANT_STYLES.primary;
  const isDisabled = disabled || loading;
  const finalStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--ds-space-2)',
    fontFamily: 'var(--ds-font-body)',
    cursor: isDisabled ? 'default' : 'pointer',
    transition: 'all var(--ds-transition-fast)',
    whiteSpace: 'nowrap',
    width: fullWidth ? '100%' : 'auto',
    lineHeight: 1.2,
    ...sizeStyle,
    ...variantStyle,
    ...(isDisabled ? DISABLED_STYLES : {}),
    ...styleOverride,
  };
  return (
    <button
      type={type}
      disabled={isDisabled}
      onClick={onClick}
      title={title}
      style={finalStyle}
      onMouseEnter={(e) => {
        if (!isDisabled && variant === 'primary') {
          e.currentTarget.style.background = 'var(--ds-accent-hover)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isDisabled && variant === 'primary') {
          e.currentTarget.style.background = 'var(--ds-accent)';
        }
      }}
      {...rest}
    >
      {loading ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--ds-space-2)' }}>
          <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid currentColor', borderRightColor: 'transparent', borderRadius: '50%', animation: 'ar-spin 0.8s linear infinite' }} />
          {typeof children === 'string' ? children : 'Cargando...'}
        </span>
      ) : (
        <>
          {icon && <span style={{ display: 'inline-flex', alignItems: 'center' }}>{icon}</span>}
          {children}
        </>
      )}
    </button>
  );
}
