// Jellylens' own calls, with the API key.
export function authHeaders(apiKey: string): Record<string, string> {
  return {
    "X-Emby-Token": apiKey,
    Authorization: `MediaBrowser Token="${apiKey}", Client="Jellylens", Device="Server", DeviceId="jellylens-server", Version="1.0"`,
    Accept: "application/json",
  };
}

export async function jfGet<T = unknown>(baseUrl: string, apiKey: string, path: string): Promise<T> {
  const res = await fetch(baseUrl + path, { headers: authHeaders(apiKey) });
  if (!res.ok) throw new Error("Jellyfin returned HTTP " + res.status + " for " + path);
  return res.json();
}

// Has Jellyfin scan all its libraries for new and changed files (the
// dashboard's Scan All Libraries); it runs in the background there.
export async function refreshLibraries(baseUrl: string, apiKey: string): Promise<void> {
  const res = await fetch(baseUrl + "/Library/Refresh", { method: "POST", headers: authHeaders(apiKey) });
  if (!res.ok) throw new Error("Jellyfin returned HTTP " + res.status + " for /Library/Refresh");
}

// Whether Jellyfin's library scan (its scheduled task RefreshLibrary) is
// running, and how far it is (0–100; null while idle).
export async function libraryScan(
  baseUrl: string,
  apiKey: string,
): Promise<{ running: boolean; percent: number | null }> {
  const tasks = await jfGet<{ Key: string; State: string; CurrentProgressPercentage?: number }[]>(
    baseUrl,
    apiKey,
    "/ScheduledTasks?isHidden=false",
  );
  const task = tasks.find((t) => t.Key === "RefreshLibrary");
  const running = task?.State === "Running";
  return { running, percent: running ? (task?.CurrentProgressPercentage ?? 0) : null };
}

export type JellyfinUser = { Id: string; Name: string; Policy?: { IsAdministrator?: boolean; IsDisabled?: boolean } };

// A browser-style client header, no token yet: what a Jellyfin app sends to
// sign a user in.
const LOGIN_CLIENT = 'MediaBrowser Client="Jellylens", Device="Jellylens", DeviceId="jellylens-login", Version="1.0"';

// Checks a Jellyfin username and password. null = wrong credentials (or a
// disabled account); throws if Jellyfin can't be reached. Only the answer is
// kept: the access token is signed out again right away, so sign-ins don't
// pile up as devices in the Jellyfin dashboard.
export async function authenticateUser(
  baseUrl: string,
  username: string,
  password: string,
): Promise<{ id: string; name: string; admin: boolean } | null> {
  const res = await fetch(baseUrl + "/Users/AuthenticateByName", {
    method: "POST",
    headers: { Authorization: LOGIN_CLIENT, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ Username: username, Pw: password }),
  });
  if (res.status === 400 || res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new Error("Jellyfin returned HTTP " + res.status + " for sign-in");
  const body = (await res.json()) as { AccessToken: string; User: JellyfinUser };
  fetch(baseUrl + "/Sessions/Logout", {
    method: "POST",
    headers: { Authorization: LOGIN_CLIENT + ', Token="' + body.AccessToken + '"' },
  }).catch(() => {});
  return { id: body.User.Id, name: body.User.Name, admin: body.User.Policy?.IsAdministrator === true };
}
