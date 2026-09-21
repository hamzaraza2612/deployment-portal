import { HttpError } from "../middleware/errorHandler";

/** Extracts a usable hostname from a git remote URL, e.g. "gitlab.techbey.pk". */
export function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    throw new HttpError(400, "That doesn't look like a valid repository URL");
  }
}

/**
 * Normalizes a git host as typed into the Git Credentials form — accepts either a bare
 * hostname ("gitlab.techbey.pk") or a full URL ("https://gitlab.techbey.pk/") and always
 * returns just the lowercase hostname, so a credential saved either way still matches
 * whatever a repository's own URL resolves to via hostFromUrl.
 */
export function normalizeHost(input: string): string {
  const trimmed = input.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    try {
      return new URL(trimmed).hostname.toLowerCase();
    } catch {
      // Not actually a valid URL despite the scheme-like prefix — fall through.
    }
  }
  return trimmed.replace(/\/.*$/, "").toLowerCase();
}
