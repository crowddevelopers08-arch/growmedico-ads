/**
 * Maps free-text TeleCRM pipeline statuses onto the audit sheet's quality columns.
 * Each client's TeleCRM uses its own stage names ("Won - CRM", "Skin-Appt Fixed",
 * "RNR- SOff"…), so matching is by keyword, checked in order — first rule wins.
 */

export type StatusBucket =
  | "visited"
  | "apptBooked"
  | "interested"
  | "rnr"
  | "notInterested"
  | "outOfLocation"
  | "invalid"
  | "fresh";

const RULES: [StatusBucket, RegExp][] = [
  // Booked but did not turn up — counts as a booking, not a visit
  ["apptBooked", /not\s*visit|no\s*show|cancel/],
  ["visited", /\bwon\b|visited|consult(ation)?[\s-]*done|happy patient|revenue|purchase|after won|good review|paid appointment/],
  ["apptBooked", /appointment|appt|booked|scheduled|rescheduled|fixed/],
  ["outOfLocation", /out of (location|station)|long distance|location/],
  ["invalid", /wrong|mistak|not enquiry|existing customer|under age|hindi|recapture|re capture|duplicate|junk|spam|invalid/],
  ["rnr", /rnr|switch(ed)?\s*off|soff|not respond|no response|no contact|disconnected|ring/],
  ["notInterested", /not\s*int(e)?rested|lost|disqualif|curious|not satisf|not good|not interested/],
  ["interested", /interest|call\s*back|qualified|enquiry|inbound|offer|lead/],
];

export function bucketForStatus(status: string | null | undefined): StatusBucket {
  const s = (status ?? "").trim().toLowerCase();
  if (!s || s === "fresh") return "fresh";
  for (const [bucket, re] of RULES) if (re.test(s)) return bucket;
  return "interested";
}
