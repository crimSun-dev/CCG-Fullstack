// The one arrow on the site: a hairline shaft and a head at the emblem's 45 degree angle.
export function Arrow(props: { className?: string }) {
  return (
    <svg className={["arrow", props.className].filter(Boolean).join(" ")} viewBox="0 0 18 12" aria-hidden="true" focusable="false">
      <path d="M0 6H16.5M11.5 1L16.5 6L11.5 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" />
    </svg>
  );
}
