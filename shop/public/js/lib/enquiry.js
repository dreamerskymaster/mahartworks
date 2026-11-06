// Buyers outside India don't check out online: they write to her, and she quotes shipping and customs by email.
export const ARTIST_EMAIL = "mahasriphoto24@gmail.com";

export function enquirySubject({ title, id, cert }) {
  const ref = [`ID ${id}`, cert ? `Certificate ${cert}` : ""].filter(Boolean).join(", ");
  return `Purchase enquiry: ${title} (${ref})`;
}

export function enquiryBody({ title, id, cert }) {
  return [
    "Hello Mahalakshmi,", "",
    `I would like to buy "${title}" (ID ${id}${cert ? `, Certificate ${cert}` : ""}).`, "",
    "My country: ",
    "My full shipping address (with postcode): ",
    "My phone number (with country code): ", "",
    "Please let me know the total with shipping, and how to pay.", "",
    "Thank you,", "",
  ].join("\n");
}

/** mailto: link with the subject and body filled in (encoded, so line breaks survive). */
export function enquiryMailto(art, email = ARTIST_EMAIL) {
  return `mailto:${email}?subject=${encodeURIComponent(enquirySubject(art))}&body=${encodeURIComponent(enquiryBody(art))}`;
}
