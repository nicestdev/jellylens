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

type JellyfinUser = { Id: string; Policy?: { IsAdministrator?: boolean } };

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
