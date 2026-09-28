export function authHeaders(apiKey: string): Record<string, string> {
  return {
    "X-Emby-Token": apiKey,
    Authorization:
      'MediaBrowser Token="' +
      apiKey +
      '", Client="Media Overview", Device="Server", DeviceId="media-overview-backend", Version="1.0"',
    Accept: "application/json",
  };
}

export async function jfGet<T = unknown>(baseUrl: string, apiKey: string, path: string): Promise<T> {
  const res = await fetch(baseUrl + path, { headers: authHeaders(apiKey) });
  if (!res.ok) throw new Error("Jellyfin returned HTTP " + res.status + " for " + path);
  return res.json();
}

export type JellyfinUser = { Id: string; Name: string; Policy?: { IsAdministrator?: boolean; IsDisabled?: boolean } };

// Aggregate fields like ChildCount/RecursiveItemCount are only computed by
// Jellyfin on the per-user /Users/{id}/Items endpoint, not the unscoped
// /Items one. An admin user has access to every library, so resolving one
// admin's id once gets us "all libraries" without needing a picker.
export async function resolveAdminUserId(baseUrl: string, apiKey: string): Promise<string> {
  const users = await jfGet<JellyfinUser[]>(baseUrl, apiKey, "/Users");
  const admin = users.find((u) => u.Policy?.IsAdministrator);
  if (!admin) throw new Error("No administrator user found on this Jellyfin server.");
  return admin.Id;
}

type ServerConfiguration = { PreferredMetadataLanguage?: string; MetadataCountryCode?: string };

// The server's metadata locale as a TMDB language tag ("de-DE"), so TMDB
// search results carry the same titles the library does.
export async function fetchMetadataLanguage(baseUrl: string, apiKey: string): Promise<string> {
  const config = await jfGet<ServerConfiguration>(baseUrl, apiKey, "/System/Configuration");
  const lang = config.PreferredMetadataLanguage || "en";
  const country = config.MetadataCountryCode || "US";
  return lang.includes("-") ? lang : lang + "-" + country;
}

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
  password: string
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
