export type BannerVariant = 'error' | 'warning' | 'info';

interface InfoBannerProps {
  variant: BannerVariant;
  title?: string;
  children: React.ReactNode;
}

const ICONS: Record<BannerVariant, string> = {
  error: '⛔',
  warning: '⚠',
  info: 'ℹ',
};

export function InfoBanner({ variant, title, children }: InfoBannerProps) {
  return (
    <div className={`banner banner--${variant}`} role="alert">
      <span className="banner__icon" aria-hidden="true">
        {ICONS[variant]}
      </span>
      <div>
        {title ? <div className="banner__title">{title}</div> : null}
        <div>{children}</div>
      </div>
    </div>
  );
}
