import { BRAND } from "@/content/deck-copy";

// The only place the logo assets are referenced. Two renditions of one mark:
//   still  the flat emblem from slide 2 of the logo deck with the stacked wordmark
//          (CK / Coaching / Group), as in the deck's lockup. Used by the header.
//   3D     the Meshy emblem as a GLB, used by the home hero (see EmblemFilm).
// Replacing either file does not require a page edit.
export const MARK_SRC = "/brand/ccg-mark.svg";
// Square, ring-centred copy of the same mark: the hero poster, aligned with the 3D arrival frame.
export const MARK_CENTRED_SRC = "/brand/ccg-mark-centred.svg";
export const EMBLEM_GLB_SRC = "/brand/ccg-emblem.glb";
// The deck's people icon (logo deck, slide 2, image9). A caption icon, not a second logo.
export const PEOPLE_ICON_SRC = "/brand/ccg-people.png";

export function LogoMark(props: { className?: string }) {
  return (
    <span className={["logo-still", props.className].filter(Boolean).join(" ")}>
      <img src={MARK_SRC} alt={BRAND.name} width={37} height={43} />
      <span className="logo-still__name" aria-hidden="true">
        <span>CK</span>
        <span>Coaching</span>
        <span>Group</span>
      </span>
    </span>
  );
}
