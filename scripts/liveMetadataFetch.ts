export async function fetchWithNetworkRetries(
  fetcher: typeof fetch,
  input: RequestInfo | URL,
  init?: RequestInit,
  attempts = 3
): Promise<Response> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fetcher(input, init);
    } catch (error) {
      if (!(error instanceof TypeError) || attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }

  throw new Error("Metadata request did not complete.");
}
