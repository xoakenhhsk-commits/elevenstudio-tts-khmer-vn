interface BrandLogoProps {
  darkMode: boolean;
  size?: 'sm' | 'md' | 'lg';
  showTagline?: boolean;
  onClick?: () => void;
}

export function BrandLogo({
  darkMode,
  size = 'md',
  showTagline = false,
  onClick,
}: BrandLogoProps) {
  const boxSize =
    size === 'sm' ? 'w-7 h-7' : size === 'lg' ? 'w-10 h-10' : 'w-8.5 h-8.5';
  const textSize =
    size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-xl' : 'text-[15px]';

  return (
    <div
      onClick={onClick}
      className={`inline-flex items-center gap-2.5 select-none ${
        onClick ? 'cursor-pointer group' : ''
      }`}
    >
      <div
        className={`${boxSize} rounded-xl flex items-center justify-center shadow-xs transition-transform group-hover:scale-[1.03] ${
          darkMode ? 'bg-white text-zinc-950' : 'bg-zinc-950 text-white'
        }`}
      >
        <svg
          viewBox="0 0 28 28"
          fill="none"
          className="w-[68%] h-[68%]"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect x="4" y="6" width="14" height="3.6" rx="1.8" fill="currentColor" />
          <circle cx="22" cy="7.8" r="2.1" className="fill-emerald-500" />
          <rect x="4" y="12.2" width="20" height="3.6" rx="1.8" fill="currentColor" />
          <rect x="4" y="18.4" width="11" height="3.6" rx="1.8" fill="currentColor" />
        </svg>
      </div>

      <div>
        <div className={`font-display font-bold tracking-tight leading-none ${textSize}`}>
          Kroma<span className="font-medium opacity-75">Forms</span>
        </div>
        {showTagline && (
          <div
            className={`text-[11px] mt-0.5 font-medium ${
              darkMode ? 'text-zinc-400' : 'text-zinc-500'
            }`}
          >
            Public Survey Studio
          </div>
        )}
      </div>
    </div>
  );
}
