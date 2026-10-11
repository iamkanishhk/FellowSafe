const DEFAULT_COUNTRY_CALLING_CODE = "91";
const MIN_NATIONAL_DIGITS = 10;
const MAX_NATIONAL_DIGITS = 15;

/**
 * Mirrors the server's E.164 normaliser so a device number is looked up with the
 * same key it will be stored under. Returns `null` for anything that cannot be a
 * valid number, so callers can skip it instead of throwing.
 */
export function toE164(
  input: string,
  defaultCallingCode = DEFAULT_COUNTRY_CALLING_CODE,
): string | null {
  const digitsOnly = input.trim().replace(/[^\d+]/g, "");
  if (digitsOnly.length === 0) return null;

  let normalised: string;
  if (digitsOnly.startsWith("00")) {
    normalised = `+${digitsOnly.slice(2)}`;
  } else if (digitsOnly.startsWith("+")) {
    normalised = digitsOnly;
  } else if (defaultCallingCode && digitsOnly.startsWith(defaultCallingCode)) {
    normalised = `+${digitsOnly}`;
  } else {
    normalised = `+${defaultCallingCode}${digitsOnly}`;
  }

  const national = normalised.slice(1);
  if (national.length < MIN_NATIONAL_DIGITS || national.length > MAX_NATIONAL_DIGITS) {
    return null;
  }
  return normalised;
}
