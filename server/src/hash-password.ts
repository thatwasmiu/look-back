import { hashPassword } from './auth.js';

const pw = process.argv[2];
if (!pw) {
  console.error('usage: npm run hash-password -w server -- <password>');
  process.exit(1);
}
console.log(await hashPassword(pw));
