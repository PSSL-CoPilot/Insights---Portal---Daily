"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Camera, Check, Trash2, UserRound } from "lucide-react";
import { cn } from "../ui/primitives";
import { initials, photoFromFile, saveProfile, useProfile } from "../profile";

/** Round avatar: the photo when one is set, otherwise the initials of the name. */
export function Avatar({ name, photo, size = 44, className }: { name: string; photo: string | null; size?: number; className?: string }) {
  const ini = initials(name);
  return (
    <span
      className={cn("bs-gradient grid shrink-0 place-items-center overflow-hidden rounded-full font-bold text-white", className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.32) }}
    >
      {photo ? <img src={photo} alt="" className="size-full object-cover" /> : ini || <UserRound style={{ width: size * 0.45, height: size * 0.45 }} />}
    </span>
  );
}

/** Profile button in the top bar: edit the display name and upload a photo. */
export function ProfileMenu() {
  const profile = useProfile();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(profile.name);
  const [photo, setPhoto] = useState<string | null>(profile.photo);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(profile.name);
    setPhoto(profile.photo);
    setError(null);
    requestAnimationFrame(() => input.current?.focus());
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) return setError("Please choose an image file.");
    try {
      setPhoto(await photoFromFile(f));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "This file could not be read as an image.");
    }
  };

  const save = () => {
    if (!saveProfile({ name, photo })) return setError("The browser could not store the photo. Try a smaller image.");
    setOpen(false);
  };

  return (
    <div ref={box} className="relative hidden sm:block">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={profile.name ? `Profile: ${profile.name}` : "Set up your profile"}
        title={profile.name || "Set up your profile"}
        className="block rounded-full shadow-[0_8px_20px_-8px_rgba(242,106,54,0.8)] transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <Avatar name={profile.name} photo={profile.photo} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Your profile"
            initial={{ opacity: 0, y: -8, scale: 0.97, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -6, scale: 0.98, filter: "blur(4px)" }}
            transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
            className="absolute right-0 top-[calc(100%+10px)] z-50 w-[320px] origin-top-right rounded-[24px] border border-line bg-card p-5 shadow-pop"
          >
            <div className="flex items-center gap-4">
              <div className="relative">
                <Avatar name={name} photo={photo} size={72} />
                <button
                  onClick={() => file.current?.click()}
                  aria-label="Upload a photo"
                  className="absolute -bottom-1 -right-1 grid size-8 place-items-center rounded-full border-2 border-card bg-panel text-white transition hover:scale-105"
                >
                  <Camera className="size-3.5" />
                </button>
              </div>
              <div className="min-w-0">
                <div className="truncate text-[15px] font-semibold">{name.trim() || "Your name"}</div>
                <div className="mt-0.5 text-[12px] text-mute">Shown on the Command Center greeting</div>
                {photo && (
                  <button onClick={() => setPhoto(null)} className="mt-1.5 flex items-center gap-1 text-[12px] font-semibold text-mute transition hover:text-bad">
                    <Trash2 className="size-3" /> Remove photo
                  </button>
                )}
              </div>
            </div>
            <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />

            <label className="mt-5 block text-[12px] font-semibold text-mute">
              Name
              <input
                ref={input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && save()}
                placeholder="First and last name"
                maxLength={60}
                className="mt-1.5 h-11 w-full rounded-full border border-line bg-subtle px-4 text-[14px] text-ink outline-none transition focus:border-ink focus:ring-4 focus:ring-brand/20"
              />
            </label>
            {error && <p className="mt-2 text-[12px] font-medium text-bad">{error}</p>}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button onClick={() => setOpen(false)} className="h-10 rounded-full px-4 text-[13px] font-semibold text-mute transition hover:text-ink">Cancel</button>
              <button onClick={save} className="bs-gradient inline-flex h-10 items-center gap-1.5 rounded-full px-5 text-[13px] font-semibold text-white shadow-[0_8px_20px_-10px_rgba(242,106,54,0.9)] transition hover:brightness-95">
                <Check className="size-4" /> Save
              </button>
            </div>
            <p className="mt-3 text-[11px] text-soft">Saved in this browser only.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
