const LINK_TLDS = [
  "com", "net", "org", "info", "biz", "io", "co", "in", "me", "ly",
  "app", "dev", "ai", "gg", "tv", "cc", "xyz", "online", "live",
  "site", "shop", "store", "link", "uk", "us", "ru", "pk", "ae",
];

const LINK_TLD_PATTERN = LINK_TLDS.join("|");

function hasPhoneNumber(text) {
  const value = String(text || "").replace(/[０-９]/g, (digit) =>
    String(digit.charCodeAt(0) - 0xff10)
  );
  const compact = value.replace(/(?<=\d)[\s.\-()/]+(?=\d)/g, "");
  return /\d{10,}/.test(compact);
}

function hasLink(text) {
  const value = String(text || "");
  if (/https?:\/\/|ftp:\/\/|www\./i.test(value)) return true;
  const domain = new RegExp(
    `\\b(?:[a-z0-9-]+\\.)+(?:${LINK_TLD_PATTERN})\\b`,
    "i"
  );
  if (domain.test(value)) return true;
  const hiddenDot = new RegExp(
    `\\b[a-z0-9-]+\\s*(?:\\[\\s*\\.\\s*\\]|\\(\\s*dot\\s*\\)|\\bdot\\b)\\s*(?:${LINK_TLD_PATTERN})\\b`,
    "i"
  );
  return hiddenDot.test(value);
}

function blockedShareReason(text) {
  const value = String(text || "");
  if (!value.trim()) return "";
  const phone = hasPhoneNumber(value);
  const link = hasLink(value);
  if (phone && link) return "Phone numbers and links cannot be sent in chat.";
  if (phone) return "Phone numbers cannot be sent in chat.";
  if (link) return "Links cannot be sent in chat.";
  return "";
}

module.exports = { blockedShareReason, hasPhoneNumber, hasLink };
