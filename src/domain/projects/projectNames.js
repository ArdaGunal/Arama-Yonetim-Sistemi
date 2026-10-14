export function comparableProjectName(name) {
  return String(name ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR');
}

export function findSameNameProject(name, projects) {
  const compared = comparableProjectName(name);
  if (!compared) return null;
  return projects.find((project) => comparableProjectName(project.name) === compared) || null;
}
