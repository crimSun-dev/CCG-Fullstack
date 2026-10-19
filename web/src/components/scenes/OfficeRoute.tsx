// A drawn route between the two offices: not a map (the brief rules out map embeds), just the
// relationship. Head office bottom left, Seoul top right, joined by the emblem's dashed guide.
export function OfficeRoute({ from, to }: { from: string; to: string }) {
  return (
    <figure className="route" aria-hidden="true">
      <svg viewBox="0 0 600 260" preserveAspectRatio="xMidYMid meet">
        <path className="route__arc" d="M70 210 C 220 40, 400 20, 530 60" pathLength={1} />
        <path className="route__guide" d="M70 210 H 530" />
        <circle className="route__ring" cx="70" cy="210" r="22" />
        <circle className="route__dot" cx="70" cy="210" r="7" />
        <circle className="route__ring route__ring--b" cx="530" cy="60" r="22" />
        <circle className="route__dot route__dot--b" cx="530" cy="60" r="7" />
        <text x="70" y="250" textAnchor="middle">{from}</text>
        <text x="530" y="110" textAnchor="middle">{to}</text>
      </svg>
    </figure>
  );
}
