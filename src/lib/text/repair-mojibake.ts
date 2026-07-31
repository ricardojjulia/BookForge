const REPLACEMENTS: Array<[RegExp, string]> = [
  [/â€™/g, "’"],
  [/â€˜/g, "‘"],
  [/â€œ|â€\u009c/g, "“"],
  [/â€\u009d|â€/g, "”"],
  [/â€“/g, "–"],
  [/â€”/g, "—"],
  [/â€¦/g, "…"],
  [/Â /g, " "],
  [/Â/g, ""],
  [/Ã¡/g, "á"],
  [/Ã©/g, "é"],
  [/Ã­/g, "í"],
  [/Ã³/g, "ó"],
  [/Ãº/g, "ú"],
  [/Ã±/g, "ñ"],
  [/Ã/g, "Á"],
  [/Ã‰/g, "É"],
  [/Ã/g, "Í"],
  [/Ã“/g, "Ó"],
  [/Ãš/g, "Ú"],
  [/Ã‘/g, "Ñ"],
  [/Ã¼/g, "ü"],
  [/Ãœ/g, "Ü"],
];

const SUSPICIOUS_PATTERN = /(?:Ã.|Â|â€™|â€˜|â€œ|â€\u009c|â€\u009d|â€“|â€”|â€¦)/;

export function repairCommonMojibake(input: string) {
  let text = input || "";
  if (!SUSPICIOUS_PATTERN.test(text)) {
    return text;
  }

  for (const [pattern, replacement] of REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }

  return text.normalize("NFC");
}
