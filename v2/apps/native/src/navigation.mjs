export function allowWorkspaceNavigation(request, origin) {
  if (request.url === 'about:blank') return true;
  try {
    const url = new URL(request.url);
    return url.protocol === 'https:' && !url.username && !url.password && url.origin === origin;
  } catch {
    return false;
  }
}
