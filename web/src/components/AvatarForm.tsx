"use client";

import { useEffect, useRef, useState } from "react";

// The account's profile picture. A real <form method="post"> that works with JavaScript off (the
// server then takes the file as is, up to its cap). With JavaScript on, the chosen photo is cropped
// square and shrunk to `size` px here first, so a phone photo of several MB uploads as tens of KB.

type Props = { src: string | null; initials: string; size: number; maxBytes: number };

// Faces sit high in a portrait photo: a tall photo is cropped from a quarter of the way down, not the middle.
const PORTRAIT_BIAS = 0.25;

async function squarePicture(file: File, size: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const side = Math.min(bitmap.width, bitmap.height);
  const x = (bitmap.width - side) / 2;
  const y = (bitmap.height - side) * (bitmap.height > bitmap.width ? PORTRAIT_BIAS : 0.5);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, x, y, side, side, 0, 0, size, size);
  bitmap.close();
  const encode = (type: string, quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  // Safari cannot encode WebP and quietly hands back a PNG; JPEG is the smaller fallback then.
  const webp = await encode("image/webp", 0.86);
  if (webp?.type === "image/webp") return webp;
  const jpeg = await encode("image/jpeg", 0.88);
  if (!jpeg) throw new Error("could not encode");
  return jpeg;
}

export function AvatarForm({ src, initials, size, maxBytes }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  async function onChoose(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    setProblem(null);
    setPreview(null);
    if (!file) return;
    setBusy(true);
    try {
      const blob = await squarePicture(file, size);
      if (blob.size > maxBytes) throw new Error("too large");
      const ext = blob.type === "image/webp" ? "webp" : "jpg";
      const shrunk = new File([blob], `avatar.${ext}`, { type: blob.type });
      // The form posts the shrunk picture in place of the original.
      const swap = new DataTransfer();
      swap.items.add(shrunk);
      if (input.current) input.current.files = swap.files;
      setPreview(URL.createObjectURL(shrunk));
    } catch {
      if (input.current) input.current.value = "";
      setProblem("That file could not be read as a photo. Choose a JPEG, PNG or WebP image.");
    } finally {
      setBusy(false);
    }
  }

  const shown = preview ?? src;
  return (
    <div className="admin-form avatar-edit">
      <h3>Profile picture</h3>
      <div className="avatar-edit__row">
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element -- a small user picture, already sized by the server
          <img className="avatar-edit__face" src={shown} alt="" width={96} height={96} />
        ) : (
          <span className="avatar-edit__face avatar-edit__face--none" aria-hidden="true">
            {initials}
          </span>
        )}
        <p className="avatar-edit__note">
          {preview
            ? "This is how it will look. Save to use it."
            : src
              ? "Shown on your notes and your name in CK Virtual Lab."
              : "No picture yet. Your initials stand in for it."}
        </p>
      </div>
      <form method="post" action="/account/avatar" encType="multipart/form-data" className="admin-form__step">
        <p>
          <label>
            Choose a photo
            <input
              ref={input}
              name="avatar"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              required
              onChange={onChoose}
              aria-describedby={problem ? "avatar-problem" : undefined}
            />
          </label>
        </p>
        {problem && (
          <p id="avatar-problem" className="avatar-edit__problem">
            {problem}
          </p>
        )}
        <p className="avatar-edit__actions">
          <button type="submit" disabled={busy}>
            {busy ? "Preparing…" : "Save picture"}
          </button>
        </p>
      </form>
      {src && (
        <form method="post" action="/account/avatar">
          <input type="hidden" name="remove" value="1" />
          <button type="submit" className="op-quiet">
            Remove picture
          </button>
        </form>
      )}
    </div>
  );
}
