// Shared password rule for every place that sets one: admin signup, and
// ADM-issued collaborator logins (grant/reset). Requires at least one letter
// and one digit on top of the length floor — mirrored server-side in the
// grant-collaborator-login/reset-collaborator-login edge functions (a
// client-side check alone is trivially bypassed by calling the function
// directly), and enforced for admin accounts at the point they're created
// here since Supabase Auth itself has no built-in complexity requirement.
export const PASSWORD_MIN_LENGTH = 8;

const HAS_LETTER = /[A-Za-z]/;
const HAS_DIGIT = /\d/;

export const PASSWORD_HINT = `Mínimo de ${PASSWORD_MIN_LENGTH} caracteres, com letras e números.`;

/** Returns an error message in Portuguese, or null when the password meets
 * the policy. */
export function validatePassword(senha: string): string | null {
  if (senha.length < PASSWORD_MIN_LENGTH) return `A senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  if (!HAS_LETTER.test(senha) || !HAS_DIGIT.test(senha)) return 'A senha precisa ter letras e números.';
  return null;
}
