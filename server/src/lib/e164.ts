const DEFAULT_COUNTRY_CALLING_CODE = '91';
const MIN_NATIONAL_DIGITS = 10;
const MAX_NATIONAL_DIGITS = 15;

export function toE164(input: string, defaultCallingCode = DEFAULT_COUNTRY_CALLING_CODE): string {
  const trimmed = input.trim();
  const digitsOnly = trimmed.replace(/[^\d+]/g, '');

  let normalised: string;
  if (digitsOnly.startsWith('00')) {
    normalised = `+${digitsOnly.slice(2)}`;
  } else if (digitsOnly.startsWith('+')) {
    normalised = digitsOnly;
  } else if (defaultCallingCode && digitsOnly.startsWith(defaultCallingCode)) {
    normalised = `+${digitsOnly}`;
  } else {
    normalised = `+${defaultCallingCode}${digitsOnly}`;
  }

  const national = normalised.slice(1);
  if (national.length < MIN_NATIONAL_DIGITS || national.length > MAX_NATIONAL_DIGITS) {
    throw new Error(`not a valid E.164 number: ${input}`);
  }
  return normalised;
}
