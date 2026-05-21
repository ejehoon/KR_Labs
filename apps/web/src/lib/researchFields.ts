export function inferField(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("vision") || name.includes("시각")) {
    return "Computer vision";
  }
  if (lower.includes("data") || name.includes("데이터")) {
    return "Databases";
  }
  if (name.includes("보안") || lower.includes("security")) {
    return "Computer security";
  }
  if (name.includes("학습") || lower.includes("learning")) {
    return "Machine learning";
  }
  return "Uncategorized";
}
