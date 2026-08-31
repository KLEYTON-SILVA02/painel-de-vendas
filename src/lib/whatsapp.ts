// Device-aware WhatsApp link building + best-effort image sharing.
//
// WhatsApp has no public API for pre-attaching an arbitrary generated image
// into a chat via URL — only text can be pre-filled that way. So "enviar
// por WhatsApp" here means one of two things, tried in order:
//   1. Web Share API with a file payload (`navigator.share({ files })`) —
//      supported by most mobile browsers and hands the image straight to
//      WhatsApp's native share target, no manual step. Some desktop
//      browsers support it too.
//   2. Fallback: copy the image to the clipboard (already used elsewhere
//      in the app for "Copiar imagem") and open a WhatsApp chat — the user
//      pastes the image in with Ctrl/Cmd+V. On mobile this opens the
//      installed app via wa.me; on desktop it opens web.whatsapp.com
//      directly, skipping the app-first redirect wa.me does on desktop
//      browsers (the behavior the login page's own WhatsApp link needed
//      fixed — see LoginPage.tsx).

/** True for a touch/phone-class device — used to pick between wa.me (opens
 * the installed app) and web.whatsapp.com (skips any native-app redirect,
 * always lands in the browser) for the same WhatsApp number. */
export function isMobileDevice(): boolean {
  const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
  if (uaData?.mobile !== undefined) return uaData.mobile;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

/** Digits only, e.g. "(11) 99999-8888" → "11999998888" — WhatsApp's own
 * link formats require the raw digit string (with country+area code). */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/** A "click to chat" link for the given number (digits with country code)
 * and optional pre-filled text, adapted to the current device: wa.me on
 * mobile (deep-links straight into the installed app), web.whatsapp.com on
 * desktop (always opens the web client, never tries a native-app protocol
 * that may not resolve to anything installed). With no phone number, opens
 * WhatsApp's own contact/chat picker instead of a specific chat. */
export function buildWhatsAppLink(phone: string | null | undefined, text?: string): string {
  const digits = phone ? onlyDigits(phone) : '';
  const query = text ? `?text=${encodeURIComponent(text)}` : '';
  if (isMobileDevice()) {
    return digits ? `https://wa.me/${digits}${query}` : `https://wa.me/${query}`;
  }
  const phoneParam = digits ? `phone=${digits}` : '';
  const textParam = text ? `text=${encodeURIComponent(text)}` : '';
  const params = [phoneParam, textParam].filter(Boolean).join('&');
  return `https://web.whatsapp.com/send${params ? `?${params}` : ''}`;
}

export type ShareOutcome = 'shared' | 'copied-and-opened' | 'failed';

/** Best-effort "send this image to WhatsApp": copies the image and opens a
 * WhatsApp chat for the user to paste it into — a specific group (via its
 * invite link) when the store has one configured, the store's own number
 * otherwise. Group invite links (chat.whatsapp.com/...) have no query-param
 * mechanism to pre-fill text or attach a file the way wa.me/web.whatsapp.com
 * "send" links do for an individual chat — opening one just lands in that
 * group's conversation — so the image is copied to the clipboard first, for
 * the admin to paste in.
 *
 * The native share sheet (`navigator.share` with a file payload) is tried
 * first, but ONLY when no group is configured: the OS share sheet has no
 * way to pre-select a specific WhatsApp group — it just hands the file to
 * whichever app/contact the user picks next — so with a group link set,
 * going through it would skip straight past the one group the store
 * actually wants, which is the bug this order fixes. */
export async function shareImageToWhatsApp(
  blob: Blob,
  filename: string,
  text: string,
  phone: string | null | undefined,
  groupLink?: string | null,
): Promise<ShareOutcome> {
  const file = new File([blob], filename, { type: blob.type || 'image/png' });
  const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
  const hasGroup = !!groupLink?.trim();
  if (!hasGroup && nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
    try {
      await nav.share({ files: [file], text });
      return 'shared';
    } catch {
      // Cancelled by the user, or the share target rejected the file —
      // fall through to the copy+link fallback rather than failing silently.
    }
  }

  try {
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({ [file.type]: file })]);
    }
  } catch {
    // Clipboard write can fail (permissions, unsupported type) — the
    // WhatsApp chat still opens below, just without the image pre-copied.
  }

  const target = hasGroup ? groupLink!.trim() : buildWhatsAppLink(phone, text);
  window.open(target, '_blank', 'noopener,noreferrer');
  return 'copied-and-opened';
}

/** Opens the configured WhatsApp target (the store's group when set, its
 * number chat otherwise) with no file attached — used by flows that share
 * several images at once, where each image is copied to the clipboard
 * individually (there's no clipboard API for multiple images in one write)
 * and pasted into this chat one at a time after it's opened. */
export function openWhatsAppTarget(phone: string | null | undefined, groupLink: string | null | undefined, text?: string): void {
  const target = groupLink?.trim() ? groupLink.trim() : buildWhatsAppLink(phone, text);
  window.open(target, '_blank', 'noopener,noreferrer');
}
