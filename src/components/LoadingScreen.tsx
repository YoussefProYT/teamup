// src/components/LoadingScreen.tsx

export function LoadingScreen() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-[#1e1e2e] overflow-hidden relative">

      {/* dot grid bg */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(rgba(203,166,247,.06) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />

      {/* bg glow */}
      <div
        className="absolute pointer-events-none animate-pulse"
        style={{
          width: 280, height: 280, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(203,166,247,.12) 0%, transparent 65%)',
          top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        }}
      />

      <div className="flex flex-col items-center gap-0 relative z-10">

        {/* Shield logo */}
        <div
          className="mb-7"
          style={{ animation: 'teamup-breathe 3s ease-in-out infinite' }}
        >
          <svg width="110" height="125" viewBox="0 0 110 125" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="tsg" x1="55" y1="4" x2="55" y2="118" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#313244"/>
                <stop offset="100%" stopColor="#181825"/>
              </linearGradient>
              <linearGradient id="trim" x1="55" y1="4" x2="55" y2="118" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#cba6f7"/>
                <stop offset="55%" stopColor="#89b4fa"/>
                <stop offset="100%" stopColor="#74c7ec"/>
              </linearGradient>
              <radialGradient id="tig" cx="50%" cy="35%" r="60%">
                <stop offset="0%" stopColor="#cba6f7" stopOpacity=".16"/>
                <stop offset="100%" stopColor="#cba6f7" stopOpacity="0"/>
              </radialGradient>
            </defs>

            {/* Shield fill */}
            <path
              d="M55 4 L7 20 L7 56 C7 88 28 108 55 120 C82 108 103 88 103 56 L103 20 Z"
              fill="url(#tsg)" stroke="url(#trim)" strokeWidth="2.2"
            />
            {/* Inner glow */}
            <path
              d="M55 4 L7 20 L7 56 C7 88 28 108 55 120 C82 108 103 88 103 56 L103 20 Z"
              fill="url(#tig)"
            />
            {/* Inner rim */}
            <path
              d="M55 12 L14 26 L14 56 C14 84 33 102 55 113 C77 102 96 84 96 56 L96 26 Z"
              fill="none" stroke="#45475a" strokeWidth=".8" opacity=".6"
            />
            {/* Center dashed line */}
            <line x1="55" y1="22" x2="55" y2="108" stroke="#45475a" strokeWidth=".6" opacity=".25" strokeDasharray="3 4"/>

            {/* Sparkles */}
            <circle cx="22" cy="22" r="2" fill="#a6e3a1" opacity=".6"/>
            <circle cx="88" cy="24" r="1.8" fill="#f9e2af" opacity=".55"/>
            <circle cx="55" cy="14" r="1.5" fill="#cba6f7" opacity=".5"/>
          </svg>
        </div>

        {/* App name */}
        <div
          className="mb-1.5"
          style={{ animation: 'teamup-fadein .6s ease .1s both' }}
        >
          <span
            className="text-3xl font-medium tracking-tight"
            style={{
              background: 'linear-gradient(120deg,#cba6f7 20%,#89b4fa 80%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            Team UP
          </span>
        </div>

        {/* Tagline */}
        <div
          className="mb-9"
          style={{ animation: 'teamup-fadein .6s ease .2s both' }}
        >
          <span className="text-xs text-[#6c7086] tracking-widest">
            unite · connect · communicate
          </span>
        </div>

        {/* Progress bar */}
        <div
          className="w-48 mb-4"
          style={{ animation: 'teamup-fadein .6s ease .3s both' }}
        >
          <div className="w-full h-[2.5px] bg-[#313244] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                background: 'linear-gradient(90deg,#cba6f7,#89b4fa,#a6e3a1)',
                animation: 'teamup-bar 2.5s cubic-bezier(.4,0,.2,1) forwards',
              }}
            />
          </div>
        </div>

        {/* Dots */}
        <div
          className="flex gap-1.5 items-center"
          style={{ animation: 'teamup-fadein .6s ease .38s both' }}
        >
          <div className="w-[5px] h-[5px] rounded-full bg-[#cba6f7]" style={{ animation: 'teamup-dot 1.4s ease-in-out 0s infinite' }}/>
          <div className="w-[5px] h-[5px] rounded-full bg-[#89b4fa]" style={{ animation: 'teamup-dot 1.4s ease-in-out .22s infinite' }}/>
          <div className="w-[5px] h-[5px] rounded-full bg-[#a6e3a1]" style={{ animation: 'teamup-dot 1.4s ease-in-out .44s infinite' }}/>
        </div>
      </div>

      {/* Keyframes */}
      <style>{`
        @keyframes teamup-fadein {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes teamup-breathe {
          0%,100% { transform: scale(1); }
          50%      { transform: scale(.972); }
        }
        @keyframes teamup-bar {
          0%   { width: 0%; }
          65%  { width: 88%; }
          100% { width: 100%; }
        }
        @keyframes teamup-dot {
          0%,80%,100% { transform: scale(0); opacity: 0; }
          40%         { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
